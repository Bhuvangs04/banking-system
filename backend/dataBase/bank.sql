DROP DATABASE IF EXISTS bank;
CREATE DATABASE bank;
USE bank;

-- ============================================================
-- Admin table for manager/admin authentication
-- ============================================================
CREATE TABLE Admin (
    AdminID INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(200) NOT NULL,
    fullName VARCHAR(150),
    role ENUM('admin', 'superadmin') DEFAULT 'admin',
    isActive TINYINT DEFAULT 1,
    lastLogin TIMESTAMP NULL DEFAULT NULL,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================================
-- Customer table with proper DECIMAL types
-- ============================================================
CREATE TABLE Customer (
    AccountNumber VARCHAR(14) PRIMARY KEY,
    customerName VARCHAR(150) NOT NULL,
    AccountType ENUM('Savings', 'Current') NOT NULL,
    customerPhone VARCHAR(15) UNIQUE NOT NULL,
    customerEmail VARCHAR(100) UNIQUE NOT NULL,
    customerAddress VARCHAR(255),
    customerCity VARCHAR(100),
    CustomerPassword VARCHAR(200) NOT NULL,
    TransactionPin VARCHAR(200) DEFAULT NULL,
    Balance DECIMAL(20,2) DEFAULT 0.00,
    DailyTransferLimit DECIMAL(20,2) DEFAULT 500000.00,
    AccountVerify TINYINT DEFAULT 0,
    isActive TINYINT DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_customerPhone ON Customer(customerPhone);
CREATE INDEX idx_customerEmail ON Customer(customerEmail);
CREATE INDEX idx_customerName ON Customer(customerName);

-- ============================================================
-- Beneficiary table for saved transfer recipients
-- ============================================================
CREATE TABLE Beneficiary (
    BeneficiaryID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14) NOT NULL,
    BeneficiaryAccount VARCHAR(14) NOT NULL,
    BeneficiaryName VARCHAR(150),
    Nickname VARCHAR(100),
    isActive TINYINT DEFAULT 1,
    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    FOREIGN KEY (BeneficiaryAccount) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    UNIQUE KEY unique_beneficiary (AccountNumber, BeneficiaryAccount)
);

CREATE INDEX idx_beneficiary_account ON Beneficiary(AccountNumber);

-- ============================================================
-- Loan table
-- ============================================================
CREATE TABLE Loan (
    LoanID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    LoanAmount DECIMAL(20,2),
    LoanInterest DECIMAL(5,2),
    ApprovalStatus ENUM('Pending', 'Approved', 'Denied') DEFAULT 'Pending',
    LoanDurationMonths INT,
    TotalPayableAmount DECIMAL(20,2) DEFAULT 0.00,
    MonthlyEMI DECIMAL(20,2) DEFAULT 0.00,
    AppliedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ApprovalDate TIMESTAMP NULL DEFAULT NULL,
    ApprovedBy INT DEFAULT NULL,
    Remarks VARCHAR(500) DEFAULT NULL,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    FOREIGN KEY (ApprovedBy) REFERENCES Admin(AdminID) ON DELETE SET NULL
);

CREATE INDEX idx_loan_account ON Loan(AccountNumber);
CREATE INDEX idx_loan_status ON Loan(ApprovalStatus);

-- ============================================================
-- Deposit History table
-- ============================================================
CREATE TABLE DepositHistory (
    DepositID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    DepositAmount DECIMAL(20,2),
    BeforeBalance DECIMAL(20,2),
    AfterBalance DECIMAL(20,2),
    DepositedBy INT DEFAULT NULL,
    DepositMethod VARCHAR(50) DEFAULT 'Cash',
    DepositTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    FOREIGN KEY (DepositedBy) REFERENCES Admin(AdminID) ON DELETE SET NULL
);

CREATE INDEX idx_deposit_account ON DepositHistory(AccountNumber);

-- ============================================================
-- Withdraw History table with DECIMAL types
-- ============================================================
CREATE TABLE WithdrawHistory (
    WithdrawId INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    WithdrawAmount DECIMAL(20,2),
    BeforeBalance DECIMAL(20,2),
    AfterBalance DECIMAL(20,2),
    WithdrawTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

CREATE INDEX idx_withdraw_account ON WithdrawHistory(AccountNumber);

-- ============================================================
-- Transfer Money table with DECIMAL types
-- ============================================================
CREATE TABLE TransferMoney (
    TransferId INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    ToAccount VARCHAR(14),
    TransferAmount DECIMAL(20,2),
    SenderBalanceAfter DECIMAL(20,2),
    ReceiverBalanceAfter DECIMAL(20,2),
    Description VARCHAR(255) DEFAULT NULL,
    TransferTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    FOREIGN KEY (ToAccount) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

CREATE INDEX idx_transfer_account ON TransferMoney(AccountNumber);
CREATE INDEX idx_transfer_toAccount ON TransferMoney(ToAccount);

-- ============================================================
-- Balance Log table with DECIMAL types
-- ============================================================
CREATE TABLE BalanceLog (
    LogID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    OldBalance DECIMAL(20,2),
    NewBalance DECIMAL(20,2),
    ChangeAmount DECIMAL(20,2),
    ChangeType VARCHAR(50),
    ChangeTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

CREATE INDEX idx_balance_account ON BalanceLog(AccountNumber);

-- ============================================================
-- Transaction History with DECIMAL types
-- ============================================================
CREATE TABLE TransactionHistory (
    TransactionID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    TransactionType ENUM('Deposit', 'Withdrawal', 'Transfer', 'Receive', 'Loan Approved', 'Loan Denied') NOT NULL,
    TransactionAmount DECIMAL(20,2),
    BalanceAfter DECIMAL(20,2) DEFAULT NULL,
    TransactionDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Description VARCHAR(255),
    ReferenceID VARCHAR(50) DEFAULT NULL,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

CREATE INDEX idx_transaction_account ON TransactionHistory(AccountNumber);
CREATE INDEX idx_transaction_type ON TransactionHistory(TransactionType);
CREATE INDEX idx_transaction_date ON TransactionHistory(TransactionDate);

-- ============================================================
-- Notification table
-- ============================================================
CREATE TABLE Notification (
    NotificationID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    Title VARCHAR(100) NOT NULL,
    Message VARCHAR(500) NOT NULL,
    Type ENUM('info', 'success', 'warning', 'alert') DEFAULT 'info',
    IsRead TINYINT DEFAULT 0,
    CreatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

CREATE INDEX idx_notification_account ON Notification(AccountNumber);
CREATE INDEX idx_notification_read ON Notification(IsRead);

-- ============================================================
-- Login Attempts table for brute-force protection
-- ============================================================
CREATE TABLE LoginAttempts (
    AttemptID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    IPAddress VARCHAR(45),
    Success TINYINT DEFAULT 0,
    AttemptTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_login_account ON LoginAttempts(AccountNumber);
CREATE INDEX idx_login_time ON LoginAttempts(AttemptTime);

-- ============================================================
-- Triggers
-- ============================================================

DELIMITER $$
CREATE TRIGGER log_withdrawal
AFTER INSERT ON WithdrawHistory
FOR EACH ROW
BEGIN
    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.AccountNumber, NEW.BeforeBalance, NEW.AfterBalance, NEW.WithdrawAmount, 'Withdrawal');

    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description)
    VALUES (NEW.AccountNumber, 'Withdrawal', NEW.WithdrawAmount, NEW.AfterBalance,
            CONCAT('Withdrawn amount: ', NEW.WithdrawAmount));
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER log_deposit
AFTER INSERT ON DepositHistory
FOR EACH ROW
BEGIN
    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.AccountNumber, NEW.BeforeBalance, NEW.AfterBalance, NEW.DepositAmount, 'Deposit');

    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description)
    VALUES (NEW.AccountNumber, 'Deposit', NEW.DepositAmount, NEW.AfterBalance,
            CONCAT('Deposited amount: ', NEW.DepositAmount));
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER log_transfer
AFTER INSERT ON TransferMoney
FOR EACH ROW
BEGIN
    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
    VALUES (NEW.AccountNumber, 'Transfer', NEW.TransferAmount, NEW.SenderBalanceAfter,
            CONCAT('Transferred to ', NEW.ToAccount, IFNULL(CONCAT(' - ', NEW.Description), '')),
            CONCAT('TXN', NEW.TransferId));

    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.AccountNumber, NEW.SenderBalanceAfter + NEW.TransferAmount, NEW.SenderBalanceAfter, NEW.TransferAmount, 'Transfer');

    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description, ReferenceID)
    VALUES (NEW.ToAccount, 'Receive', NEW.TransferAmount, NEW.ReceiverBalanceAfter,
            CONCAT('Received from ', NEW.AccountNumber, IFNULL(CONCAT(' - ', NEW.Description), '')),
            CONCAT('TXN', NEW.TransferId));

    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.ToAccount, NEW.ReceiverBalanceAfter - NEW.TransferAmount, NEW.ReceiverBalanceAfter, NEW.TransferAmount, 'Receive');
END$$
DELIMITER ;

DELIMITER $$
CREATE TRIGGER after_loan_approval
AFTER UPDATE ON Loan
FOR EACH ROW
BEGIN
    DECLARE current_balance DECIMAL(20,2);
    DECLARE new_balance DECIMAL(20,2);

    IF NEW.ApprovalStatus = 'Approved' AND OLD.ApprovalStatus = 'Pending' THEN
        SELECT Balance INTO current_balance FROM Customer WHERE AccountNumber = NEW.AccountNumber;
        SET new_balance = current_balance + NEW.LoanAmount;

        UPDATE Customer SET Balance = new_balance WHERE AccountNumber = NEW.AccountNumber;

        INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, BalanceAfter, Description)
        VALUES (NEW.AccountNumber, 'Loan Approved', NEW.LoanAmount, new_balance,
                CONCAT('Loan #', NEW.LoanID, ' approved. Amount: ', NEW.LoanAmount, ', Interest: ', NEW.LoanInterest, '%'));

        INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
        VALUES (NEW.AccountNumber, current_balance, new_balance, NEW.LoanAmount, 'Loan Approval');

        INSERT INTO Notification (AccountNumber, Title, Message, Type)
        VALUES (NEW.AccountNumber, 'Loan Approved!',
                CONCAT('Your loan of ', NEW.LoanAmount, ' has been approved and credited to your account.'), 'success');
    END IF;

    IF NEW.ApprovalStatus = 'Denied' AND OLD.ApprovalStatus = 'Pending' THEN
        INSERT INTO Notification (AccountNumber, Title, Message, Type)
        VALUES (NEW.AccountNumber, 'Loan Application Denied',
                CONCAT('Your loan application of ', NEW.LoanAmount, ' has been denied.'), 'warning');
    END IF;
END$$
DELIMITER ;
