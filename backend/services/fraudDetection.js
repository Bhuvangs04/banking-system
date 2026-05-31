const db = require("../dataBase/MySQL");
const { logAudit } = require("./audit");

const MAX_DEPOSITS_PER_DAY = 10;
const MAX_TELLER_AMOUNT_PER_DAY = 1000000; // 10 Lakhs

/**
 * Evaluates a deposit for velocity limits and fraud rules.
 * @param {string} accountNumber - The customer account
 * @param {number} amount - Deposit amount
 * @param {number} adminId - The ID of the teller/admin
 * @returns {object} { allowed: boolean, reason?: string, requiresHold: boolean, requiresApprovalCount: number }
 */
const evaluateDeposit = async (accountNumber, amount, adminId) => {
  const connection = await db.getConnection();
  try {
    // Check 1: Velocity Check - Max deposits per day per teller
    const [tellerCount] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM DepositHistory 
      WHERE DepositedBy = ? AND DATE(DepositTime) = CURDATE()
    `, [adminId]);
    if (tellerCount[0].count >= MAX_DEPOSITS_PER_DAY) {
      return { allowed: false, reason: "Velocity limit exceeded: Maximum 10 deposits per day allowed." };
    }

    // Check 2: Velocity Check - Max amount per day per teller
    const [tellerAmount] = await connection.query(`
      SELECT SUM(DepositAmount) as total 
      FROM DepositHistory 
      WHERE DepositedBy = ? AND DATE(DepositTime) = CURDATE()
    `, [adminId]);
    const totalToday = parseFloat(tellerAmount[0].total) || 0;
    if (totalToday + amount > MAX_TELLER_AMOUNT_PER_DAY) {
      return { allowed: false, reason: `Velocity limit exceeded: Maximum ₹10,00,000 per day per teller. Current: ₹${totalToday}` };
    }

    // Check 3: Fraud Rule - Deposit > 10x account average over last 30 days
    const [avgDeposit] = await connection.query(`
      SELECT AVG(DepositAmount) as avgAmt 
      FROM DepositHistory 
      WHERE AccountNumber = ? AND DepositTime >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, [accountNumber]);
    const average = parseFloat(avgDeposit[0].avgAmt) || 0;
    let isAnomalous = false;
    if (average > 0 && amount > average * 10) {
      isAnomalous = true;
    }

    // Check 4: Fraud Rule - Deposit > ₹10,00,000 triggers HOLD
    const isHighValueHold = amount > 1000000;

    // Check 5: Rate Limiting - Multiple deposits within 1 minute
    const [recentDeposits] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM DepositHistory 
      WHERE AccountNumber = ? AND DepositTime >= DATE_SUB(NOW(), INTERVAL 1 MINUTE)
    `, [accountNumber]);
    if (recentDeposits[0].count >= 2) { // 3rd deposit in 1 minute
      return { allowed: false, reason: "Fraud rule: Multiple deposits within 1 minute detected." };
    }

    let requiresHold = isHighValueHold || isAnomalous;
    let requiresApprovalCount = 0;

    // Determine Maker-Checker workflow based on amount
    if (amount > 500000) {
      requiresApprovalCount = 2; // e.g. Manager + Branch Manager
    } else if (amount > 50000) {
      requiresApprovalCount = 1; // e.g. Manager
    }

    if (isAnomalous && requiresApprovalCount === 0) {
       requiresApprovalCount = 1; // Force approval if anomalous
    }

    return {
      allowed: true,
      requiresHold,
      requiresApprovalCount,
      flags: isAnomalous ? ["10x Average Deposit"] : []
    };

  } finally {
    connection.release();
  }
};

module.exports = { evaluateDeposit };
