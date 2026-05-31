const { Router } = require("express");
const route = Router();
const db = require("../dataBase/MySQL");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createTokenForAdmin } = require("../services/auth");
const { verifyToken, verifyAdmin, verifyAdminToken, requirePermission } = require("../middleware/auth");
const { loginLimiter } = require("../middleware/rateLimiter");
const { recordJournalEntry } = require("../services/ledger");
const { logAudit, getClientIP } = require("../services/audit");
const { evaluateDeposit } = require("../services/fraudDetection");
require("dotenv").config();

// ============================================================
// POST /admin/register - Create new admin (requires manage_admins permission)
// ============================================================
route.post("/register", verifyToken, requirePermission('manage_admins'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { username, email, password, fullName, roleId } = req.body;

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    connection = await db.getConnection();

    // Check existing admin
    const [existing] = await connection.query(
      "SELECT AdminID FROM Admin WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    // Validate roleId if provided, otherwise default to Support Agent (lowest privilege)
    let assignedRoleId = roleId;
    if (roleId) {
      const [roleCheck] = await connection.query("SELECT RoleID FROM Role WHERE RoleID = ?", [roleId]);
      if (roleCheck.length === 0) {
        return res.status(400).json({ error: "Invalid role ID" });
      }
    } else {
      // Default to Support Agent role
      const [supportRole] = await connection.query("SELECT RoleID FROM Role WHERE RoleName = 'Support Agent'");
      assignedRoleId = supportRole.length > 0 ? supportRole[0].RoleID : null;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const [result] = await connection.query(
      "INSERT INTO Admin (username, email, password, fullName, RoleID) VALUES (?, ?, ?, ?, ?)",
      [username, email, hashedPassword, fullName, assignedRoleId]
    );

    // Fetch role info and permissions for the new admin
    const [roleInfo] = await connection.query(
      "SELECT r.RoleName FROM Role r WHERE r.RoleID = ?",
      [assignedRoleId]
    );
    const [permissions] = await connection.query(
      "SELECT Permission FROM RolePermission WHERE RoleID = ?",
      [assignedRoleId]
    );

    const roleName = roleInfo.length > 0 ? roleInfo[0].RoleName : "Unknown";
    const permList = permissions.map(p => p.Permission);

    const token = createTokenForAdmin({
      adminId: result.insertId,
      username,
      role: "admin",
      roleName,
    });

    res.status(201).json({
      message: "Admin account created successfully",
      token,
      role: roleName,
      permissions: permList,
    });

    // Audit: Admin registration
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ADMIN_CREATED',
      category: 'Admin', entityType: 'Admin', entityId: result.insertId.toString(),
      ipAddress: getClientIP(req),
      newValues: { username, email, fullName, role: roleName },
      description: `Admin ${username} created with role: ${roleName} by ${req.user.username}`,
    });
  } catch (error) {
    console.error("Admin register error:", error);
    res.status(500).json({ error: "Failed to create admin account" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/login - Admin login
// ============================================================
route.post("/login", loginLimiter, upload.none(), async (req, res) => {
  let connection;
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    connection = await db.getConnection();

    const [admin] = await connection.query(
      "SELECT * FROM Admin WHERE username = ? AND isActive = 1",
      [username]
    );

    if (admin.length === 0) {
      return res.status(404).json({ error: "Admin account not found" });
    }

    const match = await bcrypt.compare(password, admin[0].password);
    if (!match) {
      // Audit: Admin login failure
      logAudit({
        actorType: 'admin', actorId: username, action: 'ADMIN_LOGIN_FAILED',
        category: 'Authentication', entityType: 'Admin', entityId: username,
        ipAddress: getClientIP(req),
        description: `Failed admin login attempt for username: ${username}`,
      });
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Update last login
    await connection.query(
      "UPDATE Admin SET lastLogin = NOW() WHERE AdminID = ?",
      [admin[0].AdminID]
    );

    // Fetch role and permissions
    const [roleInfo] = await connection.query(
      "SELECT r.RoleName FROM Role r WHERE r.RoleID = ?",
      [admin[0].RoleID]
    );
    const [permissions] = await connection.query(
      "SELECT Permission FROM RolePermission WHERE RoleID = ?",
      [admin[0].RoleID]
    );

    const roleName = roleInfo.length > 0 ? roleInfo[0].RoleName : "Unknown";
    const permList = permissions.map(p => p.Permission);

    const token = createTokenForAdmin({
      adminId: admin[0].AdminID,
      username: admin[0].username,
      role: "admin",
      roleName,
    });

    res.status(200).json({
      message: "Login successful",
      token,
      role: roleName,
      permissions: permList,
      admin: {
        username: admin[0].username,
        fullName: admin[0].fullName,
        email: admin[0].email,
      },
    });

    // Audit: Admin login success
    logAudit({
      actorType: 'admin', actorId: admin[0].AdminID.toString(), action: 'ADMIN_LOGIN_SUCCESS',
      category: 'Authentication', entityType: 'Admin', entityId: admin[0].AdminID.toString(),
      ipAddress: getClientIP(req),
      description: `Successful admin login for ${admin[0].username}`,
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res.status(500).json({ error: "Failed to login" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/dashboard - Dashboard statistics
// ============================================================
route.get("/dashboard", verifyToken, requirePermission('view_dashboard'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [totalCustomers] = await connection.query(
      "SELECT COUNT(*) as count FROM Customer"
    );

    const [verifiedCustomers] = await connection.query(
      "SELECT COUNT(*) as count FROM Customer WHERE AccountVerify = 1"
    );

    const [totalBalance] = await connection.query(
      "SELECT COALESCE(SUM(Balance), 0) as total FROM Customer"
    );

    const [pendingLoans] = await connection.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(LoanAmount), 0) as total FROM Loan WHERE ApprovalStatus = 'Pending'"
    );

    const [approvedLoans] = await connection.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(LoanAmount), 0) as total FROM Loan WHERE ApprovalStatus = 'Approved'"
    );

    const [todayTransactions] = await connection.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(TransactionAmount), 0) as total FROM TransactionHistory WHERE DATE(TransactionDate) = CURDATE()"
    );

    const [recentTransactions] = await connection.query(
      `SELECT th.TransactionID, th.AccountNumber, th.TransactionType, th.TransactionAmount,
              th.TransactionDate, th.Description, c.customerName
       FROM TransactionHistory th
       JOIN Customer c ON th.AccountNumber = c.AccountNumber
       ORDER BY th.TransactionDate DESC LIMIT 10`
    );

    const [newCustomers] = await connection.query(
      `SELECT AccountNumber, customerName, AccountType, createdAt, AccountVerify
       FROM Customer ORDER BY createdAt DESC LIMIT 5`
    );

    res.status(200).json({
      stats: {
        totalCustomers: totalCustomers[0].count,
        verifiedCustomers: verifiedCustomers[0].count,
        unverifiedCustomers: totalCustomers[0].count - verifiedCustomers[0].count,
        totalBalance: parseFloat(totalBalance[0].total),
        pendingLoans: {
          count: pendingLoans[0].count,
          amount: parseFloat(pendingLoans[0].total),
        },
        approvedLoans: {
          count: approvedLoans[0].count,
          amount: parseFloat(approvedLoans[0].total),
        },
        todayTransactions: {
          count: todayTransactions[0].count,
          amount: parseFloat(todayTransactions[0].total),
        },
      },
      recentTransactions,
      newCustomers,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to fetch dashboard data" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/customers - All customers with pagination
// ============================================================
route.get("/customers", verifyToken, requirePermission('view_customers'), async (req, res) => {
  let connection;
  try {
    const { page = 1, limit = 20, search, verified } = req.query;
    const offset = (page - 1) * limit;

    connection = await db.getConnection();

    let query = `SELECT AccountNumber, customerName, AccountType, customerPhone, customerEmail,
                        customerCity, Balance, AccountVerify, isActive, createdAt
                 FROM Customer WHERE 1=1`;
    let countQuery = "SELECT COUNT(*) as total FROM Customer WHERE 1=1";
    let params = [];
    let countParams = [];

    if (search) {
      query += " AND (customerName LIKE ? OR AccountNumber LIKE ? OR customerEmail LIKE ?)";
      countQuery += " AND (customerName LIKE ? OR AccountNumber LIKE ? OR customerEmail LIKE ?)";
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (verified !== undefined) {
      query += " AND AccountVerify = ?";
      countQuery += " AND AccountVerify = ?";
      params.push(parseInt(verified));
      countParams.push(parseInt(verified));
    }

    query += " ORDER BY createdAt DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [customers] = await connection.query(query, params);
    const [totalResult] = await connection.query(countQuery, countParams);

    res.status(200).json({
      customers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        totalPages: Math.ceil(totalResult[0].total / limit),
      },
    });
  } catch (error) {
    console.error("Customers error:", error);
    res.status(500).json({ error: "Failed to fetch customers" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/loanApplications - View pending loan applications
// ============================================================
route.get("/loanApplications", verifyToken, requirePermission('view_loans'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [loanApplications] = await connection.query(
      `SELECT l.LoanID, l.AccountNumber, l.LoanAmount, l.LoanDurationMonths,
              l.ApprovalStatus, l.LoanInterest, l.TotalPayableAmount, l.MonthlyEMI,
              l.AppliedDate, c.customerName, c.AccountType, c.customerPhone,
              c.customerEmail, c.Balance
       FROM Loan l
       JOIN Customer c ON l.AccountNumber = c.AccountNumber
       WHERE l.ApprovalStatus = 'Pending'
       ORDER BY l.AppliedDate ASC`
    );

    res.status(200).json({ loanApplications });
  } catch (error) {
    console.error("Loan applications error:", error);
    res.status(500).json({ error: "Failed to retrieve loan applications" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/approvedLoans - View approved loans
// ============================================================
route.get("/approvedLoans", verifyToken, requirePermission('view_loans'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [loans] = await connection.query(
      `SELECT l.*, c.customerName, c.AccountType, c.Balance
       FROM Loan l
       JOIN Customer c ON l.AccountNumber = c.AccountNumber
       WHERE l.ApprovalStatus = 'Approved'
       ORDER BY l.ApprovalDate DESC`
    );

    res.status(200).json({ loans });
  } catch (error) {
    console.error("Approved loans error:", error);
    res.status(500).json({ error: "Failed to retrieve approved loans" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/approveLoan/:loanId - Approve or deny loan
// ============================================================
route.post("/approveLoan/:loanId", verifyToken, requirePermission('approve_loans'), upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { loanId } = req.params;
    const { approvalStatus, remarks } = req.body;

    if (!loanId || !approvalStatus) {
      await connection.rollback();
      return res.status(400).json({ error: "Missing loan ID or approval status" });
    }

    if (!["Approved", "Denied"].includes(approvalStatus)) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid approval status. Must be Approved or Denied." });
    }

    const [loanDetails] = await connection.query(
      "SELECT * FROM Loan WHERE LoanID = ? AND ApprovalStatus = 'Pending'",
      [loanId]
    );

    if (loanDetails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Pending loan not found" });
    }

    const loan = loanDetails[0];

    if (approvalStatus === "Approved") {
      const totalInterest = (parseFloat(loan.LoanAmount) * parseFloat(loan.LoanInterest) / 100) * (loan.LoanDurationMonths / 12);
      const totalPayable = parseFloat((parseFloat(loan.LoanAmount) + totalInterest).toFixed(2));

      await connection.query(
        `UPDATE Loan SET ApprovalStatus = ?, TotalPayableAmount = ?, ApprovalDate = NOW(),
         NextRepaymentDueDate = DATE_ADD(NOW(), INTERVAL 1 MONTH), RepaymentStatus = 'Active',
         ApprovedBy = ?, Remarks = ? WHERE LoanID = ?`,
        [approvalStatus, totalPayable, req.user.adminId || null, remarks || null, loanId]
      );

      // Record double entry: debit Loan Receivables, credit Customer Deposits
      await recordJournalEntry(connection, {
        transactionType: "Loan Payout",
        description: `Loan #${loanId} approved and credited. Amount: ₹${loan.LoanAmount}`,
        referenceId: `LN${loanId}`,
        entries: [
          {
            accountName: "Asset: Loan Receivables",
            subAccountNumber: null,
            entryType: "Debit",
            amount: loan.LoanAmount
          },
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: loan.AccountNumber,
            entryType: "Credit",
            amount: loan.LoanAmount
          }
        ]
      });
    } else {
      await connection.query(
        `UPDATE Loan SET ApprovalStatus = ?, ApprovalDate = NOW(),
         ApprovedBy = ?, Remarks = ? WHERE LoanID = ?`,
        [approvalStatus, req.user.adminId || null, remarks || null, loanId]
      );
    }

    await connection.commit();
    res.status(200).json({ message: `Loan ${approvalStatus.toLowerCase()} successfully` });

    // Audit: Loan approval/denial
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: approvalStatus === 'Approved' ? 'LOAN_APPROVED' : 'LOAN_REJECTED',
      category: 'Admin', entityType: 'Loan', entityId: loanId.toString(),
      ipAddress: getClientIP(req),
      newValues: { loanId, approvalStatus, amount: loan.LoanAmount, accountNumber: loan.AccountNumber, remarks },
      description: `Loan #${loanId} ${approvalStatus.toLowerCase()} for account ${loan.AccountNumber} (₹${parseFloat(loan.LoanAmount).toLocaleString()})`,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Loan approval error:", error);
    res.status(500).json({ error: "Failed to update loan status" });
  } finally {
    connection.release();
  }
});

// ============================================================
// POST /admin/depositMoney - Deposit money (now with logging)
// ============================================================
route.post("/depositMoney", verifyToken, requirePermission('deposit_money'), upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { accountNumber, depositAmount } = req.body;

    if (!accountNumber || !depositAmount) {
      await connection.rollback();
      return res.status(400).json({ error: "Account number and deposit amount are required" });
    }
    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid deposit amount" });
    }

    // Role-based limits (Teller=50k, Manager=50L)
    const adminRole = req.user.roleName; // added in previous auth.js update
    const roleMap = {
      'Teller': 50000,
      'Manager': 5000000,
      'Super Admin': 0, // No direct deposit
      'Auditor': 0,
      'Support Agent': 0
    };
    
    // Ensure backwards compatibility if roleName is missing, fall back to Manager limits
    const maxLimit = roleMap[adminRole] !== undefined ? roleMap[adminRole] : 5000000;
    
    if (amount > maxLimit) {
      await connection.rollback();
      return res.status(403).json({ error: `Deposit limit exceeded for role ${adminRole || 'Unknown'}. Max allowed: ₹${maxLimit}` });
    }

    const evaluation = await evaluateDeposit(accountNumber, amount, req.user.adminId);
    if (!evaluation.allowed) {
      await connection.rollback();
      return res.status(403).json({ error: evaluation.reason });
    }

    const [customerDetails] = await connection.query(
      "SELECT customerName, Balance FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customerDetails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Account not found" });
    }

    const currentBalance = parseFloat(customerDetails[0].Balance);
    let newBalance = currentBalance;
    
    let status = 'COMPLETED'; // auto-approve default for backward compatibility
    
    // Determine status based on maker-checker requirements
    if (evaluation.requiresApprovalCount > 0) {
      status = 'PENDING_APPROVAL';
      // Balance is NOT updated yet
    } else if (evaluation.requiresHold) {
      status = 'HOLD';
      // Balance is NOT updated yet, wait for manual release
    } else {
      // Auto-approve, but with a 30-min reversal window (Status PENDING)
      status = 'PENDING';
      newBalance = parseFloat((currentBalance + amount).toFixed(2));
      
      await connection.query(
        "UPDATE Customer SET Balance = ? WHERE AccountNumber = ?",
        [newBalance, accountNumber]
      );
    }

    // Log the deposit
    const [depositResult] = await connection.query(
      `INSERT INTO DepositHistory (AccountNumber, DepositAmount, BeforeBalance, AfterBalance, DepositedBy, Status, ApprovalRequiredCount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [accountNumber, amount, currentBalance, newBalance, req.user.adminId || null, status, evaluation.requiresApprovalCount]
    );
    const depositId = depositResult.insertId;

    if (status === 'PENDING') {
      // Record double entry immediately since balance is updated
      await recordJournalEntry(connection, {
        transactionType: "Deposit",
        description: `Deposit by admin to A/C ${accountNumber}`,
        referenceId: `DEP${depositId}`,
        entries: [
          {
            accountName: "Asset: Bank Cash",
            subAccountNumber: null,
            entryType: "Debit",
            amount: amount,
          },
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: accountNumber,
            entryType: "Credit",
            amount: amount,
          },
        ],
      });
    }

    await connection.commit();
    
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'DEPOSIT',
      category: 'Financial', entityType: 'Customer', entityId: accountNumber,
      ipAddress: getClientIP(req),
      description: `Deposited ₹${amount}. Status: ${status}. Flags: ${evaluation.flags ? evaluation.flags.join(', ') : 'None'}`,
    });

    if (status === 'PENDING_APPROVAL') {
      await db.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Deposit Pending Approval', ?, 'info')`,
        [accountNumber, `A deposit of ₹${amount} requires manager approval.`]
      );
    } else if (status === 'PENDING') {
      await db.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Deposit Received', ?, 'success')`,
        [accountNumber, `A deposit of ₹${amount} was received and is pending a 30-minute clearing window.`]
      );
    }

    return res.status(200).json({ 
      message: status === 'PENDING_APPROVAL' ? "Deposit requires manager approval." : "Deposit processed successfully.",
      status,
      depositId
    });

  } catch (error) {
    await connection.rollback();
    console.error("Deposit error:", error);
    res.status(500).json({ error: "Failed to deposit money" });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /admin/verifyAccount/:accountNumber - Check if account exists
// ============================================================
route.get("/verifyAccount/:accountNumber", verifyToken, requirePermission('verify_accounts'), async (req, res) => {
  let connection;
  try {
    const { accountNumber } = req.params;
    connection = await db.getConnection();

    const [accountDetails] = await connection.query(
      "SELECT customerName, AccountType FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (accountDetails.length === 0) {
      return res.status(404).json({ accountExists: false });
    }

    res.status(200).json({
      accountExists: true,
      accountName: accountDetails[0].customerName,
      accountType: accountDetails[0].AccountType,
    });
  } catch (error) {
    console.error("Verify account error:", error);
    res.status(500).json({ error: "Failed to verify account" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/verifyCustomerAccount - Mark account as verified
// ============================================================
route.post("/verifyCustomerAccount", verifyToken, requirePermission('verify_accounts'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { accountNumber } = req.body;

    if (!accountNumber) {
      return res.status(400).json({ error: "Account number is required" });
    }

    connection = await db.getConnection();

    const [result] = await connection.query(
      "UPDATE Customer SET AccountVerify = 1 WHERE AccountNumber = ? AND AccountVerify = 0",
      [accountNumber]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Account not found or already verified" });
    }

    // Notification
    await db.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, 'Account Verified!', 'Your account has been verified. You can now make transfers and apply for loans.', 'success')`,
      [accountNumber]
    );

    res.status(200).json({ message: "Account verified successfully" });

    // Audit: Account verification
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ACCOUNT_VERIFIED',
      category: 'Admin', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      oldValues: { accountVerify: false },
      newValues: { accountVerify: true },
      description: `Account ${accountNumber} verified by admin`,
    });
  } catch (error) {
    console.error("Verify customer error:", error);
    res.status(500).json({ error: "Failed to verify account" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/reports - Unverified accounts (all of them)
// ============================================================
route.get("/reports", verifyToken, requirePermission('view_customers'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [unverifiedAccounts] = await connection.query(
      `SELECT AccountNumber, customerName, customerEmail, customerPhone,
              AccountType, createdAt, AccountVerify
       FROM Customer WHERE AccountVerify = 0 ORDER BY createdAt DESC`
    );

    res.status(200).json({ accounts: unverifiedAccounts });
  } catch (error) {
    console.error("Reports error:", error);
    res.status(500).json({ error: "Failed to fetch reports" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/customer/searchByName - Search customers
// ============================================================
route.get("/customer/searchByName", verifyToken, requirePermission('view_customers'), async (req, res) => {
  let connection;
  try {
    const { name } = req.query;
    connection = await db.getConnection();

    const [results] = await connection.query(
      `SELECT AccountNumber, customerName, AccountType, customerPhone, customerEmail,
              customerAddress, customerCity, Balance, AccountVerify, isActive
       FROM Customer WHERE customerName LIKE ?`,
      [`%${name}%`]
    );

    if (results.length > 0) {
      res.json(results);
    } else {
      res.status(404).json({ message: "No accounts found for this name" });
    }
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ message: "Error retrieving account" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/customer/update - Update customer details
// ============================================================
route.post("/customer/update", verifyToken, requirePermission('edit_customers'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { accountNumber } = req.query;
    const { customerName, customerPhone, customerEmail, customerAddress, customerCity } = req.body;

    connection = await db.getConnection();

    await connection.query(
      `UPDATE Customer SET customerName = ?, customerPhone = ?, customerEmail = ?,
       customerAddress = ?, customerCity = ? WHERE AccountNumber = ?`,
      [customerName, customerPhone, customerEmail, customerAddress, customerCity, accountNumber]
    );

    res.status(200).json({ message: "Customer updated successfully" });

    // Audit: Customer update
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'CUSTOMER_UPDATED',
      category: 'Admin', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      newValues: { customerName, customerEmail, customerPhone, customerAddress, customerCity },
      description: `Customer ${accountNumber} profile updated by admin`,
    });
  } catch (error) {
    console.error("Update error:", error);
    res.status(500).json({ error: "Failed to update customer" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/customers/:accountNumber/toggle-block - Freeze/unfreeze user
// ============================================================
route.post("/customers/:accountNumber/toggle-block", verifyToken, requirePermission('block_accounts'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { accountNumber } = req.params;
    connection = await db.getConnection();

    const [customer] = await connection.query(
      "SELECT isActive, customerName FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const newActiveState = customer[0].isActive === 1 ? 0 : 1;
    await connection.query(
      "UPDATE Customer SET isActive = ? WHERE AccountNumber = ?",
      [newActiveState, accountNumber]
    );

    const action = newActiveState === 1 ? "unblocked" : "blocked";

    // Send in-app notification
    await connection.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, ?, ?, ?)`,
      [
        accountNumber,
        newActiveState === 1 ? "Account Activated" : "Account Suspended",
        newActiveState === 1
          ? "Your account has been reactivated. Full services are restored."
          : "Your account has been suspended by the administrator. Please contact customer support.",
        newActiveState === 1 ? "info" : "alert",
      ]
    );

    res.status(200).json({
      message: `Customer ${customer[0].customerName} (${accountNumber}) has been ${action} successfully.`,
      isActive: newActiveState,
    });

    // Audit: Account block/unblock
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(),
      action: newActiveState === 1 ? 'ACCOUNT_UNBLOCKED' : 'ACCOUNT_BLOCKED',
      category: 'Admin', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      oldValues: { isActive: customer[0].isActive },
      newValues: { isActive: newActiveState },
      description: `Account ${accountNumber} (${customer[0].customerName}) ${action} by admin`,
    });
  } catch (error) {
    console.error("Toggle block error:", error);
    res.status(500).json({ error: "Failed to toggle customer block status" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/support/tickets - View all support tickets
// ============================================================
route.get("/support/tickets", verifyToken, requirePermission('view_tickets'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [tickets] = await connection.query(
      `SELECT t.*, c.customerName, c.customerEmail, c.customerPhone
       FROM HelpTicket t
       JOIN Customer c ON t.AccountNumber = c.AccountNumber
       ORDER BY t.CreatedAt DESC`
    );

    res.status(200).json({ tickets });
  } catch (error) {
    console.error("Fetch all tickets error:", error);
    res.status(500).json({ error: "Failed to retrieve support tickets" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/support/tickets/:ticketId/reply - Reply to support ticket
// ============================================================
route.post("/support/tickets/:ticketId/reply", verifyToken, requirePermission('reply_tickets'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { ticketId } = req.params;
    const { adminReply, status = "Closed" } = req.body;
    const adminId = req.user.adminId;

    if (!adminReply) {
      return res.status(400).json({ error: "Reply message is required" });
    }

    connection = await db.getConnection();

    const [ticket] = await connection.query(
      "SELECT AccountNumber, Subject FROM HelpTicket WHERE TicketID = ?",
      [ticketId]
    );

    if (ticket.length === 0) {
      return res.status(404).json({ error: "Ticket not found" });
    }

    await connection.query(
      `UPDATE HelpTicket SET AdminReply = ?, Status = ?, RepliedBy = ?, UpdatedAt = NOW()
       WHERE TicketID = ?`,
      [adminReply, status, adminId, ticketId]
    );

    // Notify user
    await connection.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, ?, ?, ?)`,
      [
        ticket[0].AccountNumber,
        "Support Ticket Replied",
        `Admin has replied to your ticket "${ticket[0].Subject}". Status: ${status}`,
        "info"
      ]
    );

    res.status(200).json({ message: "Reply submitted and ticket updated successfully" });

    // Audit: Ticket reply
    logAudit({
      actorType: 'admin', actorId: adminId.toString(), action: 'TICKET_REPLIED',
      category: 'Admin', entityType: 'HelpTicket', entityId: ticketId.toString(),
      ipAddress: getClientIP(req),
      newValues: { ticketId, status, accountNumber: ticket[0].AccountNumber },
      description: `Admin replied to support ticket #${ticketId} (${ticket[0].Subject}). Status: ${status}`,
    });
  } catch (error) {
    console.error("Reply ticket error:", error);
    res.status(500).json({ error: "Failed to submit reply" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/disputes - View all disputed transactions
// ============================================================
route.get("/disputes", verifyToken, requirePermission('view_disputes'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [disputes] = await connection.query(
      `SELECT d.*, c.customerName, c.customerEmail,
              t.TransactionType, t.TransactionAmount, t.TransactionDate, t.Description as TxDescription, t.ReferenceID
       FROM Dispute d
       JOIN Customer c ON d.AccountNumber = c.AccountNumber
       JOIN TransactionHistory t ON d.TransactionID = t.TransactionID
       ORDER BY d.CreatedAt DESC`
    );

    res.status(200).json({ disputes });
  } catch (error) {
    console.error("Fetch all disputes error:", error);
    res.status(500).json({ error: "Failed to retrieve disputes" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/disputes/:disputeId/resolve - Resolve/Reject dispute with reversal
// ============================================================
route.post("/disputes/:disputeId/resolve", verifyToken, requirePermission('resolve_disputes'), upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { disputeId } = req.params;
    const { action, adminRemarks } = req.body;
    const adminId = req.user.adminId;

    if (!["Resolve", "Reject"].includes(action)) {
      return res.status(400).json({ error: "Action must be Resolve or Reject" });
    }

    await connection.beginTransaction();

    const [disputeRows] = await connection.query(
      "SELECT * FROM Dispute WHERE DisputeID = ?",
      [disputeId]
    );
    if (disputeRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Dispute not found" });
    }
    const dispute = disputeRows[0];

    if (dispute.DisputeStatus !== "Open") {
      await connection.rollback();
      return res.status(400).json({ error: "This dispute has already been processed." });
    }

    if (action === "Reject") {
      await connection.query(
        "UPDATE Dispute SET DisputeStatus = 'Rejected', AdminRemarks = ?, ResolvedBy = ?, ResolvedAt = NOW() WHERE DisputeID = ?",
        [adminRemarks || "Dispute rejected after review.", adminId, disputeId]
      );

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Dispute Rejected', 'Your dispute claim has been reviewed and rejected.', 'warning')`,
        [dispute.AccountNumber]
      );

      await connection.commit();
      return res.status(200).json({ message: "Dispute rejected successfully." });
    }

    const [txRows] = await connection.query(
      "SELECT * FROM TransactionHistory WHERE TransactionID = ?",
      [dispute.TransactionID]
    );
    if (txRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Disputed transaction not found in history." });
    }
    const tx = txRows[0];

    if (tx.TransactionType === "Transfer") {
      if (!tx.ReferenceID || !tx.ReferenceID.startsWith("TXN")) {
        await connection.rollback();
        return res.status(400).json({ error: "Cannot reverse transaction: missing transfer reference ID." });
      }
      const transferId = parseInt(tx.ReferenceID.replace("TXN", ""));

      const [transferRows] = await connection.query(
        "SELECT * FROM TransferMoney WHERE TransferId = ?",
        [transferId]
      );
      if (transferRows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Corresponding transfer details not found." });
      }
      const transfer = transferRows[0];

      const senderAcc = transfer.AccountNumber;
      const receiverAcc = transfer.ToAccount;
      const amount = parseFloat(transfer.TransferAmount);

      const [senderProfile] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [senderAcc]);
      const [receiverProfile] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [receiverAcc]);

      if (senderProfile.length === 0 || receiverProfile.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Sender or receiver account not found." });
      }

      const receiverBalance = parseFloat(receiverProfile[0].Balance);
      if (receiverBalance < amount) {
        await connection.rollback();
        return res.status(400).json({ error: "Cannot resolve dispute: Accused account has insufficient funds to reverse the transfer." });
      }

      const senderNewBal = parseFloat(senderProfile[0].Balance) + amount;
      const receiverNewBal = receiverBalance - amount;

      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [senderNewBal, senderAcc]);
      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [receiverNewBal, receiverAcc]);

      await connection.query(
        `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
         VALUES (?, 'Deposit', ?, ?, ?, ?)`,
        [
          senderAcc,
          amount,
          senderNewBal,
          `REVERSAL CREDIT: Refund for disputed transfer to ${receiverAcc} (Dispute #${disputeId})`,
          `REV${transferId}`
        ]
      );

      await connection.query(
        `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
         VALUES (?, ?, ?, ?, 'Reversal')`,
        [senderAcc, senderProfile[0].Balance, senderNewBal, amount]
      );

      await connection.query(
        `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
         VALUES (?, 'Withdrawal', ?, ?, ?, ?)`,
        [
          receiverAcc,
          amount,
          receiverNewBal,
          `REVERSAL DEBIT: Funds clawback for disputed transfer from ${senderAcc} (Dispute #${disputeId})`,
          `REV${transferId}`
        ]
      );

      await connection.query(
        `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
         VALUES (?, ?, ?, ?, 'Reversal')`,
        [receiverAcc, receiverProfile[0].Balance, receiverNewBal, amount]
      );

      // Record double entry: credit sender deposits, debit receiver deposits
      await recordJournalEntry(connection, {
        transactionType: "Reversal",
        description: `Dispute #${disputeId} Resolved: Reversal of Transfer to ${receiverAcc}`,
        referenceId: `REV${transferId}`,
        entries: [
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: senderAcc,
            entryType: "Credit",
            amount: amount,
          },
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: receiverAcc,
            entryType: "Debit",
            amount: amount,
          },
        ],
      });

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Dispute Resolved & Refunded', ?, 'success')`,
        [senderAcc, `Dispute #${disputeId} resolved. A refund of ₹${amount} has been credited to your account.`]
      );

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Account Debited (Reversal)', ?, 'alert')`,
        [receiverAcc, `A transfer of ₹${amount} from ${senderAcc} has been reversed due to a resolved dispute claim.`]
      );

    } else if (tx.TransactionType === "Withdrawal") {
      const customerAcc = tx.AccountNumber;
      const amount = parseFloat(tx.TransactionAmount);

      const [profile] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [customerAcc]);
      if (profile.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Customer account not found." });
      }

      const newBal = parseFloat(profile[0].Balance) + amount;
      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [newBal, customerAcc]);

      await connection.query(
        `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
         VALUES (?, 'Deposit', ?, ?, ?, ?)`,
        [customerAcc, amount, newBal, `REVERSAL CREDIT: Refund for disputed withdrawal (Dispute #${disputeId})`, `REVW${dispute.TransactionID}`]
      );

      await connection.query(
        `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
         VALUES (?, ?, ?, ?, 'Reversal')`,
        [customerAcc, profile[0].Balance, newBal, amount]
      );

      // Record double entry: debit expense (write-offs/reversals), credit customer deposits
      await recordJournalEntry(connection, {
        transactionType: "Reversal",
        description: `Dispute #${disputeId} Resolved: Refund for disputed withdrawal`,
        referenceId: `REVW${dispute.TransactionID}`,
        entries: [
          {
            accountName: "Expense: Write-offs & Reversals",
            subAccountNumber: null,
            entryType: "Debit",
            amount: amount,
          },
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: customerAcc,
            entryType: "Credit",
            amount: amount,
          },
        ],
      });

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Dispute Resolved & Refunded', ?, 'success')`,
        [customerAcc, `Dispute #${disputeId} resolved. A refund of ₹${amount} has been credited back.`]
      );

    } else if (tx.TransactionType === "Deposit") {
      const customerAcc = tx.AccountNumber;
      const amount = parseFloat(tx.TransactionAmount);

      const [profile] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [customerAcc]);
      if (profile.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Customer account not found." });
      }

      const customerBalance = parseFloat(profile[0].Balance);
      if (customerBalance < amount) {
        await connection.rollback();
        return res.status(400).json({ error: "Cannot resolve dispute: Customer account has insufficient funds to reverse this deposit." });
      }

      const newBal = customerBalance - amount;
      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [newBal, customerAcc]);

      await connection.query(
        `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
         VALUES (?, 'Withdrawal', ?, ?, ?, ?)`,
        [customerAcc, amount, newBal, `REVERSAL DEBIT: Clawback for disputed deposit (Dispute #${disputeId})`, `REVD${dispute.TransactionID}`]
      );

      await connection.query(
        `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
         VALUES (?, ?, ?, ?, 'Reversal')`,
        [customerAcc, profile[0].Balance, newBal, amount]
      );

      // Record double entry: debit customer deposits, credit expense (write-offs/reversals)
      await recordJournalEntry(connection, {
        transactionType: "Reversal",
        description: `Dispute #${disputeId} Resolved: Clawback for disputed deposit`,
        referenceId: `REVD${dispute.TransactionID}`,
        entries: [
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: customerAcc,
            entryType: "Debit",
            amount: amount,
          },
          {
            accountName: "Expense: Write-offs & Reversals",
            subAccountNumber: null,
            entryType: "Credit",
            amount: amount,
          },
        ],
      });

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Dispute Resolved (Debit Reversal)', ?, 'alert')`,
        [customerAcc, `Dispute #${disputeId} resolved. Deposited funds of ₹${amount} have been reversed.`]
      );
    } else {
      await connection.rollback();
      return res.status(400).json({ error: "Reversal not supported for this transaction type." });
    }

    await connection.query(
      "UPDATE Dispute SET DisputeStatus = 'Resolved', AdminRemarks = ?, ResolvedBy = ?, ResolvedAt = NOW() WHERE DisputeID = ?",
      [adminRemarks || "Dispute resolved and funds reversed.", adminId, disputeId]
    );

    await connection.commit();
    res.status(200).json({ message: "Dispute resolved and funds reversed successfully." });

    // Audit: Dispute resolved
    logAudit({
      actorType: 'admin', actorId: adminId.toString(), action: 'DISPUTE_RESOLVED',
      category: 'Admin', entityType: 'Dispute', entityId: disputeId.toString(),
      ipAddress: getClientIP(req),
      newValues: { disputeId, adminRemarks },
      description: `Dispute #${disputeId} resolved by admin`,
    });
  } catch (error) {
    console.error("Resolve dispute error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to process dispute resolution" });
  } finally {
    connection.release();
  }
});

// ============================================================
// POST /admin/loans/apply-late-fees - Scan and apply late fees
// ============================================================
route.post("/loans/apply-late-fees", verifyToken, requirePermission('approve_loans'), upload.none(), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [overdueLoans] = await connection.query(
      `SELECT LoanID, AccountNumber, MonthlyEMI, NextRepaymentDueDate, TotalPayableAmount, AmountRepaid, LateFee
       FROM Loan
       WHERE ApprovalStatus = 'Approved'
         AND RepaymentStatus IN ('Active', 'Overdue')
         AND NextRepaymentDueDate < NOW()`
    );

    if (overdueLoans.length === 0) {
      return res.status(200).json({ message: "No overdue loans found." });
    }

    const flatLateFee = 250.00;
    let updatedCount = 0;

    for (const loan of overdueLoans) {
      const nextDue = new Date(loan.NextRepaymentDueDate);
      nextDue.setMonth(nextDue.getMonth() + 1);

      const newLateFee = parseFloat(loan.LateFee || 0) + flatLateFee;

      await connection.query(
        `UPDATE Loan
         SET RepaymentStatus = 'Overdue', LateFee = ?, NextRepaymentDueDate = ?
         WHERE LoanID = ?`,
        [newLateFee, nextDue, loan.LoanID]
      );

      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Loan Overdue Alert!', ?, 'alert')`,
        [
          loan.AccountNumber,
          `Your repayment for Loan #${loan.LoanID} is overdue. A late fee of ₹${flatLateFee} was charged. Outstanding is now overdue.`
        ]
      );

      updatedCount++;
    }

    res.status(200).json({
      message: `Late fee processing completed. ${updatedCount} loans marked overdue and charged late fees.`,
      updatedCount,
    });
  } catch (error) {
    console.error("Apply late fee error:", error);
    res.status(500).json({ error: "Failed to process late fees" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/ledger - View all General Ledger & Journal Entries
// ============================================================
route.get("/ledger", verifyToken, requirePermission('view_ledger'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    // Query to fetch all JournalEntries ordered by CreatedAt desc
    const [journals] = await connection.query(
      "SELECT * FROM JournalEntry ORDER BY CreatedAt DESC LIMIT 200"
    );

    if (journals.length === 0) {
      return res.status(200).json({ ledger: [] });
    }

    const journalIds = journals.map(j => j.JournalID);

    // Query all ledger entries belonging to these journals
    const [ledgerLines] = await connection.query(
      `SELECT le.*, la.AccountName, la.AccountType, c.customerName
       FROM LedgerEntry le
       JOIN LedgerAccount la ON le.AccountID = la.AccountID
       LEFT JOIN Customer c ON le.SubAccountNumber = c.AccountNumber
       WHERE le.JournalID IN (?)
       ORDER BY le.EntryID ASC`,
      [journalIds]
    );

    // Group ledger lines by JournalID
    const linesByJournal = {};
    for (const line of ledgerLines) {
      if (!linesByJournal[line.JournalID]) {
        linesByJournal[line.JournalID] = [];
      }
      linesByJournal[line.JournalID].push(line);
    }

    // Assemble the complete ledger list
    const ledger = journals.map(j => ({
      ...j,
      entries: linesByJournal[j.JournalID] || []
    }));

    res.status(200).json({ ledger });
  } catch (error) {
    console.error("Fetch ledger error:", error);
    res.status(500).json({ error: "Failed to retrieve general ledger" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/investigation-cases - Retrieve all fraud cases
// ============================================================
route.get("/investigation-cases", verifyToken, requirePermission('view_disputes'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const [cases] = await connection.query(
      `SELECT ic.*, 
              vc.customerName as VictimName, vc.customerEmail as VictimEmail,
              sc.customerName as SuspectName, sc.customerEmail as SuspectEmail,
              t.TransactionType, t.TransactionDate, t.Description as TxDescription, t.ReferenceID,
              d.DisputeReason, d.DisputeStatus
       FROM InvestigationCase ic
       JOIN Customer vc ON ic.VictimAccountNumber = vc.AccountNumber
       JOIN Customer sc ON ic.SuspectAccountNumber = sc.AccountNumber
       JOIN Dispute d ON ic.DisputeID = d.DisputeID
       JOIN TransactionHistory t ON ic.TransactionID = t.TransactionID
       ORDER BY ic.CreatedAt DESC`
    );

    res.status(200).json({ cases });
  } catch (error) {
    console.error("Fetch investigation cases error:", error);
    res.status(500).json({ error: "Failed to retrieve investigation cases" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/investigation-cases/:caseId/resolve - Resolve fraud case
// ============================================================
route.post("/investigation-cases/:caseId/resolve", verifyToken, requirePermission('resolve_cases'), upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    const { caseId } = req.params;
    const { action, adminRemarks } = req.body;
    const adminId = req.user.adminId;

    if (!["Approve_Refund", "Close_Case"].includes(action)) {
      return res.status(400).json({ error: "Action must be Approve_Refund or Close_Case" });
    }

    await connection.beginTransaction();

    // Check if case exists and is Open
    const [caseRows] = await connection.query(
      "SELECT * FROM InvestigationCase WHERE CaseID = ?",
      [caseId]
    );

    if (caseRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Investigation case not found" });
    }

    const currentCase = caseRows[0];
    if (currentCase.CaseStatus !== "Open") {
      await connection.rollback();
      return res.status(400).json({ error: "This case has already been resolved or closed." });
    }

    const victimAcc = currentCase.VictimAccountNumber;
    const suspectAcc = currentCase.SuspectAccountNumber;
    const amount = parseFloat(currentCase.DisputedAmount);
    const disputeId = currentCase.DisputeID;
    const transactionId = currentCase.TransactionID;

    // Retrieve original transaction details
    const [txRows] = await connection.query(
      "SELECT * FROM TransactionHistory WHERE TransactionID = ?",
      [transactionId]
    );
    if (txRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Original transaction not found" });
    }
    const originalTx = txRows[0];

    if (action === "Approve_Refund") {
      // Safety cap check: large refunds require superadmin role
      if (amount > 100000 && req.user.role !== "superadmin") {
        await connection.rollback();
        return res.status(403).json({
          error: "Write-off limit exceeded. Bank-funded refunds above ₹100,000 require Superadmin approval."
        });
      }

      // 1. Bank-Funded Refund (Victim receives the amount, Bank absorbs loss)
      const [victimProfile] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [victimAcc]);
      if (victimProfile.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Victim account not found" });
      }

      const victimNewBal = parseFloat(victimProfile[0].Balance) + amount;
      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [victimNewBal, victimAcc]);

      // 2. Log Deposit in TransactionHistory for Victim
      await connection.query(
        `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID, TransactionStatus)
         VALUES (?, 'Deposit', ?, ?, ?, ?, 'SUCCESS')`,
        [
          victimAcc,
          amount,
          victimNewBal,
          `ADMIN-REFUND: Fraud claim resolution (Case #${caseId})`,
          `REV${originalTx.ReferenceID || 'UNKNOWN'}`,
        ]
      );

      // 3. Log in BalanceLog
      await connection.query(
        `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
         VALUES (?, ?, ?, ?, 'Reversal')`,
        [victimAcc, victimProfile[0].Balance, victimNewBal, amount]
      );

      // 4. Record Double-Entry (Debit Bank Expense, Credit Customer Deposits)
      await recordJournalEntry(connection, {
        transactionType: "Reversal",
        description: `Fraud Case #${caseId} Reversal: Refund funded by bank`,
        referenceId: `REV${originalTx.ReferenceID || 'UNKNOWN'}`,
        entries: [
          {
            accountName: "Expense: Write-offs & Reversals",
            subAccountNumber: null,
            entryType: "Debit",
            amount: amount,
          },
          {
            accountName: "Liability: Customer Deposits",
            subAccountNumber: victimAcc,
            entryType: "Credit",
            amount: amount,
          },
        ],
      });

      // 5. Update transaction status in TransactionHistory to CHARGEBACK
      await connection.query(
        "UPDATE TransactionHistory SET TransactionStatus = 'CHARGEBACK' WHERE TransactionID = ?",
        [transactionId]
      );

      // 6. Update dispute and case status to Resolved
      await connection.query(
        "UPDATE Dispute SET DisputeStatus = 'Resolved', AdminRemarks = ?, ResolvedBy = ?, ResolvedAt = NOW() WHERE DisputeID = ?",
        [adminRemarks || "Fraud case resolved. Refunded by bank.", adminId, disputeId]
      );

      await connection.query(
        "UPDATE InvestigationCase SET CaseStatus = 'Resolved', AdminRemarks = ? WHERE CaseID = ?",
        [adminRemarks || "Fraud case resolved. Refunded by bank.", caseId]
      );

      // 7. Notification to victim
      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Fraud Refund Processed', ?, 'success')`,
        [victimAcc, `Your fraud dispute for transaction #${transactionId} was approved. A refund of ₹${amount} has been credited to your account.`]
      );

    } else if (action === "Close_Case") {
      // Victim claim rejected, no refund, case closed
      // 1. Update disputed transaction status in TransactionHistory to FAILED
      await connection.query(
        "UPDATE TransactionHistory SET TransactionStatus = 'FAILED' WHERE TransactionID = ?",
        [transactionId]
      );

      // 2. Update dispute and case status to Closed/Rejected
      await connection.query(
        "UPDATE Dispute SET DisputeStatus = 'Rejected', AdminRemarks = ?, ResolvedBy = ?, ResolvedAt = NOW() WHERE DisputeID = ?",
        [adminRemarks || "Fraud case closed. No refund approved.", adminId, disputeId]
      );

      await connection.query(
        "UPDATE InvestigationCase SET CaseStatus = 'Closed', AdminRemarks = ? WHERE CaseID = ?",
        [adminRemarks || "Fraud case closed. No refund approved.", caseId]
      );

      // 3. Reactivate suspect account
      await connection.query(
        "UPDATE Customer SET isActive = 1 WHERE AccountNumber = ?",
        [suspectAcc]
      );

      // 4. Notification to suspect
      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Account Reactivated', 'Your account has been reactivated following the completion of the dispute review.', 'success')`,
        [suspectAcc]
      );

      // 5. Notification to victim
      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type)
         VALUES (?, 'Fraud Dispute Rejected', ?, 'warning')`,
        [victimAcc, `Your fraud claim for transaction #${transactionId} was reviewed and rejected.`]
      );
    }

    await connection.commit();
    res.status(200).json({ message: "Fraud investigation case resolved successfully" });

    // Audit: Investigation case resolved
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'CASE_RESOLVED',
      category: 'Admin', entityType: 'InvestigationCase', entityId: caseId.toString(),
      ipAddress: getClientIP(req),
      newValues: { caseId, action: resolveAction, adminRemarks, disputedAmount: parseFloat(caseDetails.DisputedAmount) },
      description: `Investigation case #${caseId} resolved with action: ${resolveAction}`,
    });
  } catch (error) {
    console.error("Resolve fraud case error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to resolve fraud case" });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /admin/audit-logs - View paginated & filtered audit trail
// ============================================================
route.get("/audit-logs", verifyToken, requirePermission('view_audit'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    // Build dynamic WHERE clause from filters
    const conditions = [];
    const params = [];

    if (req.query.category) {
      conditions.push("Category = ?");
      params.push(req.query.category);
    }
    if (req.query.actorType) {
      conditions.push("ActorType = ?");
      params.push(req.query.actorType);
    }
    if (req.query.action) {
      conditions.push("Action LIKE ?");
      params.push(`%${req.query.action}%`);
    }
    if (req.query.entityId) {
      conditions.push("EntityID = ?");
      params.push(req.query.entityId);
    }
    if (req.query.actorId) {
      conditions.push("ActorID = ?");
      params.push(req.query.actorId);
    }
    if (req.query.startDate) {
      conditions.push("Timestamp >= ?");
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      conditions.push("Timestamp <= ?");
      params.push(req.query.endDate + " 23:59:59");
    }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Get total count
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM AuditLog ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Get paginated results
    const [logs] = await connection.query(
      `SELECT * FROM AuditLog ${whereClause} ORDER BY Timestamp DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Parse JSON fields
    const parsedLogs = logs.map(log => ({
      ...log,
      OldValues: log.OldValues ? (typeof log.OldValues === 'string' ? JSON.parse(log.OldValues) : log.OldValues) : null,
      NewValues: log.NewValues ? (typeof log.NewValues === 'string' ? JSON.parse(log.NewValues) : log.NewValues) : null,
    }));

    // Get category counts for tab badges
    const [categoryCounts] = await connection.query(
      `SELECT Category, COUNT(*) as count FROM AuditLog GROUP BY Category`
    );

    res.status(200).json({
      logs: parsedLogs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      categoryCounts: categoryCounts.reduce((acc, row) => { acc[row.Category] = row.count; return acc; }, {}),
    });

    // Audit: Viewing audit logs (fire-and-forget, no connection param so it uses pool)
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'AUDIT_LOGS_VIEWED',
      category: 'Admin', entityType: 'AuditLog',
      ipAddress: getClientIP(req),
      newValues: { page, limit, filters: req.query },
      description: `Admin viewed audit logs (page ${page})`,
    });
  } catch (error) {
    console.error("Fetch audit logs error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/audit-logs/export - Export filtered audit trail as CSV or JSON
// ============================================================
route.get("/audit-logs/export", verifyToken, requirePermission('export_audit'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();

    // Build dynamic WHERE clause from filters (same as above, without pagination)
    const conditions = [];
    const params = [];

    if (req.query.category) { conditions.push("Category = ?"); params.push(req.query.category); }
    if (req.query.actorType) { conditions.push("ActorType = ?"); params.push(req.query.actorType); }
    if (req.query.action) { conditions.push("Action LIKE ?"); params.push(`%${req.query.action}%`); }
    if (req.query.entityId) { conditions.push("EntityID = ?"); params.push(req.query.entityId); }
    if (req.query.actorId) { conditions.push("ActorID = ?"); params.push(req.query.actorId); }
    if (req.query.startDate) { conditions.push("Timestamp >= ?"); params.push(req.query.startDate); }
    if (req.query.endDate) { conditions.push("Timestamp <= ?"); params.push(req.query.endDate + " 23:59:59"); }

    const whereClause = conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    const [logs] = await connection.query(
      `SELECT * FROM AuditLog ${whereClause} ORDER BY Timestamp DESC`,
      params
    );

    const accept = req.headers.accept || "";
    const format = req.query.format || (accept.includes("text/csv") ? "csv" : "json");

    if (format === "csv") {
      // Generate CSV
      const headers = ["AuditID", "Timestamp", "ActorType", "ActorID", "Action", "Category", "EntityType", "EntityID", "IPAddress", "OldValues", "NewValues", "Description"];
      const csvRows = [headers.join(",")];
      for (const log of logs) {
        const row = headers.map(h => {
          let val = log[h];
          if (val === null || val === undefined) return "";
          if (typeof val === "object") val = JSON.stringify(val);
          // Escape CSV: wrap in quotes and escape inner quotes
          val = String(val).replace(/"/g, '""');
          return `"${val}"`;
        });
        csvRows.push(row.join(","));
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=audit_trail_${new Date().toISOString().slice(0,10)}.csv`);
      res.status(200).send(csvRows.join("\n"));
    } else {
      // JSON export
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename=audit_trail_${new Date().toISOString().slice(0,10)}.json`);
      res.status(200).json({
        exportDate: new Date().toISOString(),
        totalRecords: logs.length,
        filters: req.query,
        data: logs.map(log => ({
          ...log,
          OldValues: log.OldValues ? (typeof log.OldValues === 'string' ? JSON.parse(log.OldValues) : log.OldValues) : null,
          NewValues: log.NewValues ? (typeof log.NewValues === 'string' ? JSON.parse(log.NewValues) : log.NewValues) : null,
        })),
      });
    }

    // Audit: Exporting audit logs
    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'AUDIT_LOGS_EXPORTED',
      category: 'Admin', entityType: 'AuditLog',
      ipAddress: getClientIP(req),
      newValues: { format, recordCount: logs.length, filters: req.query },
      description: `Admin exported ${logs.length} audit logs as ${format.toUpperCase()}`,
    });
  } catch (error) {
    console.error("Export audit logs error:", error);
    res.status(500).json({ error: "Failed to export audit logs" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
//  RBAC MANAGEMENT ENDPOINTS
// ============================================================

// GET /admin/roles - List all roles with permissions
route.get("/roles", verifyToken, requirePermission('manage_roles'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [roles] = await connection.query("SELECT * FROM Role ORDER BY RoleID ASC");
    const [allPerms] = await connection.query("SELECT * FROM RolePermission ORDER BY RoleID");

    const rolesWithPerms = roles.map(role => ({
      ...role,
      permissions: allPerms.filter(p => p.RoleID === role.RoleID).map(p => p.Permission),
    }));

    // Include the full list of available permissions for the UI
    const ALL_PERMISSIONS = [
      'view_dashboard', 'view_customers', 'edit_customers', 'verify_accounts',
      'block_accounts', 'deposit_money', 'view_loans', 'approve_loans',
      'view_disputes', 'resolve_disputes', 'resolve_cases',
      'view_audit', 'export_audit', 'view_tickets', 'reply_tickets',
      'view_ledger', 'manage_roles', 'manage_admins'
    ];

    res.status(200).json({ roles: rolesWithPerms, availablePermissions: ALL_PERMISSIONS });
  } catch (error) {
    console.error("Fetch roles error:", error);
    res.status(500).json({ error: "Failed to fetch roles" });
  } finally {
    if (connection) connection.release();
  }
});

// POST /admin/roles - Create a new role
route.post("/roles", verifyToken, requirePermission('manage_roles'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { roleName, description, permissions } = req.body;
    if (!roleName || !permissions) {
      return res.status(400).json({ error: "Role name and permissions are required" });
    }

    const permList = typeof permissions === "string" ? JSON.parse(permissions) : permissions;

    connection = await db.getConnection();

    const [existing] = await connection.query("SELECT RoleID FROM Role WHERE RoleName = ?", [roleName]);
    if (existing.length > 0) {
      return res.status(409).json({ error: "Role name already exists" });
    }

    await connection.beginTransaction();

    const [result] = await connection.query(
      "INSERT INTO Role (RoleName, Description, IsSystem) VALUES (?, ?, FALSE)",
      [roleName, description || null]
    );
    const newRoleId = result.insertId;

    for (const perm of permList) {
      await connection.query("INSERT INTO RolePermission (RoleID, Permission) VALUES (?, ?)", [newRoleId, perm]);
    }

    await connection.commit();

    res.status(201).json({ message: "Role created successfully", roleId: newRoleId });

    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ROLE_CREATED',
      category: 'Admin', entityType: 'Role', entityId: newRoleId.toString(),
      ipAddress: getClientIP(req),
      newValues: { roleName, permissions: permList },
      description: `Role "${roleName}" created with ${permList.length} permissions`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Create role error:", error);
    res.status(500).json({ error: "Failed to create role" });
  } finally {
    if (connection) connection.release();
  }
});

// PUT /admin/roles/:roleId - Update role permissions
route.put("/roles/:roleId", verifyToken, requirePermission('manage_roles'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { roleId } = req.params;
    const { roleName, description, permissions } = req.body;

    if (!permissions) {
      return res.status(400).json({ error: "Permissions array is required" });
    }

    const permList = typeof permissions === "string" ? JSON.parse(permissions) : permissions;

    connection = await db.getConnection();

    const [role] = await connection.query("SELECT * FROM Role WHERE RoleID = ?", [roleId]);
    if (role.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }

    await connection.beginTransaction();

    // Update role name/description if provided
    if (roleName || description !== undefined) {
      await connection.query(
        "UPDATE Role SET RoleName = COALESCE(?, RoleName), Description = COALESCE(?, Description) WHERE RoleID = ?",
        [roleName || null, description !== undefined ? description : null, roleId]
      );
    }

    // Replace permissions: delete all, re-insert
    await connection.query("DELETE FROM RolePermission WHERE RoleID = ?", [roleId]);
    for (const perm of permList) {
      await connection.query("INSERT INTO RolePermission (RoleID, Permission) VALUES (?, ?)", [roleId, perm]);
    }

    await connection.commit();

    res.status(200).json({ message: "Role updated successfully" });

    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ROLE_UPDATED',
      category: 'Admin', entityType: 'Role', entityId: roleId.toString(),
      ipAddress: getClientIP(req),
      oldValues: { roleName: role[0].RoleName },
      newValues: { roleName: roleName || role[0].RoleName, permissions: permList },
      description: `Role "${roleName || role[0].RoleName}" updated with ${permList.length} permissions`,
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Update role error:", error);
    res.status(500).json({ error: "Failed to update role" });
  } finally {
    if (connection) connection.release();
  }
});

// DELETE /admin/roles/:roleId - Delete a non-system role
route.delete("/roles/:roleId", verifyToken, requirePermission('manage_roles'), async (req, res) => {
  let connection;
  try {
    const { roleId } = req.params;
    connection = await db.getConnection();

    const [role] = await connection.query("SELECT * FROM Role WHERE RoleID = ?", [roleId]);
    if (role.length === 0) {
      return res.status(404).json({ error: "Role not found" });
    }
    if (role[0].IsSystem) {
      return res.status(403).json({ error: "Cannot delete system-defined roles" });
    }

    // Check if any admins are using this role
    const [adminsUsingRole] = await connection.query("SELECT COUNT(*) as count FROM Admin WHERE RoleID = ?", [roleId]);
    if (adminsUsingRole[0].count > 0) {
      return res.status(409).json({ error: `Cannot delete role — ${adminsUsingRole[0].count} admin(s) are assigned to it. Reassign them first.` });
    }

    await connection.query("DELETE FROM Role WHERE RoleID = ?", [roleId]);

    res.status(200).json({ message: "Role deleted successfully" });

    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ROLE_DELETED',
      category: 'Admin', entityType: 'Role', entityId: roleId.toString(),
      ipAddress: getClientIP(req),
      oldValues: { roleName: role[0].RoleName },
      description: `Role "${role[0].RoleName}" deleted`,
    });
  } catch (error) {
    console.error("Delete role error:", error);
    res.status(500).json({ error: "Failed to delete role" });
  } finally {
    if (connection) connection.release();
  }
});

// GET /admin/admins - List all admin accounts with roles
route.get("/admins", verifyToken, requirePermission('manage_admins'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [admins] = await connection.query(`
      SELECT a.AdminID, a.username, a.email, a.fullName, a.isActive, a.lastLogin, a.RoleID,
             r.RoleName, r.Description as RoleDescription
      FROM Admin a
      LEFT JOIN Role r ON a.RoleID = r.RoleID
      ORDER BY a.AdminID ASC
    `);

    res.status(200).json({ admins });
  } catch (error) {
    console.error("Fetch admins error:", error);
    res.status(500).json({ error: "Failed to fetch admins" });
  } finally {
    if (connection) connection.release();
  }
});

// POST /admin/admins/:adminId/role - Assign/change an admin's role
route.post("/admins/:adminId/role", verifyToken, requirePermission('manage_admins'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { adminId } = req.params;
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ error: "roleId is required" });
    }

    connection = await db.getConnection();

    const [admin] = await connection.query(
      "SELECT a.AdminID, a.username, a.RoleID, r.RoleName as OldRoleName FROM Admin a LEFT JOIN Role r ON a.RoleID = r.RoleID WHERE a.AdminID = ?",
      [adminId]
    );
    if (admin.length === 0) {
      return res.status(404).json({ error: "Admin not found" });
    }

    const [newRole] = await connection.query("SELECT RoleID, RoleName FROM Role WHERE RoleID = ?", [roleId]);
    if (newRole.length === 0) {
      return res.status(400).json({ error: "Invalid role ID" });
    }

    // Prevent removing your own Super Admin access
    if (parseInt(adminId) === req.user.adminId && admin[0].OldRoleName === 'Super Admin' && newRole[0].RoleName !== 'Super Admin') {
      return res.status(403).json({ error: "Cannot downgrade your own Super Admin role. Ask another Super Admin." });
    }

    await connection.query("UPDATE Admin SET RoleID = ? WHERE AdminID = ?", [roleId, adminId]);

    res.status(200).json({ message: `Role updated to "${newRole[0].RoleName}" for ${admin[0].username}` });

    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'ROLE_ASSIGNED',
      category: 'Admin', entityType: 'Admin', entityId: adminId.toString(),
      ipAddress: getClientIP(req),
      oldValues: { role: admin[0].OldRoleName || 'None' },
      newValues: { role: newRole[0].RoleName },
      description: `Admin "${admin[0].username}" role changed from "${admin[0].OldRoleName || 'None'}" to "${newRole[0].RoleName}"`,
    });
  } catch (error) {
    console.error("Assign role error:", error);
    res.status(500).json({ error: "Failed to assign role" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/settings - Get all system settings
// ============================================================
route.get("/settings", verifyToken, requirePermission('manage_settings'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [settings] = await connection.query("SELECT * FROM SystemSettings");
    res.status(200).json({ settings });
  } catch (error) {
    console.error("Get settings error:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// PUT /admin/settings - Update a specific setting
// ============================================================
route.put("/settings", verifyToken, requirePermission('manage_settings'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { key, value } = req.body;
    if (!key || value === undefined) {
      return res.status(400).json({ error: "Setting key and value are required" });
    }

    connection = await db.getConnection();
    const [existing] = await connection.query("SELECT * FROM SystemSettings WHERE SettingKey = ?", [key]);
    
    if (existing.length === 0) {
      return res.status(404).json({ error: "Setting not found" });
    }

    await connection.query("UPDATE SystemSettings SET SettingValue = ? WHERE SettingKey = ?", [value, key]);
    
    res.status(200).json({ message: "Setting updated successfully" });

    logAudit({
      actorType: 'admin', actorId: (req.user.adminId || 'unknown').toString(), action: 'UPDATE_SETTING',
      category: 'System', entityType: 'Setting', entityId: key,
      ipAddress: getClientIP(req),
      oldValues: { value: existing[0].SettingValue },
      newValues: { value },
      description: `Updated system setting "${key}" from "${existing[0].SettingValue}" to "${value}"`,
    });
  } catch (error) {
    console.error("Update setting error:", error);
    res.status(500).json({ error: "Failed to update setting" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /admin/pending-deposits - List deposits awaiting approval
// ============================================================
route.get("/pending-deposits", verifyToken, requirePermission('deposit_money'), async (req, res) => {
  let connection;
  try {
    connection = await db.getConnection();
    const [deposits] = await connection.query(`
      SELECT d.*, c.customerName, a.username as MakerName
      FROM DepositHistory d
      JOIN Customer c ON d.AccountNumber = c.AccountNumber
      LEFT JOIN Admin a ON d.DepositedBy = a.AdminID
      WHERE d.Status = 'PENDING_APPROVAL' OR d.Status = 'PENDING_OTP'
      ORDER BY d.DepositTime DESC
    `);
    res.status(200).json({ deposits });
  } catch (error) {
    console.error("Get pending deposits error:", error);
    res.status(500).json({ error: "Failed to fetch pending deposits" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/approve-deposit/:id - Approve a pending deposit
// ============================================================
route.post("/approve-deposit/:id", verifyToken, requirePermission('deposit_money'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    const { otp } = req.body;
    const adminId = req.user.adminId;

    connection = await db.getConnection();
    await connection.beginTransaction();

    const [deposits] = await connection.query("SELECT * FROM DepositHistory WHERE DepositID = ?", [id]);
    if (deposits.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Deposit not found" });
    }

    const deposit = deposits[0];
    if (deposit.Status !== 'PENDING_APPROVAL' && deposit.Status !== 'PENDING_OTP') {
      await connection.rollback();
      return res.status(400).json({ error: "Deposit is not pending approval" });
    }

    if (deposit.DepositedBy === adminId) {
      await connection.rollback();
      return res.status(403).json({ error: "Maker cannot be the Checker. Another admin must approve this." });
    }

    if (deposit.ApprovedBy1 === adminId) {
      await connection.rollback();
      return res.status(403).json({ error: "You have already approved this transaction." });
    }

    // OTP Requirement for High Value (>5,00,000)
    if (deposit.DepositAmount > 500000) {
      if (!otp) {
        // Generate OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000).toString();
        await connection.query(
          `INSERT INTO AdminNotification (AdminID, Title, Message, Type)
           VALUES (?, 'Approval OTP', ?, 'alert')`,
          [adminId, `Your OTP to approve deposit #${id} is: ${newOtp}`]
        );
        // We will store the OTP in OTPVerify using AdminID (mocked as AccountNumber for now since it's a varchar)
        await connection.query(
          `INSERT INTO OTPVerify (AccountNumber, OTPCode, ExpiresAt) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))`,
          [`ADMIN_${adminId}`, newOtp]
        );
        await connection.query("UPDATE DepositHistory SET Status = 'PENDING_OTP' WHERE DepositID = ?", [id]);
        await connection.commit();
        return res.status(200).json({ otp_required: true, message: "OTP sent to your notifications." });
      } else {
        // Verify OTP
        const [otpRows] = await connection.query(
          `SELECT OTPID FROM OTPVerify WHERE AccountNumber = ? AND OTPCode = ? AND IsUsed = 0 AND ExpiresAt > NOW() ORDER BY CreatedAt DESC LIMIT 1`,
          [`ADMIN_${adminId}`, otp]
        );
        if (otpRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: "Invalid or expired OTP" });
        }
        await connection.query("UPDATE OTPVerify SET IsUsed = 1 WHERE OTPID = ?", [otpRows[0].OTPID]);
      }
    }

    const newApprovals = deposit.CurrentApprovals + 1;
    const isFullyApproved = newApprovals >= deposit.ApprovalRequiredCount;

    if (isFullyApproved) {
      // Apply funds
      const [customer] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [deposit.AccountNumber]);
      const currentBalance = parseFloat(customer[0].Balance);
      const newBalance = parseFloat((currentBalance + parseFloat(deposit.DepositAmount)).toFixed(2));

      await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [newBalance, deposit.AccountNumber]);
      
      await connection.query(
        "UPDATE DepositHistory SET Status = 'COMPLETED', CurrentApprovals = ?, ApprovedBy1 = IFNULL(ApprovedBy1, ?), ApprovedBy2 = IF(ApprovedBy1 IS NOT NULL, ?, NULL), BeforeBalance = ?, AfterBalance = ? WHERE DepositID = ?",
        [newApprovals, adminId, adminId, currentBalance, newBalance, id]
      );

      await recordJournalEntry(connection, {
        transactionType: "Deposit",
        description: `Maker-Checker Approved Deposit to A/C ${deposit.AccountNumber}`,
        referenceId: `DEP${id}`,
        entries: [
          { accountName: "Asset: Bank Cash", subAccountNumber: null, entryType: "Debit", amount: deposit.DepositAmount },
          { accountName: "Liability: Customer Deposits", subAccountNumber: deposit.AccountNumber, entryType: "Credit", amount: deposit.DepositAmount },
        ],
      });

      // Notify customer
      await connection.query(
        `INSERT INTO Notification (AccountNumber, Title, Message, Type) VALUES (?, 'Deposit Approved', ?, 'success')`,
        [deposit.AccountNumber, `Your deposit of ₹${deposit.DepositAmount} has been approved and credited.`]
      );
    } else {
      await connection.query(
        "UPDATE DepositHistory SET CurrentApprovals = ?, ApprovedBy1 = ?, Status = 'PENDING_APPROVAL' WHERE DepositID = ?",
        [newApprovals, adminId, id]
      );
    }

    logAudit({
      actorType: 'admin', actorId: adminId.toString(), action: 'APPROVE_DEPOSIT',
      category: 'Financial', entityType: 'Deposit', entityId: id,
      ipAddress: getClientIP(req),
      description: `Admin approved deposit #${id}. Fully approved: ${isFullyApproved}`,
    });

    await connection.commit();
    res.status(200).json({ message: isFullyApproved ? "Deposit fully approved and credited." : "Approval recorded. More approvals needed." });
  } catch (error) {
    console.error("Approve deposit error:", error);
    if (connection) await connection.rollback();
    res.status(500).json({ error: "Failed to approve deposit" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/reject-deposit/:id - Reject a pending deposit
// ============================================================
route.post("/reject-deposit/:id", verifyToken, requirePermission('deposit_money'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await db.getConnection();
    const [deposits] = await connection.query("SELECT * FROM DepositHistory WHERE DepositID = ?", [id]);
    
    if (deposits.length === 0) return res.status(404).json({ error: "Deposit not found" });
    if (deposits[0].Status !== 'PENDING_APPROVAL' && deposits[0].Status !== 'PENDING_OTP') {
      return res.status(400).json({ error: "Deposit is not pending approval" });
    }

    await connection.query("UPDATE DepositHistory SET Status = 'REJECTED' WHERE DepositID = ?", [id]);
    
    logAudit({
      actorType: 'admin', actorId: req.user.adminId.toString(), action: 'REJECT_DEPOSIT',
      category: 'Financial', entityType: 'Deposit', entityId: id,
      ipAddress: getClientIP(req),
      description: `Admin rejected deposit #${id}`,
    });

    res.status(200).json({ message: "Deposit rejected successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to reject deposit" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /admin/reverse-deposit/:id - Reverse a completed/pending deposit
// ============================================================
route.post("/reverse-deposit/:id", verifyToken, requirePermission('deposit_money'), upload.none(), async (req, res) => {
  let connection;
  try {
    const { id } = req.params;
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [deposits] = await connection.query("SELECT * FROM DepositHistory WHERE DepositID = ?", [id]);
    
    if (deposits.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Deposit not found" });
    }
    
    const deposit = deposits[0];
    
    if (deposit.Status !== 'PENDING' && deposit.Status !== 'COMPLETED') {
      await connection.rollback();
      return res.status(400).json({ error: "Only PENDING or COMPLETED deposits can be reversed." });
    }

    // Check 30-minute window
    const depositTime = new Date(deposit.DepositTime).getTime();
    const now = Date.now();
    const diffMinutes = (now - depositTime) / (1000 * 60);

    if (diffMinutes > 30) {
      await connection.rollback();
      return res.status(403).json({ error: "The 30-minute reversal window has expired." });
    }

    // Deduct funds back
    const [customer] = await connection.query("SELECT Balance FROM Customer WHERE AccountNumber = ?", [deposit.AccountNumber]);
    const currentBalance = parseFloat(customer[0].Balance);
    const newBalance = parseFloat((currentBalance - parseFloat(deposit.DepositAmount)).toFixed(2));

    await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [newBalance, deposit.AccountNumber]);
    await connection.query("UPDATE DepositHistory SET Status = 'REVERSED', AfterBalance = ? WHERE DepositID = ?", [newBalance, id]);

    // Reverse ledger entries
    await recordJournalEntry(connection, {
      transactionType: "Reversal",
      description: `Reversal of Deposit #${id}`,
      referenceId: `REV${id}`,
      entries: [
        { accountName: "Liability: Customer Deposits", subAccountNumber: deposit.AccountNumber, entryType: "Debit", amount: deposit.DepositAmount },
        { accountName: "Asset: Bank Cash", subAccountNumber: null, entryType: "Credit", amount: deposit.DepositAmount },
      ],
    });

    logAudit({
      actorType: 'admin', actorId: req.user.adminId.toString(), action: 'REVERSE_DEPOSIT',
      category: 'Financial', entityType: 'Deposit', entityId: id,
      ipAddress: getClientIP(req),
      description: `Admin reversed deposit #${id} within the 30 min window.`,
    });

    await connection.commit();
    res.status(200).json({ message: "Deposit reversed successfully" });
  } catch (error) {
    console.error("Reverse deposit error:", error);
    if (connection) await connection.rollback();
    res.status(500).json({ error: "Failed to reverse deposit" });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = route;
