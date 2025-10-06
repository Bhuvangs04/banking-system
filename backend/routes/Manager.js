const { Router } = require("express");
const route = Router();
const db = require("../dataBase/MySQL");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


// Route for manager to view all loan applications
route.get("/loanApplications", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const [loanApplications] = await connection.query(
      `SELECT 
          Loan.LoanID,
          Loan.AccountNumber,
          Loan.LoanAmount,
          Loan.LoanDurationMonths,
          Loan.ApprovalStatus,
          Loan.LoanInterest,  -- If stored
          Customer.customerName,
          Customer.AccountType,
          Customer.customerPhone,
          Customer.customerEmail,
          Customer.customerAddress,
          Customer.customerCity,
          Customer.Balance
       FROM Loan
       JOIN Customer ON Loan.AccountNumber = Customer.AccountNumber`
    );
    if (loanApplications.length === 0) {
      return res.status(404).send({ message: "No loan applications found" });
    }
     const pendingApplications = loanApplications.filter(
       (application) => application.ApprovalStatus === "Pending"
     );

     if (pendingApplications.length === 0) {
       return res
         .status(404)
         .send({ message: "No pending loan applications found" });
     }

     res.status(200).send(pendingApplications);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to retrieve loan applications" });
  } finally {
    connection.release();
  }
});

route.get("/customer/searchByName", async (req, res) => {
  const { name } = req.query; 
  // Ensure that 'name' is being retrieved correctly
  // console.log("Search name received:", name);
  const sqlQuery = "SELECT * FROM Customer WHERE customerName LIKE ?";
  let connection;
  try {
    connection = await db.getConnection();
    const [results] = await connection.query(sqlQuery, [`%${name}%`]);

    if (results.length > 0) {
      res.json(results);
    } else {
      res.status(404).json({ message: "No accounts found for this name" });
    }
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).json({ message: "Error retrieving account" });
  } finally {
    if (connection) connection.release();
  }
});


route.post("/customer/update", async (req, res) => {
  const { accountNumber } = req.query;
  const {
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    customerCity,
  } = req.body;
 

  const sqlQuery = `UPDATE Customer 
                    SET customerName = ?, customerPhone = ?, customerEmail = ?, 
                        customerAddress = ?, customerCity = ? 
                    WHERE AccountNumber = ?`;

  const values = [
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
    customerCity,
    accountNumber,
  ];

  let connection;

  try {
    connection = await db.getConnection();
    await connection.query(sqlQuery, values);
    res.status(200).send("Customer updated successfully.");
  } catch (error) {
    console.error("Error updating customer:", error);
    res.status(500).send("Failed to update customer.");
  } finally {
    if (connection) connection.release();
  }
});


// route.delete("/customer/deleteAccount", async (req, res) => {
//   const { accountNumber } = req.query;
//   const sqlQuery = "DELETE FROM Customer WHERE AccountNumber = ?";

//   let connection;

//   try {
//     connection = await db.getConnection();
//     const result = await connection.query(sqlQuery, [accountNumber]);
//     if (result[0].affectedRows > 0) {
//       res.json({ message: "Account deleted successfully" });
//     } else {
//       res.status(404).json({ message: "Account not found" });
//     }
//   } catch (error) {
//     console.error("Error deleting account:", error);
//     res.status(500).json({ message: "Error deleting account" });
//   } finally {
//     if (connection) connection.release();
//   }
// });




route.get("/aprovedApplication", async (req, res) => {
  const connection = await db.getConnection();
  try {
    const [loanApplications] = await connection.query(
      `SELECT 
          Loan.LoanID,
          Loan.AccountNumber,
          Loan.LoanAmount,
          Loan.LoanDurationMonths,
          Loan.ApprovalStatus,
          Loan.LoanInterest,  -- If stored
          Customer.customerName,
          Customer.AccountType,
          Customer.customerPhone,
          Customer.customerEmail,
          Customer.customerAddress,
          Customer.customerCity,
          Customer.Balance
       FROM Loan
       JOIN Customer ON Loan.AccountNumber = Customer.AccountNumber`
    );
    if (loanApplications.length === 0) {
      return res.status(404).send({ message: "No loan applications found" });
    }
    const ApprovedApplications = loanApplications.filter(
      (application) => application.ApprovalStatus === "Approved"
    );

    if (ApprovedApplications.length === 0) {
      return res
        .status(404)
        .send({ message: "No Approved loan applications found" });
    }

    res.status(200).send(ApprovedApplications);
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to retrieve loan applications" });
  } finally {
    connection.release();
  }
});


// Route for manager approval of a loan
route.post("/approveLoan/:loanId", upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { loanId } = req.params;
    const { approvalStatus } = req.body;

    if (!loanId || !approvalStatus) {
      await connection.rollback();
      return res
        .status(400)
        .send({ error: "Missing loan ID or approval status!" });
    }

    const [loanDetails] = await connection.query(
      `SELECT LoanAmount, LoanDurationMonths, LoanInterest, AccountNumber FROM Loan WHERE LoanID = ?`,
      [loanId]
    );

    if (loanDetails.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Loan not found!" });
    }

    const { LoanAmount, LoanDurationMonths, LoanInterest, AccountNumber } =
      loanDetails[0];

    //console.log("LoanAmount:", LoanAmount);
    //console.log("LoanDurationMonths:", LoanDurationMonths);
    //console.log("LoanInterest:", LoanInterest);

    // Validate the numeric values
    if (isNaN(LoanAmount) || isNaN(LoanDurationMonths) || isNaN(LoanInterest)) {
      console.error("Invalid loan details:", {
        LoanAmount,
        LoanDurationMonths,
        LoanInterest,
      });
      await connection.rollback();
      return res.status(400).send({ error: "Invalid loan details!" });
    }

    if (approvalStatus === "Approved") {
      let parsedLoanAmount = parseFloat(LoanAmount);
      let parsedLoanInterest = parseFloat(LoanInterest);
      let parsedLoanDurationMonths = parseFloat(LoanDurationMonths);

      let totalInterest =
        ((parsedLoanAmount * parsedLoanInterest) / 100) *
        (parsedLoanDurationMonths / 12);
      let totalPayableAmount = parsedLoanAmount + totalInterest;
      totalInterest = Number(totalInterest.toFixed(2));
      totalPayableAmount = Number(totalPayableAmount.toFixed(2));
      if (isNaN(totalPayableAmount)) {
        await connection.rollback();
        return res
          .status(500)
          .send({ error: "Error in calculating total payable amount!" });
      }

      await connection.query(
        `UPDATE Loan 
         SET ApprovalStatus = ?, 
             TotalPayableAmount = ?, 
             ApprovalDate = NOW() 
         WHERE LoanID = ?`,
        [approvalStatus, totalPayableAmount, loanId]
      );
    } else if (approvalStatus === "Denied") {
      await connection.query(
        `UPDATE Loan 
         SET ApprovalStatus = ?, 
             ApprovalDate = NOW() 
         WHERE LoanID = ?`,
        [approvalStatus, loanId]
      );
    } else {
      await connection.rollback();
      return res.status(400).send({ error: "Invalid approval status!" });
    }

    await connection.commit();
    res
      .status(200)
      .send({ message: `Loan status updated to ${approvalStatus}` });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).send({ error: "Failed to update loan status" });
  } finally {
    connection.release();
  }
});

// Route to deposit money into a customer's account
route.post("/depositMoney", upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { accountNumber, depositAmount } = req.body;

    // Validation: Check if account number and deposit amount are provided
    if (!accountNumber || !depositAmount) {
      await connection.rollback();
      return res.status(400).send({ error: "Account number and deposit amount are required!" });
    }

    // Validation: Ensure deposit amount is a positive number
    if (isNaN(depositAmount) || depositAmount <= 0) {
      await connection.rollback();
      return res.status(400).send({ error: "Invalid deposit amount!" });
    }

    // Retrieve the customer's current balance and name based on account number
    const [customerDetails] = await connection.query(
      `SELECT customerName, Balance FROM Customer WHERE AccountNumber = ?`,
      [accountNumber]
    );

    if (customerDetails.length === 0) {
      await connection.rollback();
      return res.status(404).send({ error: "Account not found!" });
    }

    const { customerName, Balance } = customerDetails[0];

    // Calculate the new balance after deposit
    const newBalance = parseFloat(Balance) + parseFloat(depositAmount);

    // Update the balance in the database
    await connection.query(
      `UPDATE Customer SET Balance = ? WHERE AccountNumber = ?`,
      [newBalance, accountNumber]
    );

    // Commit the transaction
    await connection.commit();

    // Send response with the updated balance and account holder's name
    res.status(200).send({
      message: `Deposit successful. ${depositAmount} has been added to the account.`,
      customerName: customerName,
      newBalance: newBalance,
    });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).send({ error: "Failed to deposit money into the account" });
  } finally {
    connection.release();
  }
});

route.get("/verifyAccount/:accountNumber", async (req, res) => {
  const { accountNumber } = req.params;
  try {
    const connection = await db.getConnection();
    const [accountDetails] = await connection.query(
      `SELECT customerName FROM Customer WHERE AccountNumber = ?`,
      [accountNumber]
    );

    if (accountDetails.length === 0) {
      return res.status(404).send({ accountExists: false });
    }

    const accountName = accountDetails[0].customerName;
    res.status(200).send({ accountExists: true, accountName });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to verify account" });
  }
});


route.post("/verifyCustomerAccount", async (req, res) => {
  // Correct order
  try {
    const { accountNumber } = req.body;
    const query = `
      UPDATE Customer
      SET AccountVerify = 1
      WHERE AccountNumber = ?
    `;

    db.query(query, [accountNumber], (err, results) => {
      if (err) {
        console.error("Error updating account verification:", err);
        return res
          .status(500)
          .json({ success: false, message: "Server error" });
      }

      if (results.affectedRows > 0) {
        res
          .status(200)
          .json({ success: true, message: "Account successfully verified!" });
      } else {
        res.status(404).json({ success: false, message: "Account not found" });
      }
    });
  } catch (error) {
    console.error("Error verifying account:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


route.get("/reports", async (req, res) => {
  try {
    const connection = await db.getConnection();
    const [accountsreport] = await connection.query(
      `SELECT customerName, AccountNumber, AccountVerify FROM Customer WHERE AccountVerify = 0`
    );

    if (accountsreport.length === 0) {
      return res.status(404).send({ accountExists: false });
    }

    const customerName = accountsreport[0].customerName;
    const AccountNumber = accountsreport[0].AccountNumber;
    const AccountVerify = accountsreport[0].AccountVerify;

    res.status(200).send({
      accountExists: true,
      customerName,
      AccountNumber,
      AccountVerify,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to verify account" });
  }
});





module.exports = route;
