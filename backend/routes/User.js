const { Router } = require("express");
const route = Router();
const PDFDocument = require("pdfkit");
const db = require("../dataBase/MySQL");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createTokenForUser } = require("../services/auth");
const verifyToken = require("../middleware/auth");

// Function to generate a unique account number
const generateAccountNumber = async () => {
  let accountNumber;
  let isUnique = false;
  while (!isUnique) {
    accountNumber = crypto.randomInt(100000000000, 999999999999).toString();
    const [rows] = await db.query(
      "SELECT * FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );
    if (rows.length === 0) {
      isUnique = true;
    }
  }

  return accountNumber;
};

// Route to create a new customer account
route.post("/createAccount", upload.none(), async (req, res) => {
  try {
    const {
      customerName,
      AccountType,
      customerPhone,
      customerEmail,
      customerAddress,
      customerCity,
      CustomerPassword,
    } = req.body;

    if (
      !customerName ||
      !AccountType ||
      !customerPhone ||
      !customerEmail ||
      !customerAddress ||
      !customerCity ||
      !CustomerPassword
    ) {
      return res.status(400).send({ error: "All fields are required" });
    }

    const hashedPassword = await bcrypt.hash(CustomerPassword, 12);
    const accountNumber = await generateAccountNumber();

    const query = `
      INSERT INTO Customer (AccountNumber, customerName, AccountType, customerPhone, customerEmail, customerAddress, customerCity, CustomerPassword,Balance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?,0)
    `;
    await db.query(query, [
      accountNumber,
      customerName,
      AccountType,
      customerPhone,
      customerEmail,
      customerAddress,
      customerCity,
      hashedPassword,
    ]);
    const role = "user";

    const token = createTokenForUser({
      accountNumber,
      customerName,
      AccountType,
      customerPhone,
      customerEmail,  
      customerAddress,
      customerCity,
      role
    });

    res.status(201).send({
      message: "Customer Account created successfully",
      accountNumber,
      token,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to add customer" });
  }
});

route.post("/login", upload.none(), async (req, res) => {
  let connection;
  try {
    const { accountNumber, password } = req.body;
    //console.log(accountNumber);
    //console.log(password);

    // Check if both account number and password are provided
    if (!accountNumber || !password) {
      return res
        .status(400)
        .send({ error: "Account number and password are required" });
    }

    // Get a connection from the pool
    connection = await db.getConnection();

    // Fetch the user from the database based on the account number
    const query = "SELECT * FROM Customer WHERE AccountNumber = ?";
    const [user] = await connection.query(query, [accountNumber]);

    // Check if user exists
    if (!user || user.length === 0) {
      return res.status(404).send({ error: "Account not found" });
    }

    // Check if the stored password matches the entered password
    const passwordMatch = await bcrypt.compare(
      password,
      user[0].CustomerPassword
    );

    // If password does not match
    if (!passwordMatch) {
      return res.status(401).send({ error: "Invalid password" });
    }

    const role = "user";
    // Create a JWT token for the user upon successful login
    const token = createTokenForUser({
      accountNumber: user[0].AccountNumber,
      customerName: user[0].customerName,
      AccountType: user[0].AccountType,
      customerPhone: user[0].customerPhone,
      customerEmail: user[0].customerEmail,
      customerAddress: user[0].customerAddress,
      customerCity: user[0].customerCity,
      role,
    });

    // Send back a success message with the token
    res.status(200).send({
      message: "Login successful",
      accountNumber: user[0].AccountNumber,
      token, // JWT token
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).send({ error: "Failed to login" });
  } finally {
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});


// Route to handle withdrawal
route.post("/withdraw", verifyToken, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { withdrawAmount } = req.body;
    const accountNumber = req.user.AccNumber;
    if (!withdrawAmount || withdrawAmount <= 0) {
      await connection.rollback();
      return res.status(400).send({ error: "Invalid withdrawal amount" });
    }
    const [customerRows] = await connection.query(
      "SELECT Balance FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );
    if (customerRows.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Account not found" });
    }
    const currentBalance = customerRows[0].Balance;
    if (currentBalance < withdrawAmount) {
      await connection.rollback();
      return res.status(400).send({ error: "Insufficient balance" });
    }
    const newBalance = currentBalance - withdrawAmount;
    await connection.query(
      `INSERT INTO WithdrawHistory (AccountNumber, WithdrawAmount, AfterBalance) 
       VALUES (?, ?, ?)`,
      [accountNumber, withdrawAmount, newBalance]
    );
    await connection.query(
      `UPDATE Customer SET Balance = ? WHERE AccountNumber = ?`,
      [newBalance, accountNumber]
    );
    await connection.commit();
    res.status(200).send({ message: "Withdrawal successful", newBalance });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    res.status(500).send({ error: "Failed to withdraw" });
  } finally {
    connection.release();
  }
});



// Route to handle money transfer
route.post("/transferMoney", verifyToken, upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { toAccount, transferAmount } = req.body;
    const accountNumber = req.user.AccNumber;
    if (accountNumber === toAccount)
    {
      await connection.rollback();
      return res.status(400).send({ error: "Same account Can't transfer the money" });

    }
      if (!toAccount || !transferAmount || transferAmount <= 0) {
        await connection.rollback();
        return res.status(400).send({ error: "Invalid transfer details" });
      }
    const transferAmountNumber = parseFloat(transferAmount);
    if (isNaN(transferAmountNumber)) {
      await connection.rollback();
      return res.status(400).send({ error: "Invalid transfer amount" });
    }

    const [senderRows] = await connection.query(
      "SELECT Balance FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );
    if (senderRows.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Sender account not found" });
    }
    const senderBalance = parseFloat(senderRows[0].Balance);
    //console.log("Sender's Current Balance:", senderBalance); 
    if (senderBalance < transferAmountNumber) {
      await connection.rollback();
      return res.status(400).send({ error: "Insufficient balance" });
    }
    const [receiverRows] = await connection.query(
      "SELECT Balance FROM Customer WHERE AccountNumber = ?",
      [toAccount]
    );
    if (receiverRows.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Receiver account not found" });
    }
    const receiverBalance = parseFloat(receiverRows[0].Balance);
    // console.log("Receiver's Current Balance:", receiverBalance);
    const newSenderBalance = (senderBalance - transferAmountNumber).toFixed(2);
    const newReceiverBalance = (receiverBalance + transferAmountNumber).toFixed(2);
    // console.log("New Sender's Balance:", newSenderBalance);
    // console.log("New Receiver's Balance:", newReceiverBalance);
    await connection.query(
      `UPDATE Customer SET Balance = ? WHERE AccountNumber = ?`,
      [newSenderBalance, accountNumber]
    );
    await connection.query(
      `UPDATE Customer SET Balance = ? WHERE AccountNumber = ?`,
      [newReceiverBalance, toAccount]
    );
    await connection.query(
      `INSERT INTO TransferMoney (AccountNumber, ToAccount, TransferAmount) 
       VALUES (?, ?, ?)`,
      [accountNumber, toAccount, transferAmountNumber]
    );
    await connection.commit();
    res.status(200).send({
      message: "Transfer successful",
      newSenderBalance,
      newReceiverBalance,
    });
  } catch (error) {
    console.error("Error during transfer:", error);
    await connection.rollback();
    res.status(500).send({ error: "Failed to transfer money" });
  } finally {
    connection.release();
  }
});


//handle pdf generation
route.get("/generateBankReport", verifyToken, upload.none(),async (req, res) => {
  try {
    const accountNumber = req.user.AccNumber;
    const { startDate, endDate } = req.query;

    if (!accountNumber) {
      return res.status(400).send({ error: "Account number is required" });
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (
      (startDate && !datePattern.test(startDate)) ||
      (endDate && !datePattern.test(endDate))
    ) {
      return res
        .status(400)
        .send({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const [customer] = await db.query(
      "SELECT * FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customer.length === 0) {
      return res.status(404).send({ error: "Customer not found" });
    }

    const customerBalance = parseFloat(customer[0].Balance);
    if (isNaN(customerBalance)) {
      return res
        .status(500)
        .send({ error: "Invalid balance in customer data" });
    }

    let withdrawQuery = "SELECT * FROM WithdrawHistory WHERE AccountNumber = ?";
    let withdrawParams = [accountNumber];
    if (startDate && endDate) {
      withdrawQuery += " AND WithdrawTime BETWEEN ? AND ?";
      withdrawParams.push(startDate, endDate);
    }

    const [withdrawHistory] = await db.query(withdrawQuery, withdrawParams);

    let transferQuery =
      "SELECT * FROM TransferMoney WHERE AccountNumber = ? OR ToAccount = ?";
    let transferParams = [accountNumber, accountNumber];
    if (startDate && endDate) {
      transferQuery += " AND TransferTime BETWEEN ? AND ?";
      transferParams.push(startDate, endDate);
    }

    const [transferHistory] = await db.query(transferQuery, transferParams);

    const totalSpent =
      withdrawHistory.reduce((acc, row) => {
        const amount = parseFloat(row.WithdrawAmount);
        return !isNaN(amount) ? acc + amount : acc;
      }, 0) +
      transferHistory
        .filter(
          (row) =>
            String(row.AccountNumber).trim() === String(accountNumber).trim()
        )
        .reduce((acc, row) => {
          const amount = parseFloat(row.TransferAmount);
          return !isNaN(amount) ? acc + amount : acc;
        }, 0);

    const totalReceived = transferHistory
      .filter((row) => String(row.ToAccount) === String(accountNumber))
      .reduce((acc, row) => acc + parseFloat(row.TransferAmount), 0);

    const doc = new PDFDocument();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bank_report_' + accountNumber + '.pdf"'
    );
    doc.pipe(res);
    doc.fontSize(20).text("Bank Report", { align: "center" }).moveDown(2);
    doc
      .fontSize(14)
      .text("Customer Information", { underline: true })
      .moveDown();
    doc.fontSize(12).text(`Account Number: ${customer[0].AccountNumber}`);
    doc.text(`Name: ${customer[0].customerName}`);
    doc.text(`Phone: ${customer[0].customerPhone}`);
    doc.text(`Email: ${customer[0].customerEmail}`);
    doc.text(`City: ${customer[0].customerCity}`);
    doc.text(`Balance: ₹${customerBalance.toFixed(2)}`).moveDown(2);

    doc.fontSize(14).text("Withdraw History", { underline: true }).moveDown();
    if (withdrawHistory.length > 0) {
      withdrawHistory.forEach((row) => {
        doc.text(
          `Withdrawn: ₹${parseFloat(row.WithdrawAmount).toFixed(2)} on ${
            row.WithdrawTime
          } (Balance After: ₹${parseFloat(row.AfterBalance).toFixed(2)})`
        );
      });
    } else {
      doc.text("No withdrawal history available.");
    }
    doc.moveDown(2);

    doc.fontSize(14).text("Transfer History", { underline: true }).moveDown();
    if (transferHistory.length > 0) {
      transferHistory.forEach((row) => {
        if (row.AccountNumber === accountNumber) {
          doc.text(
            `Sent: ₹${parseFloat(row.TransferAmount).toFixed(2)} to ${
              row.ToAccount
            } on ${row.TransferTime}`
          );
        } else {
          doc.text(
            `Received: ₹${parseFloat(row.TransferAmount).toFixed(2)} from ${
              row.AccountNumber
            } on ${row.TransferTime}`
          );
        }
      });
    } else {
      doc.text("No transfer history available.");
    }

    doc.moveDown(2);
    doc.text("-------------------------------------------------").moveDown();
    doc.text(`Total Spent: ₹${totalSpent.toFixed(2)}`, { align: "right" });
    doc.text(`Total Received: ₹${totalReceived.toFixed(2)}`, {
      align: "right",
    });
     doc.end();
  } catch (error) {
    console.error("Error generating report:", error);
    res.status(500).send({ error: "Failed to generate the bank report" });
  }
});

//handle Transcation histroy generation
route.get("/history",verifyToken,async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const AccountNumber = req.user.AccNumber;
    if (!AccountNumber) {
      await connection.rollback();
      return res.status(404).send({ error: "Account Number Not Found!" });
    }
    const [TransactionHistory] = await connection.query(
      "SELECT * FROM TransactionHistory WHERE AccountNumber = ?",
      [AccountNumber]
    );
    if (TransactionHistory.length === 0) {
      await connection.rollback();
      return res.status(404).send({ message: "No Transaction History Found!" });
    }
    await connection.commit();
    return res.status(200).send({
      message: "Transaction Data Fetched Successfully",
      data: TransactionHistory,
    });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    return res.status(500).send({ error: "Failed to fetch transaction data" });
  } finally {
    connection.release();
  }
});


route.post("/applyloan", verifyToken,upload.none(),async (req, res) => {
  const connection = await db.getConnection();
  try {
    // Start the transaction
    await connection.beginTransaction();

    const { loanAmount, loanDurationMonths } = req.body; 
    const AccountNumber = req.user.AccNumber;

    if (!AccountNumber) {
      await connection.rollback();
      return res.status(404).send({ error: "Account Number Not Found!" });
    }
    const [customerData] = await connection.query(
      `SELECT AccountType, Balance FROM Customer WHERE AccountNumber = ?`,
      [AccountNumber]
    );
    if (customerData.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Customer not found!" });
    }
    const { AccountType } = customerData[0];
    let LoanInterestRate;
    if (AccountType === "Savings") {
      LoanInterestRate = 5;
    } else if (AccountType === "Current") {
      LoanInterestRate = 6;
    } else {
      await connection.rollback();
      return res.status(400).send({ error: "Invalid Account Type!" });
    }
    const [loanResult] = await connection.query(
      `INSERT INTO Loan (AccountNumber, LoanAmount, LoanDurationMonths, LoanInterest, ApprovalStatus) 
       VALUES (?, ?, ?, ?, 'Pending')`,
      [AccountNumber, loanAmount, loanDurationMonths, LoanInterestRate]
    );
    await connection.commit();
    res
      .status(200)
      .send({
        message: "Loan application submitted successfully!",
        loanID: loanResult.insertId,
      });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    return res.status(500).send({ error: "Failed to apply for the loan" });
  } finally {
    connection.release();
  }
});

route.get("/accountInfo", verifyToken, async (req, res) => {
  let connection;

  try {
    const accountNumber = req.user.AccNumber;
    // console.log("Account Number:", accountNumber); // Log account number to verify

    if (!accountNumber) {
      return res.status(400).send({ error: "Account number is required" });
    }

    // Get connection from the pool
    connection = await db.getConnection();

    // Query to get Account Verification status
    const queryAccount =
      "SELECT AccountVerify FROM Customer WHERE AccountNumber = ?";
    const [queryAccountVerify] = await connection.query(queryAccount, [
      accountNumber,
    ]);

    // Fetch account balance
    const queryBalance =
      "SELECT SUM(Balance) AS balance FROM Customer WHERE AccountNumber = ?";
    const [balanceResult] = await connection.query(queryBalance, [
      accountNumber,
    ]);

    // Debug: log balance result
    //console.log("Balance Result:", balanceResult);

    if (!balanceResult || balanceResult.length === 0) {
      return res.status(404).send({ error: "Account not found" });
    }

    const balance = balanceResult[0].balance || 0; // Handle case where balance is null

    // Fetch loan details for the account
    const queryLoans =
      "SELECT SUM(LoanAmount) AS totalLoans FROM Loan WHERE AccountNumber = ?";
    const [loanResults] = await connection.query(queryLoans, [accountNumber]);

    // Debug: log loan results
   // console.log("Loan Results:", loanResults);

    // Get account verification status
    const accountVerified = queryAccountVerify[0]?.AccountVerify === 1;

    // Send the response with account details
    res.status(200).send({
      message: "Account info retrieved successfully",
      accountNumber,
      balance,
      loans: loanResults[0]?.totalLoans || 0, // Handle null/undefined loan results
      accountVerified, // Include verification status in the response
    });
  } catch (error) {
    console.error("Error fetching account info:", error);
    res.status(500).send({ error: "Failed to retrieve account info" });
  } finally {
    // Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
});






module.exports = route;
