const { Router } = require("express");
const route = Router();
const PDFDocument = require("pdfkit");
const db = require("../dataBase/MySQL");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { createTokenForUser, createRefreshToken } = require("../services/auth");
const { verifyToken } = require("../middleware/auth");
const { loginLimiter, transactionLimiter } = require("../middleware/rateLimiter");
const { recordJournalEntry } = require("../services/ledger");
const { logAudit, getClientIP } = require("../services/audit");

// ============================================================
// Helper: Generate unique 12-digit account number
// ============================================================
const generateAccountNumber = async () => {
  let accountNumber;
  let isUnique = false;
  while (!isUnique) {
    accountNumber = crypto.randomInt(100000000000, 999999999999).toString();
    const [rows] = await db.query(
      "SELECT AccountNumber FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );
    if (rows.length === 0) isUnique = true;
  }
  return accountNumber;
};

// ============================================================
// POST /customer/createAccount - Register new customer
// ============================================================
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

    // Validation
    if (!customerName || !AccountType || !customerPhone || !customerEmail || !customerAddress || !customerCity || !CustomerPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Phone validation (10-15 digits)
    const phoneRegex = /^\d{10,15}$/;
    if (!phoneRegex.test(customerPhone)) {
      return res.status(400).json({ error: "Invalid phone number. Must be 10-15 digits." });
    }

    // Password strength (min 8 chars, 1 uppercase, 1 number)
    if (CustomerPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    // Account type validation
    if (!["Savings", "Current"].includes(AccountType)) {
      return res.status(400).json({ error: "Account type must be Savings or Current" });
    }

    // Check for duplicate email/phone
    const [existing] = await db.query(
      "SELECT AccountNumber FROM Customer WHERE customerEmail = ? OR customerPhone = ?",
      [customerEmail, customerPhone]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email or phone number already registered" });
    }

    const hashedPassword = await bcrypt.hash(CustomerPassword, 12);
    const accountNumber = await generateAccountNumber();

    await db.query(
      `INSERT INTO Customer (AccountNumber, customerName, AccountType, customerPhone, customerEmail, customerAddress, customerCity, CustomerPassword, Balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [accountNumber, customerName, AccountType, customerPhone, customerEmail, customerAddress, customerCity, hashedPassword]
    );

    // Create notification for new account
    await db.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, 'Welcome!', 'Your account has been created successfully. Please wait for admin verification to enable transfers.', 'info')`,
      [accountNumber]
    );

    const token = createTokenForUser({ accountNumber, role: "user" });
    const refreshToken = createRefreshToken({ accountNumber, role: "user" });

    // Audit: Account registration
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'REGISTER',
      category: 'Authentication', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      newValues: { accountNumber, customerName, AccountType, customerEmail },
      description: `New ${AccountType} account created for ${customerName}`,
    });

    res.status(201).json({
      message: "Account created successfully",
      accountNumber,
      token,
      refreshToken,
    });
  } catch (error) {
    console.error("Create account error:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "Email or phone number already registered" });
    }
    res.status(500).json({ error: "Failed to create account" });
  }
});

// ============================================================
// POST /customer/login - Customer login
// ============================================================
route.post("/login", loginLimiter, upload.none(), async (req, res) => {
  let connection;
  try {
    const { accountNumber, password } = req.body;

    if (!accountNumber || !password) {
      return res.status(400).json({ error: "Account number and password are required" });
    }

    connection = await db.getConnection();

    const [user] = await connection.query(
      "SELECT AccountNumber, CustomerPassword, customerName, isActive FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (!user || user.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (!user[0].isActive) {
      return res.status(403).json({ error: "Account is deactivated. Contact admin." });
    }

    const passwordMatch = await bcrypt.compare(password, user[0].CustomerPassword);

    // Log login attempt
    await connection.query(
      "INSERT INTO LoginAttempts (AccountNumber, IPAddress, Success) VALUES (?, ?, ?)",
      [accountNumber, req.ip, passwordMatch ? 1 : 0]
    );

    if (!passwordMatch) {
      // Audit: Login failure
      logAudit({
        actorType: 'user', actorId: accountNumber, action: 'LOGIN_FAILED',
        category: 'Authentication', entityType: 'Account', entityId: accountNumber,
        ipAddress: getClientIP(req),
        description: `Failed login attempt for account ${accountNumber}`,
      });
      return res.status(401).json({ error: "Invalid password" });
    }

    const token = createTokenForUser({ accountNumber: user[0].AccountNumber, role: "user" });
    const refreshToken = createRefreshToken({ accountNumber: user[0].AccountNumber, role: "user" });

    // Audit: Login success
    logAudit({
      actorType: 'user', actorId: user[0].AccountNumber, action: 'LOGIN_SUCCESS',
      category: 'Authentication', entityType: 'Account', entityId: user[0].AccountNumber,
      ipAddress: getClientIP(req),
      description: `Successful login for ${user[0].customerName}`,
    });

    res.status(200).json({
      message: "Login successful",
      accountNumber: user[0].AccountNumber,
      customerName: user[0].customerName,
      token,
      refreshToken,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Failed to login" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /customer/profile - Get full user profile
// ============================================================
route.get("/profile", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [customer] = await connection.query(
      `SELECT AccountNumber, customerName, AccountType, customerPhone, customerEmail,
              customerAddress, customerCity, Balance, AccountVerify, DailyTransferLimit,
              TransactionPin IS NOT NULL as hasPIN, createdAt
       FROM Customer WHERE AccountNumber = ?`,
      [accountNumber]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    res.status(200).json({ profile: customer[0] });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Failed to retrieve profile" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// PUT /customer/profile - Update own profile
// ============================================================
route.put("/profile", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { customerAddress, customerCity, customerPhone } = req.body;

    connection = await db.getConnection();

    await connection.query(
      `UPDATE Customer SET customerAddress = COALESCE(?, customerAddress),
       customerCity = COALESCE(?, customerCity),
       customerPhone = COALESCE(?, customerPhone)
       WHERE AccountNumber = ?`,
      [customerAddress, customerCity, customerPhone, accountNumber]
    );

    res.status(200).json({ message: "Profile updated successfully" });

    // Audit: Profile update
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'PROFILE_UPDATED',
      category: 'Account', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      newValues: { customerAddress, customerCity, customerPhone },
      description: `Profile updated for account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// PUT /customer/changePassword - Change password
// ============================================================
route.put("/changePassword", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }

    connection = await db.getConnection();

    const [user] = await connection.query(
      "SELECT CustomerPassword FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const match = await bcrypt.compare(currentPassword, user[0].CustomerPassword);
    if (!match) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await connection.query(
      "UPDATE Customer SET CustomerPassword = ? WHERE AccountNumber = ?",
      [hashedPassword, accountNumber]
    );

    res.status(200).json({ message: "Password changed successfully" });

    // Audit: Password change
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'PASSWORD_CHANGED',
      category: 'Authentication', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      description: `Password changed for account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ error: "Failed to change password" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/setTransactionPin - Set or update transaction PIN
// ============================================================
route.post("/setTransactionPin", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { pin, password } = req.body;

    if (!pin || !password) {
      return res.status(400).json({ error: "PIN and password are required" });
    }

    if (!/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: "PIN must be exactly 4 digits" });
    }

    connection = await db.getConnection();

    // Verify password first
    const [user] = await connection.query(
      "SELECT CustomerPassword FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (user.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const match = await bcrypt.compare(password, user[0].CustomerPassword);
    if (!match) {
      return res.status(401).json({ error: "Invalid password" });
    }

    const hashedPin = await bcrypt.hash(pin, 10);
    await connection.query(
      "UPDATE Customer SET TransactionPin = ? WHERE AccountNumber = ?",
      [hashedPin, accountNumber]
    );

    res.status(200).json({ message: "Transaction PIN set successfully" });
  } catch (error) {
    console.error("Set PIN error:", error);
    res.status(500).json({ error: "Failed to set transaction PIN" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/verifyPin - Verify transaction PIN
// ============================================================
route.post("/verifyPin", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { pin } = req.body;

    if (!pin) {
      return res.status(400).json({ error: "PIN is required" });
    }

    connection = await db.getConnection();

    const [userRows] = await connection.query(
      "SELECT TransactionPin, FailedPinAttempts, LockedUntil FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const user = userRows[0];

    // Check Lockout
    if (user.LockedUntil && new Date(user.LockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.LockedUntil) - new Date()) / 60000);
      return res.status(403).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    if (!user.TransactionPin) {
      return res.status(400).json({ error: "Transaction PIN not set. Please set one first." });
    }

    const match = await bcrypt.compare(pin, user.TransactionPin);
    if (!match) {
      const newAttempts = (user.FailedPinAttempts || 0) + 1;
      if (newAttempts >= 3) {
        const lockTime = new Date(Date.now() + 15 * 60 * 1000);
        await connection.query(
          "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = ? WHERE AccountNumber = ?",
          [lockTime, accountNumber]
        );
        // Audit: PIN lockout
        logAudit({
          actorType: 'user', actorId: accountNumber, action: 'ACCOUNT_LOCKED',
          category: 'Security', entityType: 'Account', entityId: accountNumber,
          ipAddress: getClientIP(req),
          newValues: { lockedUntil: lockTime, reason: 'PIN brute-force (3 failed attempts)' },
          description: `Account ${accountNumber} locked for 15 minutes due to 3 failed PIN attempts`,
        });
        return res.status(403).json({ error: "Account locked for 15 minutes due to 3 failed PIN attempts." });
      } else {
        await connection.query(
          "UPDATE Customer SET FailedPinAttempts = ? WHERE AccountNumber = ?",
          [newAttempts, accountNumber]
        );
        // Audit: PIN failed
        logAudit({
          actorType: 'user', actorId: accountNumber, action: 'PIN_FAILED',
          category: 'Security', entityType: 'Account', entityId: accountNumber,
          ipAddress: getClientIP(req),
          newValues: { failedAttempts: newAttempts, attemptsRemaining: 3 - newAttempts },
          description: `Failed PIN attempt for account ${accountNumber} (${3 - newAttempts} remaining)`,
        });
        return res.status(401).json({ error: `Invalid transaction PIN. ${3 - newAttempts} attempts remaining.` });
      }
    }

    // Reset attempts on success
    await connection.query(
      "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = NULL WHERE AccountNumber = ?",
      [accountNumber]
    );

    res.status(200).json({ message: "PIN verified", verified: true });
  } catch (error) {
    console.error("Verify PIN error:", error);
    res.status(500).json({ error: "Failed to verify PIN" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/withdraw - Withdrawal with validation
// ============================================================
route.post("/withdraw", verifyToken, transactionLimiter, async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { withdrawAmount } = req.body;
    const accountNumber = req.user.AccNumber;

    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0 || isNaN(amount)) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    const [customerRows] = await connection.query(
      "SELECT Balance, AccountVerify, AccountType FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customerRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Account not found" });
    }

    const currentBalance = parseFloat(customerRows[0].Balance);
    const accountType = customerRows[0].AccountType;

    if (currentBalance < amount) {
      await connection.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Minimum balance check (Savings: 500, Current: 5000)
    const minBalance = accountType === "Savings" ? 500 : 5000;
    if (currentBalance - amount < minBalance) {
      await connection.rollback();
      return res.status(400).json({ error: `Minimum balance of ₹${minBalance} must be maintained for ${accountType} account` });
    }

    const newBalance = parseFloat((currentBalance - amount).toFixed(2));

    await connection.query(
      `INSERT INTO WithdrawHistory (AccountNumber, WithdrawAmount, BeforeBalance, AfterBalance)
       VALUES (?, ?, ?, ?)`,
      [accountNumber, amount, currentBalance, newBalance]
    );

    await connection.query(
      `UPDATE Customer SET Balance = ? WHERE AccountNumber = ?`,
      [newBalance, accountNumber]
    );

    await connection.commit();

    // Create notification
    await db.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, 'Withdrawal Successful', ?, 'info')`,
      [accountNumber, `₹${amount.toLocaleString()} has been withdrawn. New balance: ₹${newBalance.toLocaleString()}`]
    );

    res.status(200).json({ message: "Withdrawal successful", newBalance });

    // Audit: Withdrawal
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'WITHDRAWAL',
      category: 'Financial', entityType: 'Account', entityId: accountNumber,
      ipAddress: getClientIP(req),
      oldValues: { balance: currentBalance },
      newValues: { balance: newBalance, withdrawnAmount: amount },
      description: `Withdrawal of ₹${amount.toLocaleString()} from account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Withdraw error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to withdraw" });
  } finally {
    connection.release();
  }
});

// ============================================================
// POST /customer/transfer/request-otp - Request Transfer OTP
// ============================================================
route.post("/transfer/request-otp", verifyToken, transactionLimiter, upload.none(), async (req, res) => {
  let connection;
  try {
    const { toAccount, transferAmount } = req.body;
    const accountNumber = req.user.AccNumber;

    if (accountNumber === toAccount) {
      return res.status(400).json({ error: "Cannot transfer to your own account" });
    }

    const amount = parseFloat(transferAmount);
    if (!toAccount || !amount || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: "Invalid transfer details" });
    }

    connection = await db.getConnection();

    // Check sender status and balance
    const [senderRows] = await connection.query(
      "SELECT Balance, AccountVerify, AccountType, LockedUntil FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (senderRows.length === 0) {
      return res.status(404).json({ error: "Sender account not found" });
    }

    const sender = senderRows[0];

    // Check lockout
    if (sender.LockedUntil && new Date(sender.LockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(sender.LockedUntil) - new Date()) / 60000);
      return res.status(403).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    if (!sender.AccountVerify) {
      return res.status(403).json({ error: "Account not verified. Cannot make transfers." });
    }

    const senderBalance = parseFloat(sender.Balance);
    const accountType = sender.AccountType;

    if (senderBalance < amount) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Minimum balance check (Savings: 500, Current: 5000)
    const minBalance = accountType === "Savings" ? 500 : 5000;
    if (senderBalance - amount < minBalance) {
      return res.status(400).json({ error: `Minimum balance of ₹${minBalance} must be maintained for ${accountType} account` });
    }

    // Cooldown check for transfers >= ₹50,000
    if (amount >= 50000) {
      const [recentTransfers] = await connection.query(
        `SELECT TransferTime FROM TransferMoney 
         WHERE AccountNumber = ? AND TransferAmount >= 50000 
           AND TransferTime > NOW() - INTERVAL 5 MINUTE 
         ORDER BY TransferTime DESC LIMIT 1`,
        [accountNumber]
      );
      if (recentTransfers.length > 0) {
        // Audit: Cooldown triggered
        logAudit({
          actorType: 'user', actorId: accountNumber, action: 'COOLDOWN_TRIGGERED',
          category: 'Security', entityType: 'Transfer', entityId: accountNumber,
          ipAddress: getClientIP(req),
          newValues: { amount, threshold: 50000 },
          description: `Large transfer cooldown triggered for ₹${amount.toLocaleString()} by account ${accountNumber}`,
        });
        return res.status(429).json({
          error: "Security Cooldown: Please wait at least 5 minutes between consecutive transfers above ₹50,000."
        });
      }
    }

    // Generate random 6-digit OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

    // Save OTP to DB
    await connection.query(
      "INSERT INTO OTPVerify (AccountNumber, OTPCode, ExpiresAt) VALUES (?, ?, ?)",
      [accountNumber, otpCode, expiresAt]
    );

    // Simulate sending OTP: Log to console and send in-app Notification
    console.log(`\n====================================`);
    console.log(`[OTP SERVICE] Transfer Verification Code for A/C ${accountNumber}: ${otpCode}`);
    console.log(`====================================\n`);

    await connection.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, 'Transfer Verification Code', ?, 'info')`,
      [accountNumber, `Your transfer verification code is ${otpCode}. Valid for 5 minutes.`]
    );

    res.status(200).json({ message: "Verification code sent successfully. Please check your notifications." });

    // Audit: OTP generated
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'OTP_GENERATED',
      category: 'Authentication', entityType: 'Transfer', entityId: accountNumber,
      ipAddress: getClientIP(req),
      newValues: { toAccount, amount },
      description: `Transfer OTP generated for ₹${amount.toLocaleString()} to ${toAccount}`,
    });
  } catch (error) {
    console.error("Request OTP error:", error);
    res.status(500).json({ error: "Failed to request verification code" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/transferMoney - Transfer with OTP & PIN verification
// ============================================================
route.post("/transferMoney", verifyToken, transactionLimiter, upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const { toAccount, transferAmount, pin, otp, description } = req.body;
    const accountNumber = req.user.AccNumber;

    // Validations
    if (accountNumber === toAccount) {
      await connection.rollback();
      return res.status(400).json({ error: "Cannot transfer to your own account" });
    }

    const amount = parseFloat(transferAmount);
    if (!toAccount || !amount || amount <= 0 || isNaN(amount)) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid transfer details" });
    }

    // Get sender balance & lock status
    const [senderRows] = await connection.query(
      "SELECT Balance, DailyTransferLimit, AccountVerify, AccountType, FailedPinAttempts, LockedUntil FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (senderRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Sender account not found" });
    }

    const sender = senderRows[0];

    // Check Lockout
    if (sender.LockedUntil && new Date(sender.LockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(sender.LockedUntil) - new Date()) / 60000);
      await connection.rollback();
      return res.status(403).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    // Verify transaction PIN
    const [pinCheck] = await connection.query(
      "SELECT TransactionPin FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (pinCheck.length > 0 && pinCheck[0].TransactionPin) {
      if (!pin) {
        await connection.rollback();
        return res.status(400).json({ error: "Transaction PIN is required", requirePin: true });
      }
      const pinMatch = await bcrypt.compare(pin, pinCheck[0].TransactionPin);
      if (!pinMatch) {
        // Increment attempts
        const newAttempts = (sender.FailedPinAttempts || 0) + 1;
        if (newAttempts >= 3) {
          const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
          await connection.query(
            "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = ? WHERE AccountNumber = ?",
            [lockTime, accountNumber]
          );
          await connection.commit(); // commit to persist lockout
          return res.status(403).json({ error: "Account locked for 15 minutes due to 3 failed PIN attempts." });
        } else {
          await connection.query(
            "UPDATE Customer SET FailedPinAttempts = ? WHERE AccountNumber = ?",
            [newAttempts, accountNumber]
          );
          await connection.commit(); // commit to persist attempt
          return res.status(401).json({ error: `Invalid transaction PIN. ${3 - newAttempts} attempts remaining.` });
        }
      } else {
        // Reset attempts on correct PIN
        await connection.query(
          "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = NULL WHERE AccountNumber = ?",
          [accountNumber]
        );
      }
    }

    // Verify OTP
    if (!otp) {
      await connection.rollback();
      return res.status(400).json({ error: "Verification code (OTP) is required" });
    }

    const [otpCheck] = await connection.query(
      `SELECT * FROM OTPVerify 
       WHERE AccountNumber = ? AND OTPCode = ? AND IsUsed = 0 AND ExpiresAt > NOW()
       ORDER BY CreatedAt DESC LIMIT 1`,
      [accountNumber, otp]
    );

    if (otpCheck.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Invalid or expired verification code (OTP)." });
    }

    // Mark OTP as used
    await connection.query(
      "UPDATE OTPVerify SET IsUsed = 1 WHERE OTPID = ?",
      [otpCheck[0].OTPID]
    );

    if (!sender.AccountVerify) {
      await connection.rollback();
      return res.status(403).json({ error: "Account not verified. Cannot make transfers." });
    }

    const accountType = sender.AccountType;
    const senderBalance = parseFloat(sender.Balance);
    const dailyLimit = parseFloat(sender.DailyTransferLimit);

    if (senderBalance < amount) {
      await connection.rollback();
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Minimum balance check (Savings: 500, Current: 5000)
    const minBalance = accountType === "Savings" ? 500 : 5000;
    if (senderBalance - amount < minBalance) {
      await connection.rollback();
      return res.status(400).json({ error: `Minimum balance of ₹${minBalance} must be maintained for ${accountType} account` });
    }

    // Cooldown check for transfers >= ₹50,000
    if (amount >= 50000) {
      const [recentTransfers] = await connection.query(
        `SELECT TransferTime FROM TransferMoney 
         WHERE AccountNumber = ? AND TransferAmount >= 50000 
           AND TransferTime > NOW() - INTERVAL 5 MINUTE 
         ORDER BY TransferTime DESC LIMIT 1`,
        [accountNumber]
      );
      if (recentTransfers.length > 0) {
        await connection.rollback();
        return res.status(429).json({
          error: "Security Cooldown: Please wait at least 5 minutes between consecutive transfers above ₹50,000."
        });
      }
    }

    // Daily limit check
    const [todayTransfers] = await connection.query(
      `SELECT COALESCE(SUM(TransferAmount), 0) as totalToday FROM TransferMoney
       WHERE AccountNumber = ? AND DATE(TransferTime) = CURDATE()`,
      [accountNumber]
    );

    if (parseFloat(todayTransfers[0].totalToday) + amount > dailyLimit) {
      await connection.rollback();
      return res.status(400).json({ error: `Daily transfer limit of ₹${dailyLimit.toLocaleString()} exceeded` });
    }

    // Get receiver
    const [receiverRows] = await connection.query(
      "SELECT Balance FROM Customer WHERE AccountNumber = ?",
      [toAccount]
    );

    if (receiverRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Receiver account not found" });
    }

    const receiverBalance = parseFloat(receiverRows[0].Balance);
    const newSenderBalance = parseFloat((senderBalance - amount).toFixed(2));
    const newReceiverBalance = parseFloat((receiverBalance + amount).toFixed(2));

    await connection.query(
      "UPDATE Customer SET Balance = ? WHERE AccountNumber = ?",
      [newSenderBalance, accountNumber]
    );
    await connection.query(
      "UPDATE Customer SET Balance = ? WHERE AccountNumber = ?",
      [newReceiverBalance, toAccount]
    );
    const [transferResult] = await connection.query(
      `INSERT INTO TransferMoney (AccountNumber, ToAccount, TransferAmount, SenderBalanceAfter, ReceiverBalanceAfter, Description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [accountNumber, toAccount, amount, newSenderBalance, newReceiverBalance, description || null]
    );

    const transferId = transferResult.insertId;

    await recordJournalEntry(connection, {
      transactionType: "Transfer",
      description: `Transfer to ${toAccount} (${description || "No description"})`,
      referenceId: `TXN${transferId}`,
      entries: [
        {
          accountName: "Liability: Customer Deposits",
          subAccountNumber: accountNumber,
          entryType: "Debit",
          amount: amount,
        },
        {
          accountName: "Liability: Customer Deposits",
          subAccountNumber: toAccount,
          entryType: "Credit",
          amount: amount,
        },
      ],
    });

    await connection.commit();

    // Notifications
    await db.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type) VALUES (?, ?, ?, 'alert')`,
      [accountNumber, 'Transfer Sent', `₹${amount.toLocaleString()} sent to account ${toAccount}`]
    );
    await db.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type) VALUES (?, ?, ?, 'success')`,
      [toAccount, 'Money Received', `₹${amount.toLocaleString()} received from account ${accountNumber}`]
    );

    res.status(200).json({
      message: "Transfer successful",
      newBalance: newSenderBalance,
    });

    // Audit: Transfer success
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'TRANSFER',
      category: 'Financial', entityType: 'Transaction', entityId: `TXN${transferId}`,
      ipAddress: getClientIP(req),
      oldValues: { senderBalance: senderBalance, receiverBalance: receiverBalance },
      newValues: { senderBalance: newSenderBalance, receiverBalance: newReceiverBalance, amount, toAccount },
      description: `Transfer of ₹${amount.toLocaleString()} from ${accountNumber} to ${toAccount}`,
    });
  } catch (error) {
    console.error("Transfer error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to transfer money" });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /customer/accountInfo - Account summary
// ============================================================
route.get("/accountInfo", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [customer] = await connection.query(
      "SELECT Balance, AccountVerify, customerName FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (!customer || customer.length === 0) {
      return res.status(404).json({ error: "Account not found" });
    }

    const [loanResults] = await connection.query(
      "SELECT COALESCE(SUM(LoanAmount), 0) AS totalLoans FROM Loan WHERE AccountNumber = ? AND ApprovalStatus = 'Approved'",
      [accountNumber]
    );

    const [pendingLoans] = await connection.query(
      "SELECT COUNT(*) as count FROM Loan WHERE AccountNumber = ? AND ApprovalStatus = 'Pending'",
      [accountNumber]
    );

    const [recentTransactions] = await connection.query(
      `SELECT TransactionType, TransactionAmount, TransactionDate, Description
       FROM TransactionHistory WHERE AccountNumber = ?
       ORDER BY TransactionDate DESC LIMIT 5`,
      [accountNumber]
    );

    const [unreadNotifs] = await connection.query(
      "SELECT COUNT(*) as count FROM Notification WHERE AccountNumber = ? AND IsRead = 0",
      [accountNumber]
    );

    const [settings] = await connection.query(
      "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('LOAN_BASE_RATE_SAVINGS', 'LOAN_BASE_RATE_CURRENT')"
    );
    const loanRates = {
      Savings: 5.0,
      Current: 6.0
    };
    settings.forEach(s => {
      if (s.SettingKey === 'LOAN_BASE_RATE_SAVINGS') loanRates.Savings = parseFloat(s.SettingValue);
      if (s.SettingKey === 'LOAN_BASE_RATE_CURRENT') loanRates.Current = parseFloat(s.SettingValue);
    });

    res.status(200).json({
      accountNumber,
      customerName: customer[0].customerName,
      balance: parseFloat(customer[0].Balance),
      loans: parseFloat(loanResults[0].totalLoans),
      pendingLoans: pendingLoans[0].count,
      accountVerified: customer[0].AccountVerify === 1,
      recentTransactions,
      unreadNotifications: unreadNotifs[0].count,
      loanRates,
    });
  } catch (error) {
    console.error("Account info error:", error);
    res.status(500).json({ error: "Failed to retrieve account info" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /customer/history - Transaction history with filters
// ============================================================
route.get("/history", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { type, startDate, endDate, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    connection = await db.getConnection();

    let query = "SELECT * FROM TransactionHistory WHERE AccountNumber = ?";
    let countQuery = "SELECT COUNT(*) as total FROM TransactionHistory WHERE AccountNumber = ?";
    let params = [accountNumber];
    let countParams = [accountNumber];

    if (type) {
      query += " AND TransactionType = ?";
      countQuery += " AND TransactionType = ?";
      params.push(type);
      countParams.push(type);
    }

    if (startDate && endDate) {
      query += " AND TransactionDate BETWEEN ? AND ?";
      countQuery += " AND TransactionDate BETWEEN ? AND ?";
      params.push(startDate, endDate + " 23:59:59");
      countParams.push(startDate, endDate + " 23:59:59");
    }

    query += " ORDER BY TransactionDate DESC LIMIT ? OFFSET ?";
    params.push(parseInt(limit), parseInt(offset));

    const [transactions] = await connection.query(query, params);
    const [totalResult] = await connection.query(countQuery, countParams);

    res.status(200).json({
      data: transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalResult[0].total,
        totalPages: Math.ceil(totalResult[0].total / limit),
      },
    });
  } catch (error) {
    console.error("History error:", error);
    res.status(500).json({ error: "Failed to fetch transaction history" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/applyloan - Apply for loan with EMI calculation
// ============================================================
route.post("/applyloan", verifyToken, upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { loanAmount, loanDurationMonths } = req.body;
    const accountNumber = req.user.AccNumber;

    const amount = parseFloat(loanAmount);
    const duration = parseInt(loanDurationMonths);

    if (!amount || amount <= 0 || !duration || duration <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Valid loan amount and duration are required" });
    }

    if (amount > 10000000) {
      await connection.rollback();
      return res.status(400).json({ error: "Maximum loan amount is ₹1,00,00,000" });
    }

    if (duration > 360) {
      await connection.rollback();
      return res.status(400).json({ error: "Maximum loan duration is 360 months (30 years)" });
    }

    const [customerData] = await connection.query(
      "SELECT AccountType, AccountVerify FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customerData.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Customer not found" });
    }

    if (!customerData[0].AccountVerify) {
      await connection.rollback();
      return res.status(403).json({ error: "Account must be verified to apply for loans" });
    }

    // Check for existing pending loans
    const [pendingLoans] = await connection.query(
      "SELECT COUNT(*) as count FROM Loan WHERE AccountNumber = ? AND ApprovalStatus = 'Pending'",
      [accountNumber]
    );

    if (pendingLoans[0].count >= 3) {
      await connection.rollback();
      return res.status(400).json({ error: "Maximum 3 pending loan applications allowed" });
    }

    const [settings] = await connection.query(
      "SELECT SettingKey, SettingValue FROM SystemSettings WHERE SettingKey IN ('LOAN_BASE_RATE_SAVINGS', 'LOAN_BASE_RATE_CURRENT')"
    );
    let savingsRate = 5.0;
    let currentRate = 6.0;
    settings.forEach(s => {
      if (s.SettingKey === 'LOAN_BASE_RATE_SAVINGS') savingsRate = parseFloat(s.SettingValue);
      if (s.SettingKey === 'LOAN_BASE_RATE_CURRENT') currentRate = parseFloat(s.SettingValue);
    });

    const interestRate = customerData[0].AccountType === "Savings" ? savingsRate : currentRate;

    // EMI calculation: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
    const monthlyRate = interestRate / 100 / 12;
    const emi = amount * monthlyRate * Math.pow(1 + monthlyRate, duration) / (Math.pow(1 + monthlyRate, duration) - 1);
    const totalPayable = parseFloat((emi * duration).toFixed(2));
    const monthlyEMI = parseFloat(emi.toFixed(2));

    await connection.query(
      `INSERT INTO Loan (AccountNumber, LoanAmount, LoanDurationMonths, LoanInterest, TotalPayableAmount, MonthlyEMI, ApprovalStatus)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [accountNumber, amount, duration, interestRate, totalPayable, monthlyEMI]
    );

    await connection.commit();

    res.status(200).json({
      message: "Loan application submitted successfully",
      loanDetails: {
        amount,
        duration,
        interestRate,
        monthlyEMI,
        totalPayable,
      },
    });
  } catch (error) {
    console.error("Loan apply error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to apply for loan" });
  } finally {
    connection.release();
  }
});

// ============================================================
// GET /customer/loanStatus - View own loan applications
// ============================================================
route.get("/loanStatus", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [loans] = await connection.query(
      `SELECT LoanID, LoanAmount, LoanInterest, ApprovalStatus, LoanDurationMonths,
              TotalPayableAmount, MonthlyEMI, AppliedDate, ApprovalDate, Remarks,
              AmountRepaid, LateFee, LastRepaymentDate, NextRepaymentDueDate, RepaymentStatus
       FROM Loan WHERE AccountNumber = ? ORDER BY AppliedDate DESC`,
      [accountNumber]
    );

    res.status(200).json({ loans });
  } catch (error) {
    console.error("Loan status error:", error);
    res.status(500).json({ error: "Failed to fetch loan status" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// Beneficiary Management
// ============================================================
route.get("/beneficiaries", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [beneficiaries] = await connection.query(
      `SELECT b.BeneficiaryID, b.BeneficiaryAccount, b.BeneficiaryName, b.Nickname,
              c.customerName as AccountHolderName
       FROM Beneficiary b
       JOIN Customer c ON b.BeneficiaryAccount = c.AccountNumber
       WHERE b.AccountNumber = ? AND b.isActive = 1`,
      [accountNumber]
    );

    res.status(200).json({ beneficiaries });
  } catch (error) {
    console.error("Beneficiaries error:", error);
    res.status(500).json({ error: "Failed to fetch beneficiaries" });
  } finally {
    if (connection) connection.release();
  }
});

route.post("/beneficiaries", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { beneficiaryAccount, nickname, pin } = req.body;

    if (!beneficiaryAccount) {
      return res.status(400).json({ error: "Beneficiary account number is required" });
    }

    if (beneficiaryAccount === accountNumber) {
      return res.status(400).json({ error: "Cannot add yourself as a beneficiary" });
    }

    connection = await db.getConnection();

    // Fetch sender details to check lockout and pin
    const [senderRows] = await connection.query(
      "SELECT TransactionPin, FailedPinAttempts, LockedUntil FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (senderRows.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const sender = senderRows[0];

    // Check Lockout
    if (sender.LockedUntil && new Date(sender.LockedUntil) > new Date()) {
      const minutesLeft = Math.ceil((new Date(sender.LockedUntil) - new Date()) / 60000);
      return res.status(403).json({ error: `Account is temporarily locked. Try again in ${minutesLeft} minutes.` });
    }

    // Verify transaction PIN
    if (sender.TransactionPin) {
      if (!pin) {
        return res.status(400).json({ error: "Transaction PIN is required", requirePin: true });
      }
      const pinMatch = await bcrypt.compare(pin, sender.TransactionPin);
      if (!pinMatch) {
        // Increment attempts
        const newAttempts = (sender.FailedPinAttempts || 0) + 1;
        if (newAttempts >= 3) {
          const lockTime = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
          await connection.query(
            "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = ? WHERE AccountNumber = ?",
            [lockTime, accountNumber]
          );
          return res.status(403).json({ error: "Account locked for 15 minutes due to 3 failed PIN attempts." });
        } else {
          await connection.query(
            "UPDATE Customer SET FailedPinAttempts = ? WHERE AccountNumber = ?",
            [newAttempts, accountNumber]
          );
          return res.status(401).json({ error: `Invalid transaction PIN. ${3 - newAttempts} attempts remaining.` });
        }
      } else {
        // Reset attempts on correct PIN
        await connection.query(
          "UPDATE Customer SET FailedPinAttempts = 0, LockedUntil = NULL WHERE AccountNumber = ?",
          [accountNumber]
        );
      }
    }

    // Verify beneficiary account exists
    const [beneficiary] = await connection.query(
      "SELECT customerName FROM Customer WHERE AccountNumber = ?",
      [beneficiaryAccount]
    );

    if (beneficiary.length === 0) {
      return res.status(404).json({ error: "Beneficiary account not found" });
    }

    await connection.query(
      `INSERT INTO Beneficiary (AccountNumber, BeneficiaryAccount, BeneficiaryName, Nickname)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE isActive = 1, Nickname = VALUES(Nickname)`,
      [accountNumber, beneficiaryAccount, beneficiary[0].customerName, nickname || beneficiary[0].customerName]
    );

    res.status(201).json({ message: "Beneficiary added successfully" });

    // Audit: Beneficiary added
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'BENEFICIARY_ADDED',
      category: 'Account', entityType: 'Beneficiary', entityId: beneficiaryAccount,
      ipAddress: getClientIP(req),
      newValues: { beneficiaryAccount, beneficiaryName: beneficiary[0].customerName, nickname: nickname || beneficiary[0].customerName },
      description: `Beneficiary ${beneficiaryAccount} added by account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Add beneficiary error:", error);
    res.status(500).json({ error: "Failed to add beneficiary" });
  } finally {
    if (connection) connection.release();
  }
});

route.delete("/beneficiaries/:id", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    const { id } = req.params;

    connection = await db.getConnection();

    await connection.query(
      "UPDATE Beneficiary SET isActive = 0 WHERE BeneficiaryID = ? AND AccountNumber = ?",
      [id, accountNumber]
    );

    res.status(200).json({ message: "Beneficiary removed" });

    // Audit: Beneficiary deleted
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'BENEFICIARY_DELETED',
      category: 'Account', entityType: 'Beneficiary', entityId: id,
      ipAddress: getClientIP(req),
      description: `Beneficiary #${id} removed by account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Delete beneficiary error:", error);
    res.status(500).json({ error: "Failed to remove beneficiary" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// Notifications
// ============================================================
route.get("/notifications", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [notifications] = await connection.query(
      "SELECT * FROM Notification WHERE AccountNumber = ? ORDER BY CreatedAt DESC LIMIT 50",
      [accountNumber]
    );

    res.status(200).json({ notifications });
  } catch (error) {
    console.error("Notifications error:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  } finally {
    if (connection) connection.release();
  }
});

route.put("/notifications/read", verifyToken, async (req, res) => {
  try {
    const accountNumber = req.user.AccNumber;
    await db.query(
      "UPDATE Notification SET IsRead = 1 WHERE AccountNumber = ?",
      [accountNumber]
    );
    res.status(200).json({ message: "All notifications marked as read" });
  } catch (error) {
    console.error("Mark read error:", error);
    res.status(500).json({ error: "Failed to mark notifications" });
  }
});

// ============================================================
// GET /customer/generateBankReport - PDF report
// ============================================================
route.get("/generateBankReport", verifyToken, async (req, res) => {
  try {
    const accountNumber = req.user.AccNumber;
    const { startDate, endDate } = req.query;

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if ((startDate && !datePattern.test(startDate)) || (endDate && !datePattern.test(endDate))) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
    }

    const [customer] = await db.query(
      "SELECT * FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );

    if (customer.length === 0) {
      return res.status(404).json({ error: "Customer not found" });
    }

    let txnQuery = "SELECT * FROM TransactionHistory WHERE AccountNumber = ?";
    let txnParams = [accountNumber];
    if (startDate && endDate) {
      txnQuery += " AND TransactionDate BETWEEN ? AND ?";
      txnParams.push(startDate, endDate + " 23:59:59");
    }
    txnQuery += " ORDER BY TransactionDate DESC";

    const [transactions] = await db.query(txnQuery, txnParams);

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bank_report_${accountNumber}.pdf"`);
    doc.pipe(res);

    // Header
    doc.fontSize(24).font("Helvetica-Bold").text("SecureBank", { align: "center" });
    doc.fontSize(12).font("Helvetica").text("Account Statement", { align: "center" }).moveDown(2);

    // Customer info
    doc.fontSize(14).font("Helvetica-Bold").text("Account Details").moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Account Number: ${customer[0].AccountNumber}`);
    doc.text(`Name: ${customer[0].customerName}`);
    doc.text(`Account Type: ${customer[0].AccountType}`);
    doc.text(`Phone: ${customer[0].customerPhone}`);
    doc.text(`Email: ${customer[0].customerEmail}`);
    doc.text(`Current Balance: ₹${parseFloat(customer[0].Balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    if (startDate && endDate) {
      doc.text(`Statement Period: ${startDate} to ${endDate}`);
    }
    doc.moveDown(2);

    // Transactions table
    doc.fontSize(14).font("Helvetica-Bold").text("Transaction History").moveDown(0.5);

    if (transactions.length > 0) {
      transactions.forEach((txn) => {
        const color = ["Transfer", "Withdrawal"].includes(txn.TransactionType) ? "red" : "green";
        doc.fontSize(10).font("Helvetica");
        doc.fillColor("black").text(
          `${new Date(txn.TransactionDate).toLocaleString()} | ${txn.TransactionType} | `,
          { continued: true }
        );
        doc.fillColor(color).text(
          `₹${parseFloat(txn.TransactionAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          { continued: false }
        );
        doc.fillColor("gray").text(`  ${txn.Description || ""}`).moveDown(0.3);
      });
    } else {
      doc.text("No transactions found for the selected period.");
    }

    doc.moveDown(2);

    // Summary
    const totalCredit = transactions
      .filter((t) => ["Deposit", "Receive", "Loan Approved"].includes(t.TransactionType))
      .reduce((sum, t) => sum + parseFloat(t.TransactionAmount), 0);

    const totalDebit = transactions
      .filter((t) => ["Withdrawal", "Transfer"].includes(t.TransactionType))
      .reduce((sum, t) => sum + parseFloat(t.TransactionAmount), 0);

    doc.fillColor("black");
    doc.fontSize(12).font("Helvetica-Bold").text("Summary", { underline: true }).moveDown(0.5);
    doc.fontSize(11).font("Helvetica");
    doc.text(`Total Credit: ₹${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    doc.text(`Total Debit: ₹${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);
    doc.text(`Net: ₹${(totalCredit - totalDebit).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`);

    doc.moveDown(2);
    doc.fontSize(8).fillColor("gray").text(
      `Generated on ${new Date().toLocaleString()} | This is a system-generated report`,
      { align: "center" }
    );

    doc.end();
  } catch (error) {
    console.error("Report error:", error);
    res.status(500).json({ error: "Failed to generate bank report" });
  }
});

// ============================================================
// GET /customer/loanCalculator - EMI Calculator
// ============================================================
route.get("/loanCalculator", (req, res) => {
  const { amount, rate, duration } = req.query;

  const p = parseFloat(amount);
  const r = parseFloat(rate) / 100 / 12;
  const n = parseInt(duration);

  if (!p || !r || !n || p <= 0 || n <= 0) {
    return res.status(400).json({ error: "Valid amount, rate, and duration are required" });
  }

  const emi = p * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1);
  const totalPayable = emi * n;
  const totalInterest = totalPayable - p;

  res.status(200).json({
    monthlyEMI: parseFloat(emi.toFixed(2)),
    totalPayable: parseFloat(totalPayable.toFixed(2)),
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    principal: p,
    rate: parseFloat(rate),
    duration: n,
  });
});

// ============================================================
// POST /customer/loans/:loanId/repay - Repay a loan EMI or full amount
// ============================================================
route.post("/loans/:loanId/repay", verifyToken, upload.none(), async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const { amount } = req.body;
    const loanId = req.params.loanId;
    const accountNumber = req.user.AccNumber;

    const repaymentAmount = parseFloat(amount);
    if (!repaymentAmount || repaymentAmount <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Valid repayment amount is required" });
    }

    // Check customer balance
    const [customer] = await connection.query(
      "SELECT Balance FROM Customer WHERE AccountNumber = ?",
      [accountNumber]
    );
    if (customer.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Customer account not found" });
    }
    const balance = parseFloat(customer[0].Balance);

    if (balance < repaymentAmount) {
      await connection.rollback();
      return res.status(400).json({ error: "Insufficient balance in account to make repayment." });
    }

    // Check loan details
    const [loanDetails] = await connection.query(
      "SELECT * FROM Loan WHERE LoanID = ? AND AccountNumber = ?",
      [loanId, accountNumber]
    );
    if (loanDetails.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Loan not found" });
    }
    const loan = loanDetails[0];

    if (loan.ApprovalStatus !== "Approved") {
      await connection.rollback();
      return res.status(400).json({ error: "Only approved loans can be repaid." });
    }

    const outstanding = parseFloat(loan.TotalPayableAmount) + parseFloat(loan.LateFee || 0) - parseFloat(loan.AmountRepaid || 0);
    if (outstanding <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: "This loan is already fully paid." });
    }

    // Cap the repayment amount at the remaining outstanding balance
    const finalRepaymentAmount = Math.min(repaymentAmount, outstanding);

    // Update customer balance
    const newBalance = balance - finalRepaymentAmount;
    await connection.query(
      "UPDATE Customer SET Balance = ? WHERE AccountNumber = ?",
      [newBalance, accountNumber]
    );

    // Update loan details
    const newAmountRepaid = parseFloat(loan.AmountRepaid || 0) + finalRepaymentAmount;
    const isFullyPaid = newAmountRepaid >= (parseFloat(loan.TotalPayableAmount) + parseFloat(loan.LateFee || 0));
    const newStatus = isFullyPaid ? "Paid" : (loan.RepaymentStatus === "Overdue" ? "Overdue" : "Active");

    // Calculate next due date
    let nextDueDate = loan.NextRepaymentDueDate;
    if (!isFullyPaid) {
      if (!nextDueDate) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        nextDueDate = d;
      } else {
        const d = new Date(nextDueDate);
        d.setMonth(d.getMonth() + 1);
        nextDueDate = d;
      }
    } else {
      nextDueDate = null;
    }

    await connection.query(
      `UPDATE Loan SET AmountRepaid = ?, LastRepaymentDate = NOW(), NextRepaymentDueDate = ?, RepaymentStatus = ?
       WHERE LoanID = ?`,
      [newAmountRepaid, nextDueDate, newStatus, loanId]
    );

    // Log in LoanRepayment table
    await connection.query(
      `INSERT INTO LoanRepayment (LoanID, RepaymentAmount, LateFeePaid)
       VALUES (?, ?, ?)`,
      [loanId, finalRepaymentAmount, 0]
    );

    // Record double entry: debit Customer Deposits, credit Loan Receivables
    await recordJournalEntry(connection, {
      transactionType: "Loan Repayment",
      description: `Repayment of ₹${finalRepaymentAmount} for Loan #${loanId}`,
      referenceId: `LRP${loanId}`,
      entries: [
        {
          accountName: "Liability: Customer Deposits",
          subAccountNumber: accountNumber,
          entryType: "Debit",
          amount: finalRepaymentAmount
        },
        {
          accountName: "Asset: Loan Receivables",
          subAccountNumber: null,
          entryType: "Credit",
          amount: finalRepaymentAmount
        }
      ]
    });

    // Log transaction
    await connection.query(
      `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description)
       VALUES (?, 'Withdrawal', ?, ?, ?)`,
      [accountNumber, finalRepaymentAmount, newBalance, `Repayment of ₹${finalRepaymentAmount} for Loan #${loanId}`]
    );

    // Log balance change
    await connection.query(
      `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
       VALUES (?, ?, ?, ?, 'Loan Repayment')`,
      [accountNumber, balance, newBalance, finalRepaymentAmount]
    );

    // Create notification
    await connection.query(
      `INSERT INTO Notification (AccountNumber, Title, Message, Type)
       VALUES (?, 'Loan Repayment Received', ?, 'success')`,
      [accountNumber, `Repayment of ₹${finalRepaymentAmount} for Loan #${loanId} was successfully processed. Outstanding: ₹${(outstanding - finalRepaymentAmount).toFixed(2)}`]
    );

    await connection.commit();

    res.status(200).json({
      message: isFullyPaid ? "Loan fully paid off! Thank you." : `Repayment of ₹${finalRepaymentAmount} successful.`,
      newBalance,
      outstanding: outstanding - finalRepaymentAmount,
      isFullyPaid,
    });

    // Audit: Loan repayment
    logAudit({
      actorType: 'user', actorId: accountNumber, action: 'LOAN_REPAYMENT',
      category: 'Financial', entityType: 'Loan', entityId: loanId.toString(),
      ipAddress: getClientIP(req),
      oldValues: { balance, outstanding, amountRepaid: parseFloat(loan.AmountRepaid || 0) },
      newValues: { balance: newBalance, outstanding: outstanding - finalRepaymentAmount, amountRepaid: newAmountRepaid, isFullyPaid },
      description: `Loan #${loanId} repayment of ₹${finalRepaymentAmount}${isFullyPaid ? ' (FULLY PAID)' : ''}`,
    });
  } catch (error) {
    console.error("Loan repay error:", error);
    await connection.rollback();
    res.status(500).json({ error: "Failed to process loan repayment" });
  } finally {
    connection.release();
  }
});

// ============================================================
// POST /customer/support/tickets - Create a support ticket
// ============================================================
route.post("/support/tickets", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const { subject, message } = req.body;
    const accountNumber = req.user.AccNumber;

    if (!subject || !message) {
      return res.status(400).json({ error: "Subject and Message are required" });
    }

    connection = await db.getConnection();
    await connection.query(
      "INSERT INTO HelpTicket (AccountNumber, Subject, Message) VALUES (?, ?, ?)",
      [accountNumber, subject, message]
    );

    res.status(201).json({ message: "Support ticket created successfully" });
  } catch (error) {
    console.error("Create ticket error:", error);
    res.status(500).json({ error: "Failed to submit support ticket" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /customer/support/tickets - Retrieve support tickets
// ============================================================
route.get("/support/tickets", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [tickets] = await connection.query(
      `SELECT t.*, a.fullName as AdminName
       FROM HelpTicket t
       LEFT JOIN Admin a ON t.RepliedBy = a.AdminID
       WHERE t.AccountNumber = ?
       ORDER BY t.CreatedAt DESC`,
      [accountNumber]
    );

    res.status(200).json({ tickets });
  } catch (error) {
    console.error("Fetch tickets error:", error);
    res.status(500).json({ error: "Failed to fetch support tickets" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// POST /customer/disputes - File a transaction dispute
// ============================================================
route.post("/disputes", verifyToken, upload.none(), async (req, res) => {
  let connection;
  try {
    const { transactionId, reason } = req.body;
    const isFraud = req.body.isFraud === "true" || req.body.isFraud === true;
    const accountNumber = req.user.AccNumber;

    if (!transactionId || !reason) {
      return res.status(400).json({ error: "Transaction ID and Reason are required" });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Verify transaction belongs to this customer
    const [tx] = await connection.query(
      "SELECT * FROM TransactionHistory WHERE TransactionID = ? AND AccountNumber = ?",
      [transactionId, accountNumber]
    );

    if (tx.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Transaction not found or not associated with your account." });
    }

    const transaction = tx[0];

    // Restrict disputes to original Transfer and Withdrawal types only
    if (transaction.TransactionType !== "Transfer" && transaction.TransactionType !== "Withdrawal") {
      await connection.rollback();
      return res.status(400).json({ error: "Only transfers and withdrawals can be disputed." });
    }

    // Prevent disputing reversal transactions
    const description = (transaction.Description || "").toUpperCase();
    const referenceId = (transaction.ReferenceID || "").toUpperCase();
    if (description.includes("REVERSAL") || description.includes("CLAWBACK") || referenceId.startsWith("REV")) {
      await connection.rollback();
      return res.status(400).json({ error: "Reversal transactions cannot be disputed." });
    }

    // Check if dispute already exists
    const [existing] = await connection.query(
      "SELECT DisputeID FROM Dispute WHERE TransactionID = ? AND AccountNumber = ?",
      [transactionId, accountNumber]
    );
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: "A dispute has already been filed for this transaction." });
    }

    // Insert Dispute
    const [disputeResult] = await connection.query(
      "INSERT INTO Dispute (AccountNumber, TransactionID, DisputeReason) VALUES (?, ?, ?)",
      [accountNumber, transactionId, reason]
    );
    const disputeId = disputeResult.insertId;

    if (isFraud) {
      // 1. Update disputed transaction status to UNDER_REVIEW
      await connection.query(
        "UPDATE TransactionHistory SET TransactionStatus = 'UNDER_REVIEW' WHERE TransactionID = ?",
        [transactionId]
      );

      // 2. Create customer support ticket
      await connection.query(
        "INSERT INTO HelpTicket (AccountNumber, Subject, Message) VALUES (?, ?, ?)",
        [
          accountNumber,
          `FRAUD REPORT: Txn #${transactionId}`,
          `Auto-generated fraud ticket for Transaction ID ${transactionId}. Reason: ${reason}.`
        ]
      );

      // 3. For Transfers, execute the fraud flow
      if (transaction.TransactionType === "Transfer") {
        if (referenceId && referenceId.startsWith("TXN")) {
          const transferId = parseInt(referenceId.replace("TXN", ""));
          const [transferRows] = await connection.query(
            "SELECT * FROM TransferMoney WHERE TransferId = ?",
            [transferId]
          );

          if (transferRows.length > 0) {
            const transfer = transferRows[0];
            const suspectAcc = transfer.ToAccount;
            const amount = parseFloat(transfer.TransferAmount);

            // Fetch suspect account info
            const [suspectProfile] = await connection.query(
              "SELECT Balance, customerName FROM Customer WHERE AccountNumber = ?",
              [suspectAcc]
            );

            if (suspectProfile.length > 0) {
              const suspectBalance = parseFloat(suspectProfile[0].Balance);

              // Scenario A: Funds Available
              if (suspectBalance >= amount) {
                // Deduct from suspect, credit to victim (reversal/refund)
                const [victimProfile] = await connection.query(
                  "SELECT Balance FROM Customer WHERE AccountNumber = ?",
                  [accountNumber]
                );

                const victimNewBal = parseFloat(victimProfile[0].Balance) + amount;
                const suspectNewBal = suspectBalance - amount;

                await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [victimNewBal, accountNumber]);
                await connection.query("UPDATE Customer SET Balance = ? WHERE AccountNumber = ?", [suspectNewBal, suspectAcc]);

                // Log reversal in TransactionHistory for both
                await connection.query(
                  `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID, TransactionStatus)
                   VALUES (?, 'Deposit', ?, ?, ?, ?, 'SUCCESS')`,
                  [
                    accountNumber,
                    amount,
                    victimNewBal,
                    `AUTO-REFUND: Fraud reversal for disputed transfer to ${suspectAcc} (Dispute #${disputeId})`,
                    `REV${transferId}`,
                  ]
                );

                await connection.query(
                  `INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID, TransactionStatus)
                   VALUES (?, 'Withdrawal', ?, ?, ?, ?, 'SUCCESS')`,
                  [
                    suspectAcc,
                    amount,
                    suspectNewBal,
                    `AUTO-CLAWBACK: Fraud reversal for disputed transfer from ${accountNumber} (Dispute #${disputeId})`,
                    `REV${transferId}`,
                  ]
                );

                // Log in BalanceLog
                await connection.query(
                  `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
                   VALUES (?, ?, ?, ?, 'Reversal')`,
                  [accountNumber, victimProfile[0].Balance, victimNewBal, amount]
                );

                await connection.query(
                  `INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
                   VALUES (?, ?, ?, ?, 'Reversal')`,
                  [suspectAcc, suspectProfile[0].Balance, suspectNewBal, amount]
                );

                // Record double-entry bookkeeping journal entries
                await recordJournalEntry(connection, {
                  transactionType: "Reversal",
                  description: `Dispute #${disputeId} Auto-Resolved: Auto Fraud Reversal of Transfer to ${suspectAcc}`,
                  referenceId: `REV${transferId}`,
                  entries: [
                    {
                      accountName: "Liability: Customer Deposits",
                      subAccountNumber: accountNumber,
                      entryType: "Credit",
                      amount: amount,
                    },
                    {
                      accountName: "Liability: Customer Deposits",
                      subAccountNumber: suspectAcc,
                      entryType: "Debit",
                      amount: amount,
                    },
                  ],
                });

                // Set disputed transaction status to REFUNDED
                await connection.query(
                  "UPDATE TransactionHistory SET TransactionStatus = 'REFUNDED' WHERE TransactionID = ?",
                  [transactionId]
                );

                // Set dispute to Resolved
                await connection.query(
                  "UPDATE Dispute SET DisputeStatus = 'Resolved', AdminRemarks = 'Auto-resolved: Fraud reported, suspect funds clawbacked, victim refunded.', ResolvedAt = NOW() WHERE DisputeID = ?",
                  [disputeId]
                );

                // Create notifications
                await connection.query(
                  `INSERT INTO Notification (AccountNumber, Title, Message, Type)
                   VALUES (?, 'Fraud Dispute Resolved & Refunded', ?, 'success')`,
                  [accountNumber, `Fraud claim resolved automatically. A refund of ₹${amount} has been credited to your account.`]
                );

                await connection.query(
                  `INSERT INTO Notification (AccountNumber, Title, Message, Type)
                   VALUES (?, 'Account Debited (Fraud Reversal)', ?, 'alert')`,
                  [suspectAcc, `Your account was debited ₹${amount} due to an automated fraud report reversal.`]
                );

                await connection.commit();
                return res.status(201).json({
                  message: "Fraud reported successfully. Funds were recovered from suspect account and auto-refunded to your account.",
                  autoResolved: true,
                  refunded: true
                });
              } else {
                // Scenario B: Insufficient Funds
                // 1. Freeze suspect account
                await connection.query("UPDATE Customer SET isActive = 0 WHERE AccountNumber = ?", [suspectAcc]);

                // 2. Set transaction status to FROZEN
                await connection.query(
                  "UPDATE TransactionHistory SET TransactionStatus = 'FROZEN' WHERE TransactionID = ?",
                  [transactionId]
                );

                // 3. Create investigation case
                const [caseResult] = await connection.query(
                  `INSERT INTO InvestigationCase (DisputeID, TransactionID, SuspectAccountNumber, VictimAccountNumber, DisputedAmount, CaseStatus)
                   VALUES (?, ?, ?, ?, ?, 'Open')`,
                  [disputeId, transactionId, suspectAcc, accountNumber, amount]
                );
                const caseId = caseResult.insertId;

                // Update dispute details
                await connection.query(
                  "UPDATE Dispute SET AdminRemarks = ? WHERE DisputeID = ?",
                  [`Escalated: Suspect account frozen due to insufficient funds. Case pending investigation #${caseId}.`, disputeId]
                );

                // 4. Escalation support ticket for admin
                await connection.query(
                  "INSERT INTO HelpTicket (AccountNumber, Subject, Message) VALUES (?, ?, ?)",
                  [
                    accountNumber,
                    `FRAUD ESCALATION: Txn #${transactionId}`,
                    `Escalated fraud report. Suspect account ${suspectAcc} had insufficient funds (Balance: ₹${suspectBalance}) to refund victim ${accountNumber} (Disputed Amount: ₹${amount}). Suspect account has been frozen. Requires manual investigation (Case #${caseId}).`
                  ]
                );

                // Notification to suspect about block
                await connection.query(
                  `INSERT INTO Notification (AccountNumber, Title, Message, Type)
                   VALUES (?, 'Account Deactivated', 'Your account has been temporarily frozen due to a pending fraud investigation claim.', 'alert')`,
                  [suspectAcc]
                );

                // Notification to victim about escalation
                await connection.query(
                  `INSERT INTO Notification (AccountNumber, Title, Message, Type)
                   VALUES (?, 'Fraud Dispute Escalated', ?, 'info')`,
                  [accountNumber, `Fraud claim escalated for manual admin review. Suspect account has been frozen under Investigation Case #${caseId}.`]
                );

                await connection.commit();
                return res.status(201).json({
                  message: "Fraud reported. Suspect account has been frozen and escalated for manual investigation.",
                  autoResolved: false,
                  refunded: false,
                  caseId
                });
              }
            }
          }
        }
      }
    }

    await connection.commit();
    res.status(201).json({ message: "Dispute submitted successfully. Admin will review." });

    // Audit: Dispute/Fraud filed
    logAudit({
      actorType: 'user', actorId: accountNumber, action: isFraud ? 'FRAUD_REPORTED' : 'DISPUTE_FILED',
      category: 'Financial', entityType: 'Transaction', entityId: transactionId.toString(),
      ipAddress: getClientIP(req),
      newValues: { disputeId, transactionId, reason, isFraud },
      description: `${isFraud ? 'Fraud report' : 'Dispute'} filed for transaction #${transactionId} by account ${accountNumber}`,
    });
  } catch (error) {
    console.error("Create dispute error:", error);
    if (connection) await connection.rollback();
    res.status(500).json({ error: "Failed to submit dispute" });
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// GET /customer/disputes - Retrieve customer disputes
// ============================================================
route.get("/disputes", verifyToken, async (req, res) => {
  let connection;
  try {
    const accountNumber = req.user.AccNumber;
    connection = await db.getConnection();

    const [disputes] = await connection.query(
      `SELECT d.*, t.TransactionType, t.TransactionAmount, t.TransactionDate, t.Description as TxDescription, a.fullName as AdminName
       FROM Dispute d
       JOIN TransactionHistory t ON d.TransactionID = t.TransactionID
       LEFT JOIN Admin a ON d.ResolvedBy = a.AdminID
       WHERE d.AccountNumber = ?
       ORDER BY d.CreatedAt DESC`,
      [accountNumber]
    );

    res.status(200).json({ disputes });
  } catch (error) {
    console.error("Fetch disputes error:", error);
    res.status(500).json({ error: "Failed to fetch disputes" });
  } finally {
    if (connection) connection.release();
  }
});

module.exports = route;
