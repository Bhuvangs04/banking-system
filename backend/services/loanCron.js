const cron = require("node-cron");
const db = require("../dataBase/MySQL");
const { recordJournalEntry } = require("./ledger");
const { logAudit } = require("./audit");

const processLoans = async () => {
  let connection;
  try {
    console.log("[LoanCron] Starting daily loan processing...");
    connection = await db.getConnection();

    // Fetch System Settings
    const [settingsRows] = await connection.query("SELECT SettingKey, SettingValue FROM SystemSettings");
    const settings = {};
    settingsRows.forEach(row => {
      settings[row.SettingKey] = parseFloat(row.SettingValue);
    });

    const LATE_FEE_FIXED = settings['LATE_FEE_FIXED_AMOUNT'] || 500;
    const LATE_FEE_PERCENTAGE = settings['LATE_FEE_PERCENTAGE'] || 2.0;

    // Fetch active/overdue loans where due date is today or earlier
    const [dueLoans] = await connection.query(`
      SELECT l.*, c.Balance 
      FROM Loan l
      JOIN Customer c ON l.AccountNumber = c.AccountNumber
      WHERE l.RepaymentStatus IN ('Active', 'Overdue')
      AND DATE(l.NextRepaymentDueDate) <= CURDATE()
    `);

    console.log(`[LoanCron] Found ${dueLoans.length} loans due for EMI payment.`);

    for (const loan of dueLoans) {
      const emiAmount = parseFloat(loan.MonthlyEMI);
      const existingLateFee = parseFloat(loan.LateFee) || 0;
      const totalDue = emiAmount + existingLateFee;
      const currentBalance = parseFloat(loan.Balance);

      if (currentBalance >= totalDue) {
        // --- SUCCESSFUL DEDUCTION ---
        await connection.beginTransaction();
        try {
          // 1. Deduct from customer balance
          await connection.query(
            "UPDATE Customer SET Balance = Balance - ? WHERE AccountNumber = ?",
            [totalDue, loan.AccountNumber]
          );

          // 2. Add to transaction history
          const [txResult] = await connection.query(
            `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, Description, TransactionStatus)
             VALUES (?, 'EMI Deduction', ?, ?, 'SUCCESS')`,
            [loan.AccountNumber, totalDue, `Auto-deduction for Loan #${loan.LoanID} EMI`]
          );

          // 3. Update Loan record
          const newAmountRepaid = parseFloat(loan.AmountRepaid) + totalDue;
          const totalPayable = parseFloat(loan.TotalPayableAmount);
          const isPaidOff = newAmountRepaid >= totalPayable;
          const newStatus = isPaidOff ? 'Paid' : 'Active';

          await connection.query(
            `UPDATE Loan 
             SET AmountRepaid = ?, LateFee = 0, RepaymentStatus = ?, 
                 NextRepaymentDueDate = DATE_ADD(NextRepaymentDueDate, INTERVAL 1 MONTH)
             WHERE LoanID = ?`,
            [newAmountRepaid, newStatus, loan.LoanID]
          );

          // 4. Record Journal Entry
          await recordJournalEntry(connection, {
            transactionType: "EMI Payment",
            description: `EMI auto-deduction for Loan #${loan.LoanID}`,
            referenceId: `TXN${txResult.insertId}`,
            entries: [
              { accountName: "Liability: Customer Deposits", subAccountNumber: loan.AccountNumber, entryType: "Debit", amount: totalDue },
              { accountName: "Asset: Loan Receivables", subAccountNumber: null, entryType: "Credit", amount: totalDue }
            ]
          });

          await connection.commit();
          console.log(`[LoanCron] Successfully processed EMI for Loan #${loan.LoanID}`);
        } catch (err) {
          await connection.rollback();
          console.error(`[LoanCron] Error processing EMI for Loan #${loan.LoanID}:`, err);
        }
      } else {
        // --- FAILED DEDUCTION (INSUFFICIENT FUNDS) ---
        // Apply late fee
        await connection.beginTransaction();
        try {
          const newLateFee = LATE_FEE_FIXED + (emiAmount * (LATE_FEE_PERCENTAGE / 100));
          const totalAccumulatedLateFee = existingLateFee + newLateFee;

          await connection.query(
            `UPDATE Loan SET LateFee = ?, RepaymentStatus = 'Overdue' WHERE LoanID = ?`,
            [totalAccumulatedLateFee, loan.LoanID]
          );

          await connection.commit();
          console.log(`[LoanCron] Insufficient funds for Loan #${loan.LoanID}. Applied late fee ₹${newLateFee.toFixed(2)}. Status set to Overdue.`);

          // Log audit
          logAudit({
            actorType: 'system', action: 'LATE_FEE_APPLIED',
            category: 'Financial', entityType: 'Loan', entityId: loan.LoanID.toString(),
            description: `Auto-deduction failed due to insufficient funds. Applied late fee of ₹${newLateFee.toFixed(2)}.`
          });
        } catch (err) {
          await connection.rollback();
          console.error(`[LoanCron] Error applying late fee for Loan #${loan.LoanID}:`, err);
        }
      }
    }

    console.log("[LoanCron] Daily loan processing complete.");
  } catch (error) {
    console.error("[LoanCron] Critical error during loan processing:", error);
  } finally {
    if (connection) connection.release();
  }
};

const startLoanCron = () => {
  // Run every day at midnight (0 0 * * *)
  cron.schedule('0 0 * * *', () => {
    processLoans();
  });
  console.log("[LoanCron] Automated EMI and Late Fee cron job scheduled.");
};

module.exports = { startLoanCron, processLoans };
