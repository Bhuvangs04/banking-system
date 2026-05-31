const mysql = require("mysql2/promise");
require("dotenv").config({ path: __dirname + "/../.env" });

async function migrate() {
  const hosts = ["127.0.0.1", "localhost", "::1", "::"];
  let connection;
  let successfulHost = null;

  for (const host of hosts) {
    try {
      console.log(`Connecting to database at ${host}:${process.env.DB_PORT || 3306}...`);
      connection = await mysql.createConnection({
        host: host,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true,
      });
      successfulHost = host;
      console.log(`Successfully connected to database using host: ${host}`);
      break;
    } catch (err) {
      console.log(`Could not connect using host ${host}: ${err.message}`);
    }
  }

  if (!connection) {
    console.error("FATAL: Failed to connect to MySQL database on all local hosts. Ensure MySQL is running on port 3306.");
    process.exit(1);
  }

  try {
    console.log("Running schema migrations...");

    // Helper to check if a column exists
    const checkColumnExists = async (table, column) => {
      const [rows] = await connection.query(
        `SHOW COLUMNS FROM \`${table}\` LIKE ?`,
        [column]
      );
      return rows.length > 0;
    };

    // Alter Loan table
    console.log("Altering Loan table if needed...");
    if (!(await checkColumnExists("Loan", "AmountRepaid"))) {
      await connection.query("ALTER TABLE Loan ADD COLUMN AmountRepaid DECIMAL(20,2) DEFAULT 0.00;");
      console.log("- Added AmountRepaid to Loan");
    }
    if (!(await checkColumnExists("Loan", "LateFee"))) {
      await connection.query("ALTER TABLE Loan ADD COLUMN LateFee DECIMAL(20,2) DEFAULT 0.00;");
      console.log("- Added LateFee to Loan");
    }
    if (!(await checkColumnExists("Loan", "LastRepaymentDate"))) {
      await connection.query("ALTER TABLE Loan ADD COLUMN LastRepaymentDate TIMESTAMP NULL DEFAULT NULL;");
      console.log("- Added LastRepaymentDate to Loan");
    }
    if (!(await checkColumnExists("Loan", "NextRepaymentDueDate"))) {
      await connection.query("ALTER TABLE Loan ADD COLUMN NextRepaymentDueDate TIMESTAMP NULL DEFAULT NULL;");
      console.log("- Added NextRepaymentDueDate to Loan");
    }
    if (!(await checkColumnExists("Loan", "RepaymentStatus"))) {
      await connection.query("ALTER TABLE Loan ADD COLUMN RepaymentStatus ENUM('Active', 'Paid', 'Overdue') DEFAULT 'Active';");
      console.log("- Added RepaymentStatus to Loan");
    }

    // Create LoanRepayment table
    console.log("Creating LoanRepayment table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS LoanRepayment (
        RepaymentID INT PRIMARY KEY AUTO_INCREMENT,
        LoanID INT NOT NULL,
        RepaymentAmount DECIMAL(20,2) NOT NULL,
        RepaymentDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        LateFeePaid DECIMAL(20,2) DEFAULT 0.00,
        FOREIGN KEY (LoanID) REFERENCES Loan(LoanID) ON DELETE CASCADE
      );
    `);
    console.log("- LoanRepayment table verified");

    // Create Dispute table
    console.log("Creating Dispute table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Dispute (
        DisputeID INT PRIMARY KEY AUTO_INCREMENT,
        AccountNumber VARCHAR(14) NOT NULL,
        TransactionID INT NOT NULL,
        DisputeReason VARCHAR(500) NOT NULL,
        DisputeStatus ENUM('Open', 'Resolved', 'Rejected') DEFAULT 'Open',
        AdminRemarks VARCHAR(500) DEFAULT NULL,
        ResolvedBy INT DEFAULT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ResolvedAt TIMESTAMP NULL DEFAULT NULL,
        FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
        FOREIGN KEY (TransactionID) REFERENCES TransactionHistory(TransactionID) ON DELETE CASCADE,
        FOREIGN KEY (ResolvedBy) REFERENCES Admin(AdminID) ON DELETE SET NULL
      );
    `);
    console.log("- Dispute table verified");

    // Create HelpTicket table
    console.log("Creating HelpTicket table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS HelpTicket (
        TicketID INT PRIMARY KEY AUTO_INCREMENT,
        AccountNumber VARCHAR(14) NOT NULL,
        Subject VARCHAR(150) NOT NULL,
        Message VARCHAR(1000) NOT NULL,
        Status ENUM('Open', 'In_Progress', 'Closed') DEFAULT 'Open',
        AdminReply VARCHAR(1000) DEFAULT NULL,
        RepliedBy INT DEFAULT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
        FOREIGN KEY (RepliedBy) REFERENCES Admin(AdminID) ON DELETE SET NULL
      );
    `);
    console.log("- HelpTicket table verified");

    // Create LedgerAccount table
    console.log("Creating LedgerAccount table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS LedgerAccount (
        AccountID INT PRIMARY KEY AUTO_INCREMENT,
        AccountName VARCHAR(100) UNIQUE NOT NULL,
        AccountType ENUM('Asset', 'Liability', 'Equity', 'Revenue', 'Expense') NOT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("- LedgerAccount table verified");

    // Seed LedgerAccount table if empty
    const [accCount] = await connection.query("SELECT COUNT(*) as count FROM LedgerAccount");
    if (accCount[0].count === 0) {
      console.log("Seeding LedgerAccount table...");
      await connection.query(`
        INSERT INTO LedgerAccount (AccountName, AccountType) VALUES
        ('Asset: Bank Cash', 'Asset'),
        ('Liability: Customer Deposits', 'Liability'),
        ('Asset: Loan Receivables', 'Asset'),
        ('Revenue: Interest & Fees', 'Revenue'),
        ('Expense: Write-offs & Reversals', 'Expense')
      `);
      console.log("- Seeded LedgerAccount table");
    }

    // Create JournalEntry table
    console.log("Creating JournalEntry table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS JournalEntry (
        JournalID INT PRIMARY KEY AUTO_INCREMENT,
        TransactionType ENUM('Deposit', 'Withdrawal', 'Transfer', 'Loan Payout', 'Loan Repayment', 'Reversal') NOT NULL,
        Description VARCHAR(255) NOT NULL,
        ReferenceID VARCHAR(50) DEFAULT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("- JournalEntry table verified");

    // Create LedgerEntry table
    console.log("Creating LedgerEntry table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS LedgerEntry (
        EntryID INT PRIMARY KEY AUTO_INCREMENT,
        JournalID INT NOT NULL,
        AccountID INT NOT NULL,
        SubAccountNumber VARCHAR(14) DEFAULT NULL,
        EntryType ENUM('Debit', 'Credit') NOT NULL,
        Amount DECIMAL(20,2) NOT NULL,
        BalanceAfter DECIMAL(20,2) NOT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (JournalID) REFERENCES JournalEntry(JournalID) ON DELETE CASCADE,
        FOREIGN KEY (AccountID) REFERENCES LedgerAccount(AccountID) ON DELETE CASCADE,
        FOREIGN KEY (SubAccountNumber) REFERENCES Customer(AccountNumber) ON DELETE SET NULL
      );
    `);
    console.log("- LedgerEntry table verified");

    // Alter Customer table for security columns
    console.log("Altering Customer table for PIN security...");
    if (!(await checkColumnExists("Customer", "FailedPinAttempts"))) {
      await connection.query("ALTER TABLE Customer ADD COLUMN FailedPinAttempts INT DEFAULT 0;");
      console.log("- Added FailedPinAttempts to Customer");
    }
    if (!(await checkColumnExists("Customer", "LockedUntil"))) {
      await connection.query("ALTER TABLE Customer ADD COLUMN LockedUntil TIMESTAMP NULL DEFAULT NULL;");
      console.log("- Added LockedUntil to Customer");
    }

    // Create OTPVerify table
    console.log("Creating OTPVerify table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS OTPVerify (
        OTPID INT PRIMARY KEY AUTO_INCREMENT,
        AccountNumber VARCHAR(14) NOT NULL,
        OTPCode VARCHAR(6) NOT NULL,
        ExpiresAt TIMESTAMP NOT NULL,
        IsUsed TINYINT DEFAULT 0,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
      );
    `);
    console.log("- OTPVerify table verified");
    
    // Create AdminNotification table for OTPs
    console.log("Creating AdminNotification table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS AdminNotification (
        NotificationID INT PRIMARY KEY AUTO_INCREMENT,
        AdminID INT NOT NULL,
        Title VARCHAR(100) NOT NULL,
        Message VARCHAR(500) NOT NULL,
        Type ENUM('info', 'success', 'warning', 'alert') DEFAULT 'info',
        IsRead TINYINT DEFAULT 0,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (AdminID) REFERENCES Admin(AdminID) ON DELETE CASCADE
      );
    `);
    console.log("- AdminNotification table verified");
    
    // Alter TransactionHistory for transaction states
    console.log("Altering TransactionHistory table for status...");
    if (!(await checkColumnExists("TransactionHistory", "TransactionStatus"))) {
      await connection.query("ALTER TABLE TransactionHistory ADD COLUMN TransactionStatus ENUM('PENDING', 'SUCCESS', 'FAILED', 'UNDER_REVIEW', 'FROZEN', 'REFUNDED', 'CHARGEBACK') DEFAULT 'SUCCESS';");
      console.log("- Added TransactionStatus to TransactionHistory");
    }

    // Alter DepositHistory for Maker-Checker and Maker-Checker states
    console.log("Altering DepositHistory table for Maker-Checker...");
    if (!(await checkColumnExists("DepositHistory", "Status"))) {
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN Status ENUM('PENDING_APPROVAL', 'PENDING_OTP', 'HOLD', 'COMPLETED', 'REVERSED', 'REJECTED') DEFAULT 'COMPLETED';");
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN ApprovalRequiredCount INT DEFAULT 0;");
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN CurrentApprovals INT DEFAULT 0;");
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN ApprovedBy1 INT DEFAULT NULL;");
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN ApprovedBy2 INT DEFAULT NULL;");
      await connection.query("ALTER TABLE DepositHistory ADD COLUMN HoldReleaseTime TIMESTAMP NULL DEFAULT NULL;");
      console.log("- Added Maker-Checker columns to DepositHistory");
    }

    // Create InvestigationCase table
    console.log("Creating InvestigationCase table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS InvestigationCase (
        CaseID INT PRIMARY KEY AUTO_INCREMENT,
        DisputeID INT NOT NULL,
        TransactionID INT NOT NULL,
        SuspectAccountNumber VARCHAR(14) NOT NULL,
        VictimAccountNumber VARCHAR(14) NOT NULL,
        DisputedAmount DECIMAL(20,2) NOT NULL,
        CaseStatus ENUM('Open', 'Under_Investigation', 'Resolved', 'Closed') DEFAULT 'Open',
        AdminRemarks VARCHAR(500) DEFAULT NULL,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (DisputeID) REFERENCES Dispute(DisputeID) ON DELETE CASCADE,
        FOREIGN KEY (TransactionID) REFERENCES TransactionHistory(TransactionID) ON DELETE CASCADE,
        FOREIGN KEY (SuspectAccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
        FOREIGN KEY (VictimAccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
      );
    `);
    console.log("- InvestigationCase table verified");

    // Create AuditLog table (immutable — no UPDATE/DELETE operations)
    console.log("Creating AuditLog table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS AuditLog (
        AuditID INT PRIMARY KEY AUTO_INCREMENT,
        Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ActorType ENUM('user', 'admin', 'system') NOT NULL,
        ActorID VARCHAR(50) DEFAULT NULL,
        Action VARCHAR(100) NOT NULL,
        Category ENUM('Authentication', 'Financial', 'Admin', 'Security', 'Account', 'System') NOT NULL,
        EntityType VARCHAR(50) DEFAULT NULL,
        EntityID VARCHAR(50) DEFAULT NULL,
        IPAddress VARCHAR(45) DEFAULT NULL,
        OldValues JSON DEFAULT NULL,
        NewValues JSON DEFAULT NULL,
        Description VARCHAR(500) NOT NULL,
        INDEX idx_audit_category (Category),
        INDEX idx_audit_timestamp (Timestamp),
        INDEX idx_audit_actor (ActorType, ActorID),
        INDEX idx_audit_action (Action)
      );
    `);
    console.log("- AuditLog table verified");

    // Create SystemSettings table
    console.log("Creating SystemSettings table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS SystemSettings (
        SettingKey VARCHAR(50) PRIMARY KEY,
        SettingValue VARCHAR(255) NOT NULL,
        Description VARCHAR(255),
        UpdatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `);
    console.log("- SystemSettings table verified");

    // Seed SystemSettings
    const [settingsCount] = await connection.query("SELECT COUNT(*) as count FROM SystemSettings");
    if (settingsCount[0].count === 0) {
      console.log("Seeding SystemSettings...");
      await connection.query(`
        INSERT INTO SystemSettings (SettingKey, SettingValue, Description) VALUES
        ('LOAN_BASE_RATE_SAVINGS', '5.0', 'Base interest rate for Savings account loans (%)'),
        ('LOAN_BASE_RATE_CURRENT', '6.0', 'Base interest rate for Current account loans (%)'),
        ('LATE_FEE_FIXED_AMOUNT', '500', 'Fixed penalty amount for missed EMI payments (₹)'),
        ('LATE_FEE_PERCENTAGE', '2.0', 'Percentage of overdue EMI added as penalty (%)')
      `);
      console.log("- SystemSettings seeded successfully");
    }


    // ── RBAC: Role-Based Access Control ────────────────────────
    console.log("Creating Role table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS Role (
        RoleID INT PRIMARY KEY AUTO_INCREMENT,
        RoleName VARCHAR(50) NOT NULL UNIQUE,
        Description VARCHAR(255),
        IsSystem BOOLEAN DEFAULT FALSE,
        CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("- Role table verified");

    console.log("Creating RolePermission table...");
    await connection.query(`
      CREATE TABLE IF NOT EXISTS RolePermission (
        RoleID INT NOT NULL,
        Permission VARCHAR(50) NOT NULL,
        PRIMARY KEY (RoleID, Permission),
        FOREIGN KEY (RoleID) REFERENCES Role(RoleID) ON DELETE CASCADE
      );
    `);
    console.log("- RolePermission table verified");

    // Add RoleID column to Admin table if it doesn't exist
    console.log("Altering Admin table for RBAC...");
    try {
      await connection.query(`ALTER TABLE Admin ADD COLUMN RoleID INT DEFAULT NULL`);
      await connection.query(`ALTER TABLE Admin ADD CONSTRAINT fk_admin_role FOREIGN KEY (RoleID) REFERENCES Role(RoleID) ON DELETE SET NULL`);
      console.log("- Admin.RoleID column added");
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME") {
        console.log("- Admin.RoleID column already exists");
      } else if (e.message && e.message.includes("Duplicate")) {
        console.log("- Admin.RoleID column already exists");
      } else {
        throw e;
      }
    }

    // Seed default roles if they don't exist
    console.log("Seeding default roles...");
    const ALL_PERMISSIONS = [
      'view_dashboard', 'view_customers', 'edit_customers', 'verify_accounts',
      'block_accounts', 'deposit_money', 'view_loans', 'approve_loans',
      'view_disputes', 'resolve_disputes', 'resolve_cases',
      'view_audit', 'export_audit', 'view_tickets', 'reply_tickets',
      'view_ledger', 'manage_roles', 'manage_admins', 'manage_settings'
    ];

    const DEFAULT_ROLES = [
      {
        name: 'Super Admin',
        description: 'Full system access with all permissions',
        permissions: ALL_PERMISSIONS,
      },
      {
        name: 'Manager',
        description: 'Operational access without system administration',
        permissions: ALL_PERMISSIONS.filter(p => !['manage_roles', 'manage_admins', 'export_audit'].includes(p)),
      },
      {
        name: 'Auditor',
        description: 'Read-only access with audit trail capabilities',
        permissions: ['view_dashboard', 'view_customers', 'view_loans', 'view_disputes', 'view_audit', 'export_audit', 'view_tickets', 'view_ledger'],
      },
      {
        name: 'Support Agent',
        description: 'Customer-facing support operations only',
        permissions: ['view_dashboard', 'view_customers', 'view_tickets', 'reply_tickets', 'view_disputes'],
      },
    ];

    for (const role of DEFAULT_ROLES) {
      // Insert role if not exists
      const [existing] = await connection.query("SELECT RoleID FROM Role WHERE RoleName = ?", [role.name]);
      let roleId;
      if (existing.length === 0) {
        const [result] = await connection.query(
          "INSERT INTO Role (RoleName, Description, IsSystem) VALUES (?, ?, TRUE)",
          [role.name, role.description]
        );
        roleId = result.insertId;
        console.log(`  - Created role: ${role.name} (ID: ${roleId})`);
      } else {
        roleId = existing[0].RoleID;
        console.log(`  - Role already exists: ${role.name} (ID: ${roleId})`);
      }

      // Seed permissions for this role
      for (const perm of role.permissions) {
        try {
          await connection.query(
            "INSERT IGNORE INTO RolePermission (RoleID, Permission) VALUES (?, ?)",
            [roleId, perm]
          );
        } catch (e) {
          // Ignore duplicate key errors
        }
      }
    }

    // Auto-assign existing admins without a role to Super Admin
    const [superAdminRole] = await connection.query("SELECT RoleID FROM Role WHERE RoleName = 'Super Admin'");
    if (superAdminRole.length > 0) {
      const [updated] = await connection.query(
        "UPDATE Admin SET RoleID = ? WHERE RoleID IS NULL",
        [superAdminRole[0].RoleID]
      );
      if (updated.affectedRows > 0) {
        console.log(`  - Auto-assigned ${updated.affectedRows} existing admin(s) to Super Admin role`);
      }
    }

    console.log("- RBAC roles and permissions seeded");

    // Log migration completion as a system audit event
    await connection.query(
      `INSERT INTO AuditLog (ActorType, ActorID, Action, Category, Description)
       VALUES ('system', 'SYSTEM', 'MIGRATION_COMPLETE', 'System', 'Schema migrations completed successfully')`
    );

    console.log("Schema migrations completed successfully!");
    
    // Also, if the host we connected with is different from the one in .env, update .env!
    if (successfulHost && successfulHost !== process.env.DB_HOST) {
      console.log(`Updating DB_HOST in .env from ${process.env.DB_HOST} to ${successfulHost}...`);
      // Read env file, replace DB_HOST
      const fs = require("fs");
      const envPath = __dirname + "/../.env";
      let envContent = fs.readFileSync(envPath, "utf8");
      envContent = envContent.replace(/DB_HOST\s*=\s*[^\r\n]+/g, `DB_HOST=${successfulHost}`);
      fs.writeFileSync(envPath, envContent, "utf8");
      console.log("- .env file updated");
    }

  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    if (connection) await connection.end();
  }
}

migrate();
