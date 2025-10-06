import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

function Navbar() {
  const [loanModalVisible, setLoanModalVisible] = useState(false);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [loanAmount, setLoanAmount] = useState("");
  const [loanDurationMonths, setloanDurationMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [historyData, setHistoryData] = useState([]);
  const navigate = useNavigate();
  const handleLoanModal = () => setLoanModalVisible(!loanModalVisible);
  const handlePdfModal = () => setPdfModalVisible(!pdfModalVisible);
  const handleHistoryModal = () => setHistoryModalVisible(!historyModalVisible);

  const token = localStorage.getItem("jwtToken");
  const headers = {
    Authorization: `Bearer ${token}`,
  };

  // Fetch account history
  const fetchHistory = async () => {
    console.log("fetchHistory function called.");
    try {
      const response = await axios.get(
        "http://localhost:8081/customer/history",
        { headers }
      );

      console.log("API response received:", response.data);

      const fetchedData = response.data.data;
      if (fetchedData && fetchedData.length > 0) {
        setHistoryData(fetchedData);
        console.log("History data set successfully:", fetchedData);

        handleHistoryModal();
      } else {
        alert("No history available for this account.");
      }
    } catch (error) {
      console.error("Error fetching history:", error);
      alert("Error fetching history. Please try again later.");
    }
  };

  // Generate bank report
  const generateBankReport = async () => {
    try {
      const token = localStorage.getItem("jwtToken");

      const headers = {
        Authorization: `Bearer ${token}`,
      };

      const response = await axios.get(
        "http://localhost:8081/customer/generateBankReport",
        {
          params: {
            startDate,
            endDate,
          },
          headers: {
            ...headers,
            "Content-Type": "application/json",
          },
          responseType: "blob",
        }
      );

      const blob = new Blob([response.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bank_report_${new Date().toISOString()}.pdf`;
      link.click();

      handlePdfModal();
    } catch (error) {
      console.error("Error generating report:", error);
      alert("Error generating the report. Please check the input data.");
    }
  };
  <button
    type="button"
    className="btn btn-primary"
    onClick={generateBankReport}
  >
    Generate PDF
  </button>;

  // Apply for Loan
  const applyForLoan = async () => {
    if (!loanAmount || !loanDurationMonths) {
      alert("Please provide both loan amount and duration.");
      return;
    }

    try {
      await axios.post(
        "http://localhost:8081/customer/applyLoan",
        { loanAmount, loanDurationMonths },
        { headers }
      );
      alert("Loan application submitted successfully!");
      handleLoanModal();
    } catch (error) {
      console.error("Error applying for loan:", error);
      alert("Error applying for the loan. Please try again later.");
    }
  };

  // Logout function
  const logout = () => {
    localStorage.removeItem("jwtToken");
    navigate("/");
  };

  return (
    <nav className="navbar navbar-expand-lg bg-body-tertiary">
      <div className="container-fluid">
        <a className="navbar-brand" href="#">
          OnlineBanking
        </a>
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbarSupportedContent"
          aria-controls="navbarSupportedContent"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="collapse navbar-collapse" id="navbarSupportedContent">
          <ul className="navbar-nav me-auto mb-2 mb-lg-0">
            <li className="nav-item">
              <a
                className="nav-link active"
                aria-current="page"
                href="#"
                onClick={handleLoanModal}
              >
                Apply for Loan
              </a>
            </li>
            <li className="nav-item">
              <a className="nav-link" href="#" onClick={generateBankReport}>
                PDF Generator
              </a>
            </li>
            <li className="nav-item">
              <a className="nav-link" href="#" onClick={fetchHistory}>
                View History
              </a>
            </li>
            <li className="nav-item dropdown">
              <a
                className="nav-link dropdown-toggle"
                href="#"
                role="button"
                data-bs-toggle="dropdown"
                aria-expanded="false"
              >
                Settings
              </a>
              <ul className="dropdown-menu">
                <li>
                  <a className="dropdown-item" href="#" onClick={logout}>
                    Log-Out
                  </a>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>

      {/* PDF Modal */}
      {pdfModalVisible && (
        <div
          className="modal fade show"
          style={{ display: "block" }}
          id="pdfModal"
          tabIndex="-1"
          aria-labelledby="pdfModalLabel"
          aria-hidden="true"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="pdfModalLabel">
                  Generate Bank Report
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  data-bs-dismiss="modal"
                  aria-label="Close"
                  onClick={handlePdfModal}
                ></button>
              </div>
              <div className="modal-body">
                <label>Start Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <label className="mt-2">End Date</label>
                <input
                  type="date"
                  className="form-control"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-bs-dismiss="modal"
                  onClick={handlePdfModal}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={generateBankReport}
                >
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Apply for Loan Modal */}
      {loanModalVisible && (
        <div
          className="modal fade show"
          style={{ display: "block" }}
          id="loanModal"
          tabIndex="-1"
          aria-labelledby="loanModalLabel"
          aria-hidden="true"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="loanModalLabel">
                  Apply for Loan
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  data-bs-dismiss="modal"
                  aria-label="Close"
                  onClick={handleLoanModal}
                ></button>
              </div>
              <div className="modal-body">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Enter the loan amount"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                />
                <input
                  type="number"
                  className="form-control mt-2"
                  placeholder="Enter the number of months"
                  value={loanDurationMonths}
                  onChange={(e) => setloanDurationMonths(e.target.value)}
                />
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-bs-dismiss="modal"
                  onClick={handleLoanModal}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={applyForLoan}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {historyModalVisible && (
        <div
          className="modal fade show"
          style={{ display: "block", backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          id="historyModal"
          tabIndex="-1"
          aria-labelledby="historyModalLabel"
          aria-hidden="true"
        >
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="historyModalLabel">
                  Account History
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  data-bs-dismiss="modal"
                  aria-label="Close"
                  onClick={handleHistoryModal}
                ></button>
              </div>
              <div className="modal-body">
                {historyData.length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Transaction ID</th>
                        <th scope="col">Account Number</th>
                        <th scope="col">Transaction Type</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Date</th>
                        <th scope="col">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyData.map((item, index) => (
                        <tr key={index}>
                          <td>{item.TransactionID}</td>
                          <td>{item.AccountNumber}</td>
                          <td>{item.TransactionType}</td>
                          <td
                            style={{
                              color:
                                item.TransactionType === "Transfer" ||
                                item.TransactionType === "Withdraw"
                                  ? "red"
                                  : item.TransactionType === "Loan Approved"
                                  ? "green"
                                  : "black",
                            }}
                          >
                            {item.TransactionType === "Transfer" ||
                            item.TransactionType === "Withdraw"
                              ? `-${item.TransactionAmount}`
                              : `+${item.TransactionAmount}`}
                          </td>
                          <td>
                            {new Date(item.TransactionDate).toLocaleString()}
                          </td>
                          <td>{item.Description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No history available for this account.</p>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-bs-dismiss="modal"
                  onClick={handleHistoryModal}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
