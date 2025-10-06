import React, { useState, useEffect } from "react";
import axios from "axios";
import "../App.css";
import Navbar from "./Navbar";

function WithdrawPage() {
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [toAccount, setToAccount] = useState("");
  const [balance, setBalance] = useState(null);
  const [loanAmount, setLoanAmount] = useState(null);
  const [withdrawHistory, setWithdrawHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isWithdrawVerified, setIsWithdrawVerified] = useState(false); // New state to verify withdrawal
  const [accountVerified, setAccountVerified] = useState(false); // New state to check account verification

  // Fetch initial data for balance, loan amount, and withdrawal history
  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await axios.get(
          "http://localhost:8081/customer/accountInfo",
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem("jwtToken")}`,
            },
          }
        );

        console.log(response.data);

        // Set balance, loan amount, and account number directly
        setBalance(response.data.balance ?? 0);
        setLoanAmount(response.data.loans ?? 0);
        setWithdrawHistory(response.data.accountNumber);

        // Directly check if account is verified or not
        const accountVerified = response.data.accountVerified ?? false;
        setAccountVerified(accountVerified); // Save the verification status to state
      } catch (error) {
        setErrorMessage(
          error.response
            ? error.response.data.error
            : "Failed to load account information."
        );
      }
    };

    // Fetch data when the component mounts
    fetchData();
  }, []); // This effect runs only once after the initial render

  const handleWithdraw = async (e) => {
    e.preventDefault();

    if (!withdrawAmount || withdrawAmount < 1) {
      setErrorMessage(
        "Please enter a valid amount greater than or equal to 1."
      );
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await axios.post(
        "http://localhost:8081/customer/withdraw",
        { withdrawAmount },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("jwtToken")}`,
          },
        }
      );

      setSuccessMessage(
        `Withdrawal successful! New balance: ₹${response.data.newBalance}`
      );
      setBalance(response.data.newBalance);
      setWithdrawHistory((prevHistory) => [
        ...prevHistory,
        response.data.withdrawAmount,
      ]);

      // Set withdrawal verification state to true after successful withdrawal
      setIsWithdrawVerified(true);
    } catch (error) {
      setErrorMessage(
        error.response
          ? error.response.data.error
          : "Failed to process withdrawal. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();

    // if (!isWithdrawVerified) {
    //   setErrorMessage("Please complete a withdrawal before making a transfer.");
    //   return;
    // }

    if (!transferAmount || transferAmount <= 0) {
      setErrorMessage("Please enter a valid transfer amount greater than 0.");
      return;
    }

    if (!toAccount) {
      setErrorMessage("Please enter the account number to transfer to.");
      return;
    }

    setErrorMessage("");
    setIsLoading(true);

    try {
      const response = await axios.post(
        "http://localhost:8081/customer/transferMoney",
        { toAccount, transferAmount },
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("jwtToken")}`,
          },
        }
      );

      setSuccessMessage(
        `Transfer successful! New balance: ₹${response.data.newBalance}`
      );
      setBalance(response.data.newBalance);
    } catch (error) {
      setErrorMessage(
        error.response
          ? error.response.data.error
          : "Failed to process transfer. Please try again later."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <Navbar /> {/* Include the Navbar component */}
      <div className="container mt-4">
        {/* Error and Success Messages */}
        {errorMessage && (
          <div className="alert alert-danger">{errorMessage}</div>
        )}
        {successMessage && (
          <div className="alert alert-success">{successMessage}</div>
        )}

        <div className="row">
          <div className="col-md-4 col-sm-12 mb-3">
            <div className="card equal-height">
              <div className="card-body">
                <h5 className="card-title">Account Number</h5>
                <ul className="list-group">
                  {withdrawHistory ? (
                    <>
                      <li className="list-group-item">
                        {withdrawHistory.toLocaleString()}{" "}
                        <span
                          className={`badge float-right ${
                            accountVerified ? "bg-success" : "bg-danger"
                          }`}
                        >
                          {accountVerified ? "Verified" : "Not Verified"}
                        </span>
                      </li>
                    </>
                  ) : (
                    "Loading..."
                  )}
                </ul>
              </div>
            </div>
          </div>

          {/* Balance Card */}
          <div className="col-md-4 col-sm-12 mb-3">
            <div className="card equal-height">
              <div className="card-body">
                <h5 className="card-title">Balance</h5>
                <p className="card-text">
                  ₹{balance ? balance.toLocaleString() : "Loading..."}
                </p>
              </div>
            </div>
          </div>

          {/* Loan Amount Card */}
          <div className="col-md-4 col-sm-12 mb-3">
            <div className="card equal-height">
              <div className="card-body">
                <h5 className="card-title">Loan Amount</h5>
                <p className="card-text">
                  ₹{loanAmount ? loanAmount.toLocaleString() : "Loading..."}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Withdraw and Transfer Forms */}
        <div className="row mt-4">
          {/* Withdrawal Form */}
          <div className="col-md-6">
            <div className="card equal-height">
              <div className="card-body">
                <h5 className="card-title">Withdraw Funds</h5>
                <form onSubmit={handleWithdraw}>
                  <div className="form-group">
                    <label htmlFor="withdrawAmount">Amount to Withdraw</label>
                    <input
                      type="number"
                      className="form-control"
                      id="withdrawAmount"
                      placeholder="Enter amount"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary mt-3"
                    disabled={isLoading}
                  >
                    {isLoading ? "Processing..." : "Withdraw"}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Transfer Form */}
          <div className="col-md-6">
            <div className="card equal-height">
              <div className="card-body">
                <h5 className="card-title">Transfer Funds</h5>
                {/* If account is not verified, disable the form and show a message */}
                {!accountVerified ? (
                  <div className="alert alert-warning">
                    Your account is not verified. You cannot transfer funds
                    until it is verified.
                  </div>
                ) : (
                  <form onSubmit={handleTransfer}>
                    <div className="form-group">
                      <label htmlFor="transferAccount">Account Number</label>
                      <input
                        type="text"
                        className="form-control"
                        id="transferAccount"
                        placeholder="Enter recipient's account number"
                        value={toAccount}
                        onChange={(e) => setToAccount(e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="transferAmount">Amount to Transfer</label>
                      <input
                        type="number"
                        className="form-control"
                        id="transferAmount"
                        placeholder="Enter amount"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                      />
                    </div>
                    <button
                      type="submit"
                      className="btn btn-primary mt-3"
                      disabled={isLoading || !accountVerified} // Disable button if not verified
                    >
                      {isLoading ? "Processing..." : "Transfer"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WithdrawPage;
