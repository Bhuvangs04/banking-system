CREATE DATABASE bank;
USE bank;

-- AccountType table for different account types
-- CREATE TABLE AccountType(
--     TypeID INT PRIMARY KEY AUTO_INCREMENT,
--     TypeName VARCHAR(50),          -- Name of the account type (e.g., 'Savings', 'Current')
--     Description VARCHAR(255),      -- Description of the account type
--     Benefits VARCHAR(255)          -- Benefits of this account type
-- );

-- Customer table with Balance field
CREATE TABLE Customer(
    AccountNumber VARCHAR(14) PRIMARY KEY, 
    customerName VARCHAR(150),
    AccountType VARCHAR(50),
    customerPhone VARCHAR(12) UNIQUE,
    customerEmail VARCHAR(50) UNIQUE,
    customerAddress VARCHAR(150),
    customerCity VARCHAR(100),
    CustomerPassword VARCHAR(200),
    Balance DECIMAL(20,2) DEFAULT 0.00,
	AccountVerify TINYINT DEFAULT 0 -- Current balance for the customer
);

-- Indexes on customerPhone and customerEmail for optimization
CREATE INDEX idx_customerPhone ON Customer(customerPhone);
CREATE INDEX idx_customerEmail ON Customer(customerEmail);

-- Loan table with AccountNumber as foreign key
CREATE TABLE Loan(
    LoanID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    LoanAmount DECIMAL(20,2), 
    LoanInterest DECIMAL(5,2), 
    ApprovalStatus VARCHAR(10) DEFAULT 'Pending',
    LoanDurationMonths INT,          
    TotalPayableAmount DECIMAL(20,2) DEFAULT 0.00,
    AppliedDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ApprovalDate TIMESTAMP NULL DEFAULT NULL,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

-- Index on AccountNumber for faster joins with Customer table
CREATE INDEX idx_loan_account ON Loan(AccountNumber);

-- WithdrawHistory table with timestamp to track withdrawals
CREATE TABLE WithdrawHistory(
    WithdrawId INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    WithdrawAmount INT,
    AfterBalance INT,
    WithdrawTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

-- Index on AccountNumber for faster joins with Customer table
CREATE INDEX idx_withdraw_account ON WithdrawHistory(AccountNumber);

-- TransferMoney table with timestamp to track transfers
CREATE TABLE TransferMoney(
    TransferId INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    ToAccount VARCHAR(14),
    TransferTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    TransferAmount INT,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber) ON DELETE CASCADE,
    FOREIGN KEY (ToAccount) REFERENCES Customer(AccountNumber) ON DELETE CASCADE
);

-- Indexes on AccountNumber and ToAccount for faster query performance
CREATE INDEX idx_transfer_account ON TransferMoney(AccountNumber);
CREATE INDEX idx_transfer_toAccount ON TransferMoney(ToAccount);

-- BalanceLog table to track changes in balance (e.g., for withdrawals and transfers)
CREATE TABLE BalanceLog(
    LogID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    OldBalance INT,
    NewBalance INT,
    ChangeAmount INT,
    ChangeType VARCHAR(50),
    ChangeTime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber)
);

-- TransactionHistory table for tracking all transactions (Deposits, Withdrawals, Transfers)
CREATE TABLE TransactionHistory(
    TransactionID INT PRIMARY KEY AUTO_INCREMENT,
    AccountNumber VARCHAR(14),
    TransactionType VARCHAR(50),
    TransactionAmount INT,
    TransactionDate TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    Description VARCHAR(255),  -- Optional description for the transaction
    FOREIGN KEY (AccountNumber) REFERENCES Customer(AccountNumber)
);

-- Trigger for logging withdrawals and updating balances
DELIMITER $$
CREATE TRIGGER log_withdrawal
AFTER INSERT ON WithdrawHistory
FOR EACH ROW
BEGIN
    DECLARE old_balance INT;

    -- Fetch the old balance before the withdrawal
    SELECT Balance INTO old_balance FROM Customer WHERE AccountNumber = NEW.AccountNumber;

    -- Insert the withdrawal log into BalanceLog
    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.AccountNumber, old_balance, NEW.AfterBalance, NEW.WithdrawAmount, 'Withdraw');

    -- Insert the transaction into TransactionHistory
    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, Description)
    VALUES (NEW.AccountNumber, 'Withdrawal', NEW.WithdrawAmount, CONCAT('Withdrawn amount ', NEW.WithdrawAmount));
END$$
DELIMITER ;


-- Trigger for updating balances when a money transfer happens
DELIMITER $$
CREATE TRIGGER log_transfer
AFTER INSERT ON TransferMoney
FOR EACH ROW
BEGIN
    DECLARE sender_balance INT;
    DECLARE receiver_balance INT;

    -- Fetch the sender's current balance (no need to update balance here)
    SELECT Balance INTO sender_balance FROM Customer WHERE AccountNumber = NEW.AccountNumber;

    -- Fetch the receiver's current balance
    SELECT Balance INTO receiver_balance FROM Customer WHERE AccountNumber = NEW.ToAccount;

    -- Insert the transaction into TransactionHistory for sender
    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, Description)
    VALUES (NEW.AccountNumber, 'Transfer', NEW.TransferAmount, CONCAT('Transferred to ', NEW.ToAccount));

    -- Insert the transaction into TransactionHistory for receiver
    INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, Description)
    VALUES (NEW.ToAccount, 'Receive', NEW.TransferAmount, CONCAT('Received from ', NEW.AccountNumber));

    -- Insert the balance log for sender
    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.AccountNumber, sender_balance+NEW.TransferAmount, sender_balance, NEW.TransferAmount, 'Transfer');

    -- Insert the balance log for receiver
    INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
    VALUES (NEW.ToAccount, receiver_balance-NEW.TransferAmount, receiver_balance, NEW.TransferAmount, 'Receive');
END$$
DELIMITER ;


-- Trigger for handling loan approval and balance update
DELIMITER $$ 
CREATE TRIGGER after_loan_approval
AFTER UPDATE ON Loan
FOR EACH ROW
BEGIN
    DECLARE current_balance DECIMAL(20,2);
    DECLARE total_interest DECIMAL(20,2);
    DECLARE total_amount DECIMAL(20,2);

    -- Only proceed if the loan is approved
    IF NEW.ApprovalStatus = 'Approved' THEN
        -- Fetch the customer's current balance
        SELECT Balance INTO current_balance 
        FROM Customer 
        WHERE AccountNumber = NEW.AccountNumber;

        -- Calculate the total interest based on the loan amount, interest rate, and duration
        SET total_interest = (NEW.LoanAmount * NEW.LoanInterest / 100) * (NEW.LoanDurationMonths / 12);

        -- Calculate the total payable amount (principal + interest)
        SET total_amount = NEW.LoanAmount + total_interest;

        -- Update the customer's balance by adding the loan amount
        UPDATE Customer
        SET Balance = current_balance + NEW.LoanAmount
        WHERE AccountNumber = NEW.AccountNumber;

        -- Insert into TransactionHistory to log the loan approval
        INSERT INTO TransactionHistory (AccountNumber, TransactionType, TransactionAmount, Description)
        VALUES (NEW.AccountNumber, 'Loan Approved', NEW.LoanAmount, 
                CONCAT('Loan amount of ', NEW.LoanAmount, ' approved with interest rate of ', NEW.LoanInterest, '%'));

        -- Insert into BalanceLog to log the change in balance
        INSERT INTO BalanceLog (AccountNumber, OldBalance, NewBalance, ChangeAmount, ChangeType)
        VALUES (NEW.AccountNumber, current_balance, current_balance + NEW.LoanAmount, NEW.LoanAmount, 'Loan Approval');
    END IF;
END$$
DELIMITER ;


-- DELETE FROM TransactionHistory;
-- DELETE FROM BalanceLog;
-- DELETE FROM WithdrawHistory;
-- DELETE FROM TransferMoney;

-- TRUNCATE TABLE TransactionHistory;
-- TRUNCATE TABLE BalanceLog;
-- TRUNCATE TABLE WithdrawHistory;
-- TRUNCATE TABLE TransferMoney;

-- DELETE FROM Customer;
-- SHOW TABLE STATUS LIKE 'Customer';
-- ALTER TABLE Customer
-- ADD COLUMN AccountVerify TINYINT DEFAULT 0;


 -- 0 for not verified, 1 for verified


-- UPDATE Customer
-- SET Balance = 15000.00;
 -- DROP TRIGGER IF EXISTS after_loan_approval;





