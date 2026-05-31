const db = require("../dataBase/MySQL");

/**
 * Records a balanced double-entry accounting Journal Entry and its Ledger lines.
 * Must be executed within a database transaction.
 * 
 * @param {object} connection - The active connection with transaction in progress
 * @param {object} params
 * @param {string} params.transactionType - Enum: 'Deposit', 'Withdrawal', 'Transfer', 'Loan Payout', 'Loan Repayment', 'Reversal'
 * @param {string} params.description - A brief explanation of the entry
 * @param {string} [params.referenceId] - Associated reference ID (e.g. TXN123)
 * @param {Array<object>} params.entries - The double-entry lines
 * @param {string} params.entries[].accountName - e.g. 'Asset: Bank Cash', 'Liability: Customer Deposits'
 * @param {string} [params.entries[].subAccountNumber] - Linked customer account number for sub-ledger tracking
 * @param {string} params.entries[].entryType - 'Debit' or 'Credit'
 * @param {number|string} params.entries[].amount - Amount of this movement
 */
async function recordJournalEntry(connection, { transactionType, description, referenceId, entries }) {
  let debitSum = 0;
  let creditSum = 0;

  for (const entry of entries) {
    const amt = parseFloat(entry.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error(`Invalid entry amount: ${entry.amount}`);
    }
    if (entry.entryType === "Debit") {
      debitSum += amt;
    } else if (entry.entryType === "Credit") {
      creditSum += amt;
    } else {
      throw new Error(`Invalid entry type: ${entry.entryType}. Must be Debit or Credit.`);
    }
  }

  // To prevent floating point arithmetic inaccuracies, round to 2 decimals
  debitSum = parseFloat(debitSum.toFixed(2));
  creditSum = parseFloat(creditSum.toFixed(2));

  if (Math.abs(debitSum - creditSum) > 0.01) {
    throw new Error(`Double-entry bookkeeping mismatch: Debits (₹${debitSum}) must equal Credits (₹${creditSum})`);
  }

  // Insert Journal entry
  const [journalResult] = await connection.query(
    "INSERT INTO JournalEntry (TransactionType, Description, ReferenceID) VALUES (?, ?, ?)",
    [transactionType, description, referenceId || null]
  );
  const journalId = journalResult.insertId;

  // Insert Ledger lines
  for (const entry of entries) {
    // Get account ID
    const [accRows] = await connection.query(
      "SELECT AccountID, AccountType FROM LedgerAccount WHERE AccountName = ?",
      [entry.accountName]
    );

    if (accRows.length === 0) {
      throw new Error(`Ledger account not found: ${entry.accountName}`);
    }

    const { AccountID: accountId, AccountType: accType } = accRows[0];
    const amt = parseFloat(entry.amount);
    let balanceAfter = 0.00;

    if (entry.accountName === "Liability: Customer Deposits" && entry.subAccountNumber) {
      // For customer sub-ledger, balance is the customer's actual account balance (which is updated before/during this transaction)
      const [custRows] = await connection.query(
        "SELECT Balance FROM Customer WHERE AccountNumber = ?",
        [entry.subAccountNumber]
      );
      if (custRows.length > 0) {
        balanceAfter = parseFloat(custRows[0].Balance);
      }
    } else {
      // For general bank accounts, get the last balance of this account and apply the debit/credit rules
      const [lastEntry] = await connection.query(
        "SELECT BalanceAfter FROM LedgerEntry WHERE AccountID = ? ORDER BY EntryID DESC LIMIT 1",
        [accountId]
      );
      const lastBal = lastEntry.length > 0 ? parseFloat(lastEntry[0].BalanceAfter) : 0.00;

      // Asset and Expense: Debit increases (+), Credit decreases (-)
      // Liability, Equity, and Revenue: Credit increases (+), Debit decreases (-)
      const isAssetOrExpense = accType === "Asset" || accType === "Expense";
      if (entry.entryType === "Debit") {
        balanceAfter = isAssetOrExpense ? lastBal + amt : lastBal - amt;
      } else {
        balanceAfter = isAssetOrExpense ? lastBal - amt : lastBal + amt;
      }
    }

    balanceAfter = parseFloat(balanceAfter.toFixed(2));

    await connection.query(
      `INSERT INTO LedgerEntry (JournalID, AccountID, SubAccountNumber, EntryType, Amount, BalanceAfter)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [journalId, accountId, entry.subAccountNumber || null, entry.entryType, amt, balanceAfter]
    );
  }
}

module.exports = {
  recordJournalEntry
};
