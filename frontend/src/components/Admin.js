import React, { useState } from "react";
import axios from "axios";
import "../App.css";

const Manager = () => {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState("approveLoan");
  const [loanApplications, setLoanApplications] = useState([]);
  const [searchAccountNumber, setSearchAccountNumber] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [loanApprovalStatus, setLoanApprovalStatus] = useState(null);
  const [newCustomers, setNewCustomers] = useState([]);
  const [accountName, setAccountName] = useState("");
  const [reports, setReports] = useState([]);
  const [searchName, setSearchName] = useState("");
  const [accountData, setAccountData] = useState(null);

  const openUpdateModal = (account) => {
    setSelectedAccount(account);
    setModalVisible(true);
  };

  // Function to close modal
  const closeModal = () => {
    setModalVisible(false);
    setSelectedAccount(null);
  };

  const updateAccount = async (e) => {
    e.preventDefault();
    try {
      await axios.post(
        `http://localhost:8081/admin/customer/update?accountNumber=${selectedAccount.AccountNumber}`,
        {
          customerName: selectedAccount.customerName,
          customerPhone: selectedAccount.customerPhone,
          customerEmail: selectedAccount.customerEmail,
          customerAddress: selectedAccount.customerAddress,
          customerCity: selectedAccount.customerCity,
        }
      );
      alert("Account updated successfully");
      closeModal();
      // Optionally refresh account data here
    } catch (error) {
      console.error("Error updating account:", error);
    }
  };

  // Function to search for an account by customer name
  const searchAccount = async (searchName) => {
    try {
      //console.log(searchName);
      const response = await axios.get(
        "http://localhost:8081/admin/customer/searchByName",
        {
          params: {
            name: searchName,
          },
        }
      );
      if (response.data.length > 0) {
        setAccountData(response.data);
        console.log(response.data); // Store all matching accounts
      } else {
        alert("No accounts found for this name");
      }
    } catch (error) {
      console.error("Error fetching account data:", error);
    }
  };

  // Function to delete an account by account number
  // const deleteAccount = async (accountNumber) => {
  //   try {
  //     await axios.delete(`http://localhost:8081/admin/customer/deleteAccount`, {
  //       params: {
  //         accountNumber: accountNumber,
  //       },
  //     });
  //     alert("Account deleted successfully");
  //     setAccountData(
  //       accountData.filter((account) => account.accountNumber !== accountNumber)
  //     ); // Remove the deleted account from the state
  //   } catch (error) {
  //     console.error("Error deleting account:", error);
  //   }
  // };

  const handleAccountVerification = async (accountNumber) => {
    try {
      const response = await axios.post(
        `http://localhost:8081/admin/verifyCustomerAccount`,
        { accountNumber: accountNumber }
      );

      // Check the response for success
      if (response.data.success) {
        setNewCustomers((prevCustomers) =>
          prevCustomers.map((customer) =>
            customer.AccountNumber === accountNumber
              ? { ...customer, AccountVerify: 1 }
              : customer
          )
        );
        alert("Account successfully verified!");
      } else {
        alert("Error verifying account.");
      }
    } catch (error) {
      console.error("Error verifying customer account:", error); // Log error
      alert("Error verifying account."); // Show error message to user
    }
  };

  // Function to handle fetching loan applications
  const fetchLoanApplications = async () => {
    try {
      const response = await axios.get(
        "http://localhost:8081/admin/loanApplications"
      );
      setLoanApplications(response.data);
    } catch (error) {
      console.error("Error fetching loan applications:", error);
    }
  };

  // Function to approve or deny loan
  const handleLoanApproval = async (loanId, status) => {
    try {
      await axios.post(`http://localhost:8081/admin/approveLoan/${loanId}`, {
        approvalStatus: status,
      });
      setLoanApprovalStatus(`Loan ${status}`);

      // Remove the loan that has been approved or denied
      setLoanApplications((prevLoans) =>
        prevLoans.filter((loan) => loan.LoanID !== loanId)
      );
    } catch (error) {
      console.error("Error updating loan status:", error);
    }
  };

  // Function to deposit money into an account
  const handleDepositMoney = async () => {
    try {
      const response = await axios.post(
        `http://localhost:8081/admin/depositMoney`,
        { accountNumber: searchAccountNumber, depositAmount: depositAmount }
      );
      alert(response.data.message);
      setSearchAccountNumber("");
      setDepositAmount("");
      setAccountName("");
    } catch (error) {
      console.error("Error depositing money:", error);
    }
  };

  // Function to verify account and get account holder's name
  const verifyAccount = async () => {
    try {
      const response = await axios.get(
        `http://localhost:8081/admin/verifyAccount/${searchAccountNumber}`
      );
      if (response.data.accountExists) {
        setAccountName(response.data.accountName); // Set the account name if found
      } else {
        alert("Account not found");
        setAccountName(""); // Reset if account not found
      }
    } catch (error) {
      console.error("Error verifying account:", error);
    }
  };

  // Function to fetch reports
  const fetchReports = async () => {
    try {
      const response = await axios.get("http://localhost:8081/admin/reports");
      const { accountExists, customerName, AccountNumber, AccountVerify } =
        response.data;

      // Only set reports if the account exists
      if (accountExists) {
        setReports([
          {
            customerName,
            AccountNumber,
            AccountVerify,
          },
        ]);
      } else {
        setReports([]); // No reports found
      }
    } catch (error) {
      console.error("Error fetching reports:", error);
    }
  };

  return (
    <div className="manager">
      <nav className="navbar">
        <button
          className={`nav-button ${
            activeTab === "approveLoan" ? "active" : ""
          }`}
          onClick={() => setActiveTab("approveLoan")}
        >
          Approve Loan
        </button>
        <button
          className={`nav-button ${
            activeTab === "depositMoney" ? "active" : ""
          }`}
          onClick={() => setActiveTab("depositMoney")}
        >
          Deposit Money
        </button>
        <button
          className={`nav-button ${
            activeTab === "viewReports" ? "active" : ""
          }`}
          onClick={() => setActiveTab("viewReports")}
        >
          View Reports
        </button>
        <button
          className={`nav-button ${
            activeTab === "deleteReports" ? "active" : ""
          }`}
          onClick={() => setActiveTab("deleteReports")}
        >
          Update Account
        </button>
      </nav>

      <div className="container">
        {/* Loan Approval Tab */}
        {activeTab === "approveLoan" && (
          <div className="loan-approval">
            <h2>Loan Applications</h2>
            <button className="fetch-loans-btn" onClick={fetchLoanApplications}>
              Fetch Loan Applications
            </button>
            {loanApplications.length > 0 ? (
              <ul className="loan-list">
                {loanApplications.map((loan) => (
                  <li className="loan-item" key={loan.LoanID}>
                    <div className="loan-details">
                      <p>
                        <strong>Account Number:</strong> {loan.AccountNumber}
                      </p>
                      <p>
                        <strong>Amount:</strong> {loan.LoanAmount}
                      </p>
                      <p>
                        <strong>Duration:</strong> {loan.LoanDurationMonths}{" "}
                        months
                      </p>
                      <p>
                        <strong>Status:</strong> {loan.ApprovalStatus}
                      </p>
                      {loan.ApprovalStatus === "Pending" && (
                        <div className="loan-actions">
                          <button
                            className="approve-btn"
                            onClick={() =>
                              handleLoanApproval(loan.LoanID, "Approved")
                            }
                          >
                            Approve
                          </button>
                          <button
                            className="deny-btn"
                            onClick={() =>
                              handleLoanApproval(loan.LoanID, "Denied")
                            }
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No pending loan applications</p>
            )}
          </div>
        )}

        {/* Deposit Money Tab */}
        {activeTab === "depositMoney" && (
          <div className="deposit-money">
            <h2>Deposit Money</h2>
            <input
              type="text"
              className="input-field"
              placeholder="Enter Account Number"
              value={searchAccountNumber}
              onChange={(e) => setSearchAccountNumber(e.target.value)}
            />
            <button className="verify-btn" onClick={verifyAccount}>
              Verify
            </button>
            {accountName && (
              <p>
                <strong>Account Holder Name: </strong>
                <span>{accountName}</span>
              </p>
            )}
            <input
              type="number"
              className="input-field"
              placeholder="Enter Amount"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <button className="deposit-btn" onClick={handleDepositMoney}>
              Deposit
            </button>
          </div>
        )}

        {/* View Reports Tab */}
        {activeTab === "viewReports" && (
          <div className="view-reports">
            <h2 className="reports-title">New Customers</h2>
            <button className="fetch-reports-btn" onClick={fetchReports}>
              Fetch Reports
            </button>

            {reports.length > 0 ? (
              <ul className="new-customer-list">
                {reports.map((customer) => (
                  <li
                    className="new-customer-item"
                    key={customer.AccountNumber}
                  >
                    <div className="new-customer-details">
                      <p>
                        <strong>Account Number:</strong>{" "}
                        {customer.AccountNumber}
                      </p>
                      <p>
                        <strong>Customer Name:</strong> {customer.customerName}
                      </p>
                      <p>
                        <strong>Account Verification Status:</strong>{" "}
                        <span
                          className={
                            customer.AccountVerify === 1
                              ? "verified"
                              : "not-verified"
                          }
                        >
                          {customer.AccountVerify === 1
                            ? "Verified"
                            : "Not Verified"}
                        </span>
                      </p>
                      {customer.AccountVerify === 0 && ( // Only show the button if the account is not verified
                        <button
                          className="verify-btn"
                          onClick={() =>
                            handleAccountVerification(customer.AccountNumber)
                          }
                        >
                          Verify Account
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No new customers available</p>
            )}
          </div>
        )}

        {activeTab === "deleteReports" && (
          <div className="delete-reports">
            <h2>Search and Update The Details of the Customer</h2>

            {/* Search Input */}
            <input
              type="text"
              className="input-field"
              placeholder="Enter Name"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
            />

            {/* Search Button */}
            <button
              className="fetch-reports-btn"
              onClick={() => searchAccount(searchName)}
            >
              Search
            </button>

            {/* If account is found, display details */}
            <div className="accounts-container">
              {accountData && accountData.length > 0 ? (
                accountData.map((account) => (
                  <div key={account.AccountNumber} className="report-details">
                    <p>
                      <strong>Account Number:</strong> {account.AccountNumber}
                    </p>
                    <p>
                      <strong>Customer Name:</strong> {account.customerName}
                    </p>
                    <p>
                      <strong>Customer Address:</strong>{" "}
                      {account.customerAddress}
                    </p>
                    <p>
                      <strong>Customer City:</strong> {account.customerCity}
                    </p>
                    <p>
                      <strong>Customer Phone:</strong> {account.customerPhone}
                    </p>
                    <p>
                      <strong>Customer Email:</strong> {account.customerEmail}
                    </p>
                    <p>
                      <strong>Verification Status:</strong>{" "}
                      <span
                        className={
                          account.AccountVerify === 1
                            ? "verified"
                            : "not-verified"
                        }
                      >
                        {account.AccountVerify === 1
                          ? "Verified"
                          : "Not Verified"}
                      </span>
                    </p>

                    {/* Update Button */}
                    <button
                      className="fetch-reports-btn"
                      onClick={() => openUpdateModal(account)}
                    >
                      Update Account
                    </button>
                  </div>
                ))
              ) : (
                <p>No account data available.</p>
              )}
            </div>

            {/* Update Modal */}
            {modalVisible && (
              <div className="modal">
                <div className="modal-content">
                  <h2>Update Account</h2>
                  <form onSubmit={updateAccount}>
                    <label>
                      Customer Name:
                      <input
                        type="text"
                        value={selectedAccount.customerName}
                        onChange={(e) =>
                          setSelectedAccount({
                            ...selectedAccount,
                            customerName: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Customer Address:
                      <input
                        type="text"
                        value={selectedAccount.customerAddress}
                        onChange={(e) =>
                          setSelectedAccount({
                            ...selectedAccount,
                            customerAddress: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Customer City:
                      <input
                        my-2
                        type="text"
                        value={selectedAccount.customerCity}
                        onChange={(e) =>
                          setSelectedAccount({
                            ...selectedAccount,
                            customerCity: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Customer Phone:
                      <input
                        type="text"
                        value={selectedAccount.customerPhone}
                        onChange={(e) =>
                          setSelectedAccount({
                            ...selectedAccount,
                            customerPhone: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Customer Email:
                      <input
                        type="email"
                        value={selectedAccount.customerEmail}
                        onChange={(e) =>
                          setSelectedAccount({
                            ...selectedAccount,
                            customerEmail: e.target.value,
                          })
                        }
                      />
                    </label>
                    <button type="submit">Update</button>
                    <button type="button" onClick={closeModal}>
                      Cancel
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Manager;
