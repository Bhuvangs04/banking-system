import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import {
  HiOutlineSwitchHorizontal,
  HiOutlineCash,
  HiOutlineCreditCard,
  HiOutlineDocumentDownload,
  HiOutlineSearch,

  HiOutlineBell,
  HiOutlineMenu,
  HiOutlineCheck,
  HiOutlineTrash,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineDownload,
  HiOutlineQuestionMarkCircle,
} from "react-icons/hi";
import api from "../utlis/api";
import Navbar from "./Navbar";
import "../App.css";

function Home() {
  // ── State ──────────────────────────────────────────────────
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Transfer state
  const [transferData, setTransferData] = useState({ toAccount: "", amount: "", pin: "", description: "" });
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [newBeneficiary, setNewBeneficiary] = useState({ account: "", nickname: "", pin: "" });
  const [showAddBeneficiary, setShowAddBeneficiary] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [transferPin, setTransferPin] = useState("");

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");

  // Loan state
  const [loanData, setLoanData] = useState({ amount: "", duration: "" });
  const [loanCalc, setLoanCalc] = useState(null);
  const [myLoans, setMyLoans] = useState([]);

  // History state
  const [history, setHistory] = useState([]);
  const [historyPagination, setHistoryPagination] = useState({ page: 1, total: 0, totalPages: 0 });
  const [historyFilter, setHistoryFilter] = useState({ type: "", startDate: "", endDate: "" });

  // Notifications state
  const [notifications, setNotifications] = useState([]);

  // Profile edit state
  const [profileEdit, setProfileEdit] = useState({ customerAddress: "", customerCity: "", customerPhone: "" });
  const [passwordData, setPasswordData] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pinData, setPinData] = useState({ pin: "", password: "" });

  // Report state
  const [reportDates, setReportDates] = useState({ startDate: "", endDate: "" });

  // Support state
  const [tickets, setTickets] = useState([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");

  // Dispute state
  const [disputes, setDisputes] = useState([]);
  const [disputeReason, setDisputeReason] = useState("");
  const [selectedTxForDispute, setSelectedTxForDispute] = useState(null);
  const [isFraudDispute, setIsFraudDispute] = useState(false);

  // QR Scanning mock state
  const [isScanningQR, setIsScanningQR] = useState(false);

  // Loan Repayment state
  const [repayAmount, setRepayAmount] = useState("");
  const [repayLoanId, setRepayLoanId] = useState(null);

  // Processing flags
  const [processing, setProcessing] = useState(false);

  // ── Data Fetching ─────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const [profileRes, infoRes] = await Promise.all([
        api.get("/customer/profile"),
        api.get("/customer/accountInfo"),
      ]);
      setProfile(profileRes.data.profile);
      setAccountInfo(infoRes.data);
      setProfileEdit({
        customerAddress: profileRes.data.profile.customerAddress || "",
        customerCity: profileRes.data.profile.customerCity || "",
        customerPhone: profileRes.data.profile.customerPhone || "",
      });
    } catch (err) {
      toast.error("Failed to load account data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Fetch data when view changes
  useEffect(() => {
    if (activeView === "transfer") fetchBeneficiaries();
    if (activeView === "loans") fetchLoans();
    if (activeView === "history") fetchHistory(1);
    if (activeView === "notifications") fetchNotifications();
    if (activeView === "support") fetchTickets();
    if (activeView === "disputes") fetchDisputes();
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBeneficiaries = async () => {
    try {
      const res = await api.get("/customer/beneficiaries");
      setBeneficiaries(res.data.beneficiaries || []);
    } catch { /* ignore */ }
  };

  const fetchLoans = async () => {
    try {
      const res = await api.get("/customer/loanStatus");
      setMyLoans(res.data.loans || []);
    } catch { /* ignore */ }
  };

  const fetchHistory = async (page = 1) => {
    try {
      const params = { page, limit: 15 };
      if (historyFilter.type) params.type = historyFilter.type;
      if (historyFilter.startDate && historyFilter.endDate) {
        params.startDate = historyFilter.startDate;
        params.endDate = historyFilter.endDate;
      }
      const res = await api.get("/customer/history", { params });
      setHistory(res.data.data || []);
      setHistoryPagination(res.data.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch { /* ignore */ }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/customer/notifications");
      setNotifications(res.data.notifications || []);
    } catch { /* ignore */ }
  };

  const fetchTickets = async () => {
    try {
      const res = await api.get("/customer/support/tickets");
      setTickets(res.data.tickets || []);
    } catch { /* ignore */ }
  };

  const fetchDisputes = async () => {
    try {
      const res = await api.get("/customer/disputes");
      setDisputes(res.data.disputes || []);
    } catch { /* ignore */ }
  };

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!ticketSubject || !ticketMessage) {
      toast.error("Subject and message are required.");
      return;
    }
    setProcessing(true);
    try {
      await api.post("/customer/support/tickets", { subject: ticketSubject, message: ticketMessage });
      toast.success("Support ticket created!");
      setTicketSubject("");
      setTicketMessage("");
      fetchTickets();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to create support ticket.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateDispute = async (e) => {
    e.preventDefault();
    if (!selectedTxForDispute || !disputeReason) {
      toast.error("Please select a transaction and provide a reason.");
      return;
    }
    setProcessing(true);
    try {
      const res = await api.post("/customer/disputes", {
        transactionId: selectedTxForDispute.TransactionID,
        reason: disputeReason,
        isFraud: isFraudDispute
      });
      toast.success(res.data.message || "Dispute filed successfully!");
      setDisputeReason("");
      setSelectedTxForDispute(null);
      setIsFraudDispute(false);
      fetchDisputes();
      setActiveView("disputes");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to file dispute.");
    } finally {
      setProcessing(false);
    }
  };

  const handleRepayLoan = async (e) => {
    e.preventDefault();
    const amount = parseFloat(repayAmount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid repayment amount.");
      return;
    }
    setProcessing(true);
    try {
      const res = await api.post(`/customer/loans/${repayLoanId}/repay`, { amount });
      toast.success(res.data.message || "Repayment processed successfully!");
      setRepayAmount("");
      setRepayLoanId(null);
      fetchLoans();
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Repayment failed.");
    } finally {
      setProcessing(false);
    }
  };

  const mockQRAccounts = [
    { name: "Aarav Sharma", accountNumber: "100234567890", bank: "SecureBank" },
    { name: "Priya Patel", accountNumber: "100345678901", bank: "SecureBank" },
    { name: "Rohan Das", accountNumber: "100456789012", bank: "SecureBank" }
  ];

  // ── Formatters ────────────────────────────────────────────
  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return "₹0.00";
    return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (d) => new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const renderStatusBadge = (status) => {
    const s = status || "SUCCESS";
    let badgeClass = "badge-success";
    if (s === "UNDER_REVIEW") badgeClass = "badge-warning";
    else if (s === "FROZEN") badgeClass = "badge-info";
    else if (s === "FAILED") badgeClass = "badge-error";
    else if (s === "PENDING") badgeClass = "badge-secondary";
    else if (s === "REFUNDED" || s === "CHARGEBACK") badgeClass = "badge-success";
    
    const styleMap = {
      UNDER_REVIEW: { background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24", border: "1px solid rgba(245, 158, 11, 0.3)" },
      FROZEN: { background: "rgba(6, 182, 212, 0.15)", color: "#22d3ee", border: "1px solid rgba(6, 182, 212, 0.3)" },
      REFUNDED: { background: "rgba(16, 185, 129, 0.15)", color: "#34d399", border: "1px solid rgba(16, 185, 129, 0.3)" },
      CHARGEBACK: { background: "rgba(239, 68, 68, 0.15)", color: "#f87171", border: "1px solid rgba(239, 68, 68, 0.3)" },
      SUCCESS: { background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }
    };
    
    const style = styleMap[s] || {};
    return (
      <span className={`badge ${badgeClass}`} style={style}>
        {s.replace("_", " ")}
      </span>
    );
  };

  const getViewTitle = () => {
    const titles = { dashboard: "Dashboard", transfer: "Transfer Money", withdraw: "Withdraw", loans: "Loans", history: "Transaction History", reports: "Account Statements", profile: "Profile", notifications: "Notifications", support: "Help & Support Center", disputes: "Disputes Center" };
    return titles[activeView] || "Dashboard";
  };

  // ── Actions ───────────────────────────────────────────────
  const handleTransfer = async (e) => {
    e.preventDefault();
    const amount = parseFloat(transferData.amount);
    if (!transferData.toAccount || !amount || amount <= 0) {
      toast.error("Please enter valid transfer details.");
      return;
    }
    setProcessing(true);
    try {
      // Step 1: Request OTP
      const res = await api.post("/customer/transfer/request-otp", {
        toAccount: transferData.toAccount,
        transferAmount: transferData.amount,
      });
      toast.success(res.data.message || "Verification code sent!");
      // Open OTP Modal
      setOtpCode("");
      setTransferPin("");
      setShowOtpModal(true);
    } catch (err) {
      toast.error(err.response?.data?.error || "Transfer request failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmTransfer = async (e) => {
    e.preventDefault();
    if (!otpCode || otpCode.length !== 6) {
      toast.error("Please enter a valid 6-digit verification code.");
      return;
    }
    if (!transferPin || transferPin.length !== 4) {
      toast.error("Please enter your 4-digit transaction PIN.");
      return;
    }
    setProcessing(true);
    try {
      // Step 2: Verify & Transfer
      const res = await api.post("/customer/transferMoney", {
        toAccount: transferData.toAccount,
        transferAmount: transferData.amount,
        pin: transferPin,
        otp: otpCode,
        description: transferData.description || undefined,
      });
      toast.success(res.data.message || "Transfer successful!");
      setTransferData({ toAccount: "", amount: "", pin: "", description: "" });
      setShowOtpModal(false);
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Transfer failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    setProcessing(true);
    try {
      const res = await api.post("/customer/withdraw", { withdrawAmount });
      toast.success(`Withdrawal successful! New balance: ${formatCurrency(res.data.newBalance)}`);
      setWithdrawAmount("");
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Withdrawal failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleApplyLoan = async (e) => {
    e.preventDefault();
    if (!loanData.amount || !loanData.duration) {
      toast.error("Please enter loan amount and duration.");
      return;
    }
    setProcessing(true);
    try {
      const res = await api.post("/customer/applyloan", {
        loanAmount: loanData.amount,
        loanDurationMonths: loanData.duration,
      });
      toast.success(res.data.message || "Loan application submitted!");
      setLoanData({ amount: "", duration: "" });
      setLoanCalc(null);
      fetchLoans();
    } catch (err) {
      toast.error(err.response?.data?.error || "Loan application failed.");
    } finally {
      setProcessing(false);
    }
  };

  const calculateEMI = async () => {
    if (!loanData.amount || !loanData.duration) return;
    try {
      const rate = accountInfo?.loanRates
        ? (profile?.AccountType === "Savings" ? accountInfo.loanRates.Savings : accountInfo.loanRates.Current)
        : (profile?.AccountType === "Savings" ? 5 : 6);
      const res = await api.get("/customer/loanCalculator", {
        params: { amount: loanData.amount, rate, duration: loanData.duration },
      });
      setLoanCalc(res.data);
    } catch { /* ignore */ }
  };

  const handleAddBeneficiary = async () => {
    if (!newBeneficiary.account) {
      toast.error("Enter beneficiary account number.");
      return;
    }
    if (!newBeneficiary.pin) {
      toast.error("Enter transaction PIN.");
      return;
    }
    try {
      await api.post("/customer/beneficiaries", {
        beneficiaryAccount: newBeneficiary.account,
        nickname: newBeneficiary.nickname || undefined,
        pin: newBeneficiary.pin,
      });
      toast.success("Beneficiary added!");
      setNewBeneficiary({ account: "", nickname: "", pin: "" });
      setShowAddBeneficiary(false);
      fetchBeneficiaries();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to add beneficiary.");
    }
  };

  const handleRemoveBeneficiary = async (id) => {
    try {
      await api.delete(`/customer/beneficiaries/${id}`);
      toast.success("Beneficiary removed.");
      fetchBeneficiaries();
    } catch { toast.error("Failed to remove beneficiary."); }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setProcessing(true);
    try {
      await api.put("/customer/profile", profileEdit);
      toast.success("Profile updated successfully!");
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update profile.");
    } finally {
      setProcessing(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error("New passwords don't match.");
      return;
    }
    setProcessing(true);
    try {
      await api.put("/customer/changePassword", {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success("Password changed successfully!");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to change password.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSetPin = async (e) => {
    e.preventDefault();
    if (!/^\d{4}$/.test(pinData.pin)) {
      toast.error("PIN must be exactly 4 digits.");
      return;
    }
    setProcessing(true);
    try {
      await api.post("/customer/setTransactionPin", { pin: pinData.pin, password: pinData.password });
      toast.success("Transaction PIN set successfully!");
      setPinData({ pin: "", password: "" });
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to set PIN.");
    } finally {
      setProcessing(false);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.put("/customer/notifications/read");
      toast.success("All notifications marked as read.");
      fetchNotifications();
      fetchDashboard();
    } catch { /* ignore */ }
  };

  const handleDownloadReport = async () => {
    try {
      const params = {};
      if (reportDates.startDate && reportDates.endDate) {
        params.startDate = reportDates.startDate;
        params.endDate = reportDates.endDate;
      }
      const res = await api.get("/customer/generateBankReport", { params, responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `bank_report_${new Date().toISOString().split("T")[0]}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success("Report downloaded!");
    } catch {
      toast.error("Failed to generate report.");
    }
  };

  // ── Render Helpers ────────────────────────────────────────
  const getTxnIcon = (type) => {
    const isCredit = ["Deposit", "Receive", "Loan Approved"].includes(type);
    return (
      <div className={`txn-icon ${isCredit ? "credit" : "debit"}`}>
        {isCredit ? <HiOutlineArrowDown /> : <HiOutlineArrowUp />}
      </div>
    );
  };

  // ── Views ─────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="animate-fade-in">
      {/* Stat cards */}
      <div className="grid grid-4" style={{ marginBottom: "32px" }}>
        <div className="stat-card stagger-1 animate-fade-in">
          <div className="stat-card-icon blue">₹</div>
          <div className="stat-card-label">Current Balance</div>
          <div className="stat-card-value">{formatCurrency(accountInfo?.balance)}</div>
        </div>

        <div className="stat-card stagger-2 animate-fade-in">
          <div className="stat-card-icon green">
            <HiOutlineCheck />
          </div>
          <div className="stat-card-label">Account Status</div>
          <div className="stat-card-value" style={{ fontSize: "20px" }}>
            <span className={`badge ${accountInfo?.accountVerified ? "badge-success" : "badge-warning"}`}>
              {accountInfo?.accountVerified ? "Verified" : "Pending Verification"}
            </span>
          </div>
        </div>

        <div className="stat-card stagger-3 animate-fade-in">
          <div className="stat-card-icon yellow">
            <HiOutlineCreditCard />
          </div>
          <div className="stat-card-label">Active Loans</div>
          <div className="stat-card-value">{formatCurrency(accountInfo?.loans)}</div>
          {accountInfo?.pendingLoans > 0 && (
            <div className="stat-card-change" style={{ color: "var(--warning)" }}>
              {accountInfo.pendingLoans} pending
            </div>
          )}
        </div>

        <div className="stat-card stagger-4 animate-fade-in">
          <div className="stat-card-icon red">
            <HiOutlineBell />
          </div>
          <div className="stat-card-label">Notifications</div>
          <div className="stat-card-value">{accountInfo?.unreadNotifications || 0}</div>
          <div className="stat-card-change" style={{ color: "var(--text-muted)" }}>unread</div>
        </div>
      </div>

      {/* Quick actions & QR Code */}
      <div className="grid grid-2" style={{ marginBottom: "32px", alignItems: "stretch" }}>
        <div className="form-card" style={{ marginBottom: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          <h3 className="form-card-title" style={{ marginBottom: "20px" }}>Quick Actions</h3>
          <div className="quick-actions" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", width: "100%" }}>
            <button className="quick-action-btn" onClick={() => setActiveView("transfer")} style={{ margin: 0, height: "80px" }}>
              <span className="quick-action-icon"><HiOutlineSwitchHorizontal /></span>
              <span className="quick-action-label">Transfer</span>
            </button>
            <button className="quick-action-btn" onClick={() => setActiveView("withdraw")} style={{ margin: 0, height: "80px" }}>
              <span className="quick-action-icon"><HiOutlineCash /></span>
              <span className="quick-action-label">Withdraw</span>
            </button>
            <button className="quick-action-btn" onClick={() => setActiveView("loans")} style={{ margin: 0, height: "80px" }}>
              <span className="quick-action-icon"><HiOutlineCreditCard /></span>
              <span className="quick-action-label">Apply Loan</span>
            </button>
            <button className="quick-action-btn" onClick={() => setActiveView("reports")} style={{ margin: 0, height: "80px" }}>
              <span className="quick-action-icon"><HiOutlineDocumentDownload /></span>
              <span className="quick-action-label">Statement</span>
            </button>
          </div>
        </div>

        <div className="form-card" style={{ marginBottom: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px", height: "100%" }}>
          <h3 className="form-card-title" style={{ marginBottom: "16px", width: "100%", textAlign: "center" }}>Your Scan & Pay QR</h3>
          <div style={{ background: "white", padding: "10px", borderRadius: "12px", display: "inline-flex", justifyContent: "center", alignItems: "center", boxShadow: "0 8px 32px 0 rgba(31, 38, 135, 0.2)" }}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(JSON.stringify({ accountNumber: profile?.AccountNumber, name: profile?.customerName }))}`}
              alt="My QR Code"
              style={{ width: "120px", height: "120px", display: "block" }}
            />
          </div>
          <div style={{ marginTop: "12px", textAlign: "center" }}>
            <div style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: "14px" }}>{profile?.customerName}</div>
            <div style={{ color: "var(--text-muted)", fontSize: "12px", marginTop: "2px" }}>A/C: {profile?.AccountNumber}</div>
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Recent Transactions</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setActiveView("history")}>
            View All →
          </button>
        </div>
        {accountInfo?.recentTransactions?.length > 0 ? (
          <div style={{ padding: "8px 24px" }}>
            {accountInfo.recentTransactions.map((txn, i) => (
              <div className="txn-item" key={i}>
                {getTxnIcon(txn.TransactionType)}
                <div className="txn-info">
                  <div className="txn-title">{txn.TransactionType}</div>
                  <div className="txn-desc">{txn.Description || "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className={`txn-amount ${["Deposit", "Receive", "Loan Approved"].includes(txn.TransactionType) ? "credit" : "debit"}`}>
                    {["Deposit", "Receive", "Loan Approved"].includes(txn.TransactionType) ? "+" : "-"}
                    {formatCurrency(txn.TransactionAmount)}
                  </div>
                  <div className="txn-date">{formatDate(txn.TransactionDate)}</div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No transactions yet</div>
            <div className="empty-state-text">Your recent transactions will appear here.</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderTransfer = () => (
    <div className="animate-fade-in">
      <style>{`
        @keyframes scan-animation {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }
      `}</style>
      <div className="grid grid-2">
        {/* Transfer form */}
        <div className="form-card">
          <h3 className="form-card-title">
            <HiOutlineSwitchHorizontal /> Send Money
          </h3>
          {!accountInfo?.accountVerified && (
            <div className="auth-error" style={{ marginBottom: "16px" }}>
              ⚠️ Account not verified. Transfers are disabled until admin verification.
            </div>
          )}
          
          {!isScanningQR ? (
            <form onSubmit={handleTransfer}>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Recipient Account</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter 12-digit account number"
                  value={transferData.toAccount}
                  onChange={(e) => setTransferData((p) => ({ ...p, toAccount: e.target.value }))}
                  disabled={!accountInfo?.accountVerified}
                />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Amount (₹)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="Enter amount"
                  value={transferData.amount}
                  onChange={(e) => setTransferData((p) => ({ ...p, amount: e.target.value }))}
                  disabled={!accountInfo?.accountVerified}
                  min="1"
                />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Description (optional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Payment for..."
                  value={transferData.description}
                  onChange={(e) => setTransferData((p) => ({ ...p, description: e.target.value }))}
                  disabled={!accountInfo?.accountVerified}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={processing || !accountInfo?.accountVerified}
                style={{ marginBottom: "12px" }}
              >
                {processing ? "Processing..." : "Transfer Money"}
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-block"
                style={{ border: "1px dashed var(--border)" }}
                onClick={() => setIsScanningQR(true)}
                disabled={!accountInfo?.accountVerified}
              >
                📷 Scan Recipient QR Code
              </button>
            </form>
          ) : (
            <div style={{ padding: "12px 0", textAlign: "center" }}>
              <h4 style={{ fontSize: "14px", fontWeight: 600, marginBottom: "16px" }}>QR Code Scanner Simulation</h4>
              
              <div style={{
                position: "relative",
                width: "100%",
                height: "200px",
                background: "#080f1a",
                borderRadius: "12px",
                border: "2px solid var(--border)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px"
              }}>
                <div style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  height: "3px",
                  background: "linear-gradient(90deg, transparent, #06b6d4, transparent)",
                  boxShadow: "0 0 10px #06b6d4",
                  animation: "scan-animation 2s infinite linear"
                }} />
                <div style={{ color: "var(--text-muted)", fontSize: "12px", zIndex: 2 }}>
                  Align QR Code inside the frame
                </div>
                <div style={{ fontSize: "30px", marginTop: "10px" }}>
                  📷
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "16px", textAlign: "left" }}>
                <label>Select a mock profile to scan</label>
                <select
                  className="form-select"
                  onChange={(e) => {
                    if (e.target.value) {
                      const account = mockQRAccounts[parseInt(e.target.value)];
                      toast.success(`Scanned QR of ${account.name}!`);
                      setTransferData((prev) => ({ ...prev, toAccount: account.accountNumber }));
                      setIsScanningQR(false);
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select Mock Profile...</option>
                  {mockQRAccounts.map((acc, index) => (
                    <option key={index} value={index}>
                      {acc.name} - A/C: {acc.accountNumber} ({acc.bank})
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => setIsScanningQR(false)}
              >
                Cancel Scan
              </button>
            </div>
          )}
        </div>

        {/* Beneficiaries */}
        <div className="form-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 className="form-card-title" style={{ marginBottom: 0 }}>Saved Beneficiaries</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAddBeneficiary(!showAddBeneficiary)}>
              <HiOutlinePlus /> Add
            </button>
          </div>

          {showAddBeneficiary && (
            <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", marginBottom: "16px" }}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Account number"
                  value={newBeneficiary.account}
                  onChange={(e) => setNewBeneficiary((p) => ({ ...p, account: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Nickname (optional)"
                  value={newBeneficiary.nickname}
                  onChange={(e) => setNewBeneficiary((p) => ({ ...p, nickname: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <input
                  type="password"
                  maxLength={4}
                  className="form-input"
                  placeholder="Transaction PIN"
                  value={newBeneficiary.pin}
                  onChange={(e) => setNewBeneficiary((p) => ({ ...p, pin: e.target.value }))}
                />
              </div>
              <button className="btn btn-success btn-sm btn-block" onClick={handleAddBeneficiary}>
                Save Beneficiary
              </button>
            </div>
          )}

          {beneficiaries.length > 0 ? (
            beneficiaries.map((b) => (
              <div key={b.BeneficiaryID} className="txn-item" style={{ cursor: "pointer" }}
                onClick={() => setTransferData((p) => ({ ...p, toAccount: b.BeneficiaryAccount }))}>
                <div className="sidebar-avatar" style={{ width: 36, height: 36, fontSize: 14 }}>
                  {b.BeneficiaryName?.[0]?.toUpperCase() || "?"}
                </div>
                <div className="txn-info">
                  <div className="txn-title">{b.Nickname || b.BeneficiaryName}</div>
                  <div className="txn-desc">{b.BeneficiaryAccount}</div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); handleRemoveBeneficiary(b.BeneficiaryID); }}>
                  <HiOutlineTrash />
                </button>
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: "30px" }}>
              <div className="empty-state-text">No beneficiaries saved yet</div>
            </div>
          )}
        </div>
      </div>

      {showOtpModal && (
        <div className="modal-overlay" style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div className="form-card" style={{ maxWidth: "450px", width: "90%", zIndex: 1001, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
            <h3 className="form-card-title" style={{ display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "18px" }}>
              🔐 Security Verification
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "16px" }}>
              We sent a 6-digit OTP to your notifications. Enter it along with your 4-digit Transaction PIN to complete the transfer of <strong>{formatCurrency(transferData.amount)}</strong> to A/C <strong>{transferData.toAccount}</strong>.
            </p>
            
            <form onSubmit={handleConfirmTransfer}>
              <div className="form-group" style={{ marginBottom: "16px", textAlign: "left" }}>
                <label>6-Digit Verification Code (OTP)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Enter 6-digit OTP"
                  maxLength="6"
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                />
              </div>
              
              <div className="form-group" style={{ marginBottom: "16px", textAlign: "left" }}>
                <label>4-Digit Transaction PIN</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="Enter 4-digit PIN"
                  maxLength="4"
                  required
                  value={transferPin}
                  onChange={(e) => setTransferPin(e.target.value)}
                />
              </div>
              
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={processing}>
                  {processing ? "Verifying..." : "Confirm Transfer"}
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowOtpModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  const renderWithdraw = () => (
    <div className="animate-fade-in" style={{ maxWidth: "500px" }}>
      <div className="form-card">
        <h3 className="form-card-title"><HiOutlineCash /> Withdraw Funds</h3>
        <div className="amount-display">
          <span>₹ </span>
          {withdrawAmount || "0"}
        </div>
        <form onSubmit={handleWithdraw}>
          <div className="form-group" style={{ marginBottom: "16px" }}>
            <label>Amount to Withdraw</label>
            <input
              type="number"
              className="form-input"
              placeholder="Enter amount"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              min="1"
            />
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
            Available balance: {formatCurrency(accountInfo?.balance)}. Minimum balance of ₹500 must be maintained.
          </p>
          <button type="submit" className="btn btn-primary btn-block" disabled={processing}>
            {processing ? "Processing..." : "Withdraw"}
          </button>
        </form>
      </div>
    </div>
  );

  const renderLoans = () => (
    <div className="animate-fade-in">
      <div className="grid grid-2">
        {/* Apply for loan */}
        <div className="form-card">
          <h3 className="form-card-title"><HiOutlineCreditCard /> Apply for Loan</h3>
          {!accountInfo?.accountVerified && (
            <div className="auth-error" style={{ marginBottom: "16px" }}>
              ⚠️ Account must be verified to apply for loans.
            </div>
          )}
          <form onSubmit={handleApplyLoan}>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label>Loan Amount (₹)</label>
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{formatCurrency(loanData.amount || 0)}</span>
              </div>
              <input
                type="range"
                className="form-input"
                value={loanData.amount || 0}
                onChange={(e) => {
                  setLoanData((p) => ({ ...p, amount: e.target.value }));
                  if (loanData.duration) calculateEMI();
                }}
                disabled={!accountInfo?.accountVerified}
                min="10000"
                max="10000000"
                step="10000"
                style={{ cursor: "pointer", accentColor: "var(--primary)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>₹10,000</span>
                <span>₹1,00,00,000</span>
              </div>
            </div>
            
            <div className="form-group" style={{ marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                <label>Tenure (Months)</label>
                <span style={{ fontWeight: 600, color: "var(--primary)" }}>{loanData.duration || 0} Months</span>
              </div>
              <input
                type="range"
                className="form-input"
                value={loanData.duration || 0}
                onChange={(e) => {
                  setLoanData((p) => ({ ...p, duration: e.target.value }));
                  if (loanData.amount) calculateEMI();
                }}
                disabled={!accountInfo?.accountVerified}
                min="6"
                max="360"
                step="6"
                style={{ cursor: "pointer", accentColor: "var(--primary)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "var(--text-muted)" }}>
                <span>6mo</span>
                <span>360mo</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <button type="submit" className="btn btn-primary btn-block"
                disabled={processing || !accountInfo?.accountVerified || !loanData.amount || !loanData.duration}>
                {processing ? "Submitting..." : "Apply Now"}
              </button>
            </div>
          </form>

          {loanCalc && (
            <div style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)" }}>
              <div className="loan-card-details">
                <div className="loan-detail-item">
                  <div className="loan-detail-label">Monthly EMI</div>
                  <div className="loan-detail-value">{formatCurrency(loanCalc.monthlyEMI)}</div>
                </div>
                <div className="loan-detail-item">
                  <div className="loan-detail-label">Total Payable</div>
                  <div className="loan-detail-value">{formatCurrency(loanCalc.totalPayable)}</div>
                </div>
                <div className="loan-detail-item">
                  <div className="loan-detail-label">Total Interest</div>
                  <div className="loan-detail-value">{formatCurrency(loanCalc.totalInterest)}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loan status */}
        <div className="form-card">
          <h3 className="form-card-title">My Loan Applications</h3>
          {myLoans.length > 0 ? (
            myLoans.map((loan) => (
              <div className="loan-card" key={loan.LoanID}>
                <div className="loan-card-header">
                  <div className="loan-card-amount">{formatCurrency(loan.LoanAmount)}</div>
                  <span className={`badge ${loan.ApprovalStatus === "Approved" ? "badge-success" : loan.ApprovalStatus === "Denied" ? "badge-error" : "badge-warning"}`}>
                    {loan.ApprovalStatus}
                  </span>
                </div>
                <div className="loan-card-details">
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">Duration</div>
                    <div className="loan-detail-value">{loan.LoanDurationMonths}mo</div>
                  </div>
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">Interest</div>
                    <div className="loan-detail-value">{loan.LoanInterest}%</div>
                  </div>
                  <div className="loan-detail-item">
                    <div className="loan-detail-label">EMI</div>
                    <div className="loan-detail-value">{formatCurrency(loan.MonthlyEMI)}</div>
                  </div>
                </div>
                {loan.Remarks && (
                  <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "12px", marginBottom: "8px" }}>
                    Remarks: {loan.Remarks}
                  </p>
                )}

                {loan.ApprovalStatus === "Approved" && (
                  <div style={{ marginTop: "16px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                      <span>Repayment Progress</span>
                      <span>{loan.TotalPayableAmount > 0 ? ((loan.AmountRepaid / (loan.TotalPayableAmount + (loan.LateFee || 0))) * 100).toFixed(0) : 0}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div style={{ height: "6px", background: "var(--border)", borderRadius: "3px", overflow: "hidden", marginBottom: "12px" }}>
                      <div style={{
                        width: `${Math.min(100, loan.TotalPayableAmount > 0 ? (loan.AmountRepaid / (loan.TotalPayableAmount + (loan.LateFee || 0))) * 100 : 0)}%`,
                        height: "100%",
                        background: "var(--success)",
                        borderRadius: "3px"
                      }} />
                    </div>

                    <div className="loan-card-details" style={{ gridTemplateColumns: "repeat(2, 1fr)", gap: "8px 16px", marginBottom: "16px" }}>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Repaid</div>
                        <div className="loan-detail-value" style={{ color: "var(--success)" }}>{formatCurrency(loan.AmountRepaid)}</div>
                      </div>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Late Fee</div>
                        <div className="loan-detail-value" style={{ color: loan.LateFee > 0 ? "var(--error)" : "var(--text-primary)" }}>{formatCurrency(loan.LateFee)}</div>
                      </div>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Outstanding</div>
                        <div className="loan-detail-value">{formatCurrency(loan.TotalPayableAmount + (loan.LateFee || 0) - loan.AmountRepaid)}</div>
                      </div>
                      <div className="loan-detail-item">
                        <div className="loan-detail-label">Repayment Status</div>
                        <span className={`badge ${loan.RepaymentStatus === 'Paid' ? 'badge-success' : loan.RepaymentStatus === 'Overdue' ? 'badge-error' : 'badge-info'}`} style={{ width: "fit-content", padding: "2px 6px", fontSize: "10px" }}>
                          {loan.RepaymentStatus}
                        </span>
                      </div>
                      {loan.NextRepaymentDueDate && (
                        <div className="loan-detail-item" style={{ gridColumn: "span 2" }}>
                          <div className="loan-detail-label">Next EMI Due</div>
                          <div className="loan-detail-value" style={{ fontSize: "12px" }}>{formatDate(loan.NextRepaymentDueDate)}</div>
                        </div>
                      )}
                    </div>

                    {loan.RepaymentStatus !== "Paid" && (
                      <div>
                        {repayLoanId === loan.LoanID ? (
                          <form onSubmit={handleRepayLoan} style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                            <input
                              type="number"
                              className="form-input"
                              placeholder="Amount"
                              value={repayAmount}
                              onChange={(e) => setRepayAmount(e.target.value)}
                              style={{ padding: "6px 12px", height: "36px", fontSize: "13px" }}
                              required
                              min="1"
                            />
                            <button type="submit" className="btn btn-success" style={{ height: "36px", padding: "0 16px" }} disabled={processing}>
                              Pay
                            </button>
                            <button type="button" className="btn btn-secondary" style={{ height: "36px", padding: "0 12px" }} onClick={() => { setRepayLoanId(null); setRepayAmount(""); }}>
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button className="btn btn-primary btn-sm btn-block" onClick={() => { setRepayLoanId(loan.LoanID); setRepayAmount(loan.MonthlyEMI); }}>
                              💸 Pay EMI (₹{loan.MonthlyEMI})
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => { setRepayLoanId(loan.LoanID); setRepayAmount((loan.TotalPayableAmount + (loan.LateFee || 0) - loan.AmountRepaid).toFixed(2)); }}>
                              Full Payoff
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="empty-state" style={{ padding: "40px" }}>
              <div className="empty-state-icon">📄</div>
              <div className="empty-state-title">No loan applications</div>
              <div className="empty-state-text">Apply for a loan to get started.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderHistory = () => (
    <div className="animate-fade-in">
      <div className="table-container">
        <div className="table-header" style={{ flexWrap: "wrap", gap: "12px" }}>
          <span className="table-title">Transaction History</span>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <select className="form-select" style={{ width: "auto", padding: "8px 12px", fontSize: "13px" }}
              value={historyFilter.type}
              onChange={(e) => setHistoryFilter((p) => ({ ...p, type: e.target.value }))}>
              <option value="">All Types</option>
              <option value="Deposit">Deposit</option>
              <option value="Withdrawal">Withdrawal</option>
              <option value="Transfer">Transfer</option>
              <option value="Receive">Receive</option>
              <option value="Loan Approved">Loan Approved</option>
            </select>
            <input type="date" className="form-input" style={{ width: "auto", padding: "8px 12px", fontSize: "13px" }}
              value={historyFilter.startDate}
              onChange={(e) => setHistoryFilter((p) => ({ ...p, startDate: e.target.value }))} />
            <input type="date" className="form-input" style={{ width: "auto", padding: "8px 12px", fontSize: "13px" }}
              value={historyFilter.endDate}
              onChange={(e) => setHistoryFilter((p) => ({ ...p, endDate: e.target.value }))} />
            <button className="btn btn-primary btn-sm" onClick={() => fetchHistory(1)}>
              <HiOutlineSearch /> Filter
            </button>
          </div>
        </div>

        {history.length > 0 ? (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Balance After</th>
                  <th>Description</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((txn, i) => {
                  const isCredit = ["Deposit", "Receive", "Loan Approved"].includes(txn.TransactionType);
                  return (
                    <tr key={i}>
                      <td><span className={`badge ${isCredit ? "badge-success" : "badge-error"}`}>{txn.TransactionType}</span></td>
                      <td style={{ fontWeight: 600, color: isCredit ? "var(--success)" : "var(--error)" }}>
                        {isCredit ? "+" : "-"}{formatCurrency(txn.TransactionAmount)}
                      </td>
                      <td>{txn.BalanceAfter ? formatCurrency(txn.BalanceAfter) : "—"}</td>
                      <td style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {txn.Description || "—"}
                      </td>
                      <td>{formatDate(txn.TransactionDate)}</td>
                      <td>{renderStatusBadge(txn.TransactionStatus)}</td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: "var(--error)", padding: "4px 8px", fontSize: "11px" }}
                          onClick={() => {
                            setSelectedTxForDispute(txn);
                            setDisputeReason("");
                            setIsFraudDispute(false);
                          }}
                        >
                          Dispute
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {selectedTxForDispute && (
              <div className="modal-overlay" style={{
                position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                background: "rgba(0,0,0,0.7)", zIndex: 1000,
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                <div className="form-card" style={{ maxWidth: "450px", width: "90%", zIndex: 1001, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)" }}>
                  <h3 className="form-card-title" style={{ color: "var(--error)", display: "flex", alignItems: "center", gap: "8px", margin: 0, fontSize: "18px" }}>
                    ⚠️ Dispute Transaction
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "8px", marginBottom: "16px" }}>
                    You are raising a formal dispute claim for this transaction. Please provide a clear reason (e.g. fraudulent activity or incorrect amount).
                  </p>
                  
                  <div style={{ padding: "12px", background: "var(--bg-secondary)", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", textAlign: "left" }}>
                    <div><strong>Type:</strong> {selectedTxForDispute.TransactionType}</div>
                    <div style={{ marginTop: "4px" }}><strong>Amount:</strong> {formatCurrency(selectedTxForDispute.TransactionAmount)}</div>
                    <div style={{ marginTop: "4px" }}><strong>Date:</strong> {formatDate(selectedTxForDispute.TransactionDate)}</div>
                    <div style={{ marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <strong>Desc:</strong> {selectedTxForDispute.Description}
                    </div>
                  </div>

                  <form onSubmit={handleCreateDispute}>
                    <div className="form-group" style={{ marginBottom: "16px", textAlign: "left" }}>
                      <label>Dispute Reason</label>
                      <textarea
                        className="form-input"
                        placeholder="Describe why you are disputing this transaction..."
                        value={disputeReason}
                        onChange={(e) => setDisputeReason(e.target.value)}
                        style={{ minHeight: "100px", padding: "10px", resize: "none" }}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type="checkbox"
                        id="isFraudDispute"
                        checked={isFraudDispute}
                        onChange={(e) => setIsFraudDispute(e.target.checked)}
                        style={{ width: "18px", height: "18px", accentColor: "var(--error)", cursor: "pointer" }}
                      />
                      <label htmlFor="isFraudDispute" style={{ color: "var(--error)", fontWeight: 600, fontSize: "13px", cursor: "pointer", userSelect: "none" }}>
                        🚨 Report as Fraud Concern (Clawback & Lockout)
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: "12px" }}>
                      <button type="submit" className="btn btn-primary" style={{ background: "var(--error)", border: "none", flex: 1 }} disabled={processing}>
                        {processing ? "Submitting..." : "File Dispute"}
                      </button>
                      <button type="button" className="btn btn-secondary" onClick={() => { setSelectedTxForDispute(null); setIsFraudDispute(false); }}>
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", padding: "16px" }}>
              <button className="btn btn-secondary btn-sm"
                disabled={historyPagination.page <= 1}
                onClick={() => fetchHistory(historyPagination.page - 1)}>
                Previous
              </button>
              <span style={{ display: "flex", alignItems: "center", fontSize: "13px", color: "var(--text-muted)" }}>
                Page {historyPagination.page} of {historyPagination.totalPages}
              </span>
              <button className="btn btn-secondary btn-sm"
                disabled={historyPagination.page >= historyPagination.totalPages}
                onClick={() => fetchHistory(historyPagination.page + 1)}>
                Next
              </button>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <div className="empty-state-title">No transactions found</div>
            <div className="empty-state-text">Try adjusting your filters.</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="animate-fade-in">
      <div className="grid grid-2">
        {/* Profile info & edit */}
        <div>
          <div className="form-card" style={{ marginBottom: "24px" }}>
            <h3 className="form-card-title">Account Information</h3>
            <div style={{ display: "grid", gap: "12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Account Number</span>
                <span style={{ fontWeight: 600 }}>{profile?.AccountNumber}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Name</span>
                <span style={{ fontWeight: 600 }}>{profile?.customerName}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Account Type</span>
                <span className="badge badge-info">{profile?.AccountType}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Email</span>
                <span>{profile?.customerEmail}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Verification</span>
                <span className={`badge ${profile?.AccountVerify ? "badge-success" : "badge-warning"}`}>
                  {profile?.AccountVerify ? "Verified" : "Pending"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Transaction PIN</span>
                <span className={`badge ${profile?.hasPIN ? "badge-success" : "badge-warning"}`}>
                  {profile?.hasPIN ? "Set" : "Not Set"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)" }}>Balance</span>
                <span style={{ fontWeight: 700, color: "var(--success)" }}>{formatCurrency(profile?.Balance)}</span>
              </div>
            </div>
          </div>

          <div className="form-card">
            <h3 className="form-card-title">Edit Profile</h3>
            <form onSubmit={handleUpdateProfile}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label>Phone</label>
                <input type="tel" className="form-input" value={profileEdit.customerPhone}
                  onChange={(e) => setProfileEdit((p) => ({ ...p, customerPhone: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label>Address</label>
                <input type="text" className="form-input" value={profileEdit.customerAddress}
                  onChange={(e) => setProfileEdit((p) => ({ ...p, customerAddress: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>City</label>
                <input type="text" className="form-input" value={profileEdit.customerCity}
                  onChange={(e) => setProfileEdit((p) => ({ ...p, customerCity: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={processing}>
                {processing ? "Saving..." : "Update Profile"}
              </button>
            </form>
          </div>
        </div>

        {/* Password & PIN */}
        <div>
          <div className="form-card" style={{ marginBottom: "24px" }}>
            <h3 className="form-card-title">Change Password</h3>
            <form onSubmit={handleChangePassword}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label>Current Password</label>
                <input type="password" className="form-input" placeholder="Enter current password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData((p) => ({ ...p, currentPassword: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label>New Password</label>
                <input type="password" className="form-input" placeholder="Min 8 characters"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData((p) => ({ ...p, newPassword: e.target.value }))} />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Confirm New Password</label>
                <input type="password" className="form-input" placeholder="Re-enter new password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData((p) => ({ ...p, confirmPassword: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={processing}>
                {processing ? "Changing..." : "Change Password"}
              </button>
            </form>
          </div>

          <div className="form-card">
            <h3 className="form-card-title">
              {profile?.hasPIN ? "Change" : "Set"} Transaction PIN
            </h3>
            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
              A 4-digit PIN is required for transfers and sensitive operations.
            </p>
            <form onSubmit={handleSetPin}>
              <div className="form-group" style={{ marginBottom: "12px" }}>
                <label>4-Digit PIN</label>
                <input type="password" className="form-input" placeholder="Enter 4-digit PIN"
                  maxLength="4" value={pinData.pin}
                  onChange={(e) => setPinData((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "") }))} />
              </div>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label>Account Password (for verification)</label>
                <input type="password" className="form-input" placeholder="Enter your account password"
                  value={pinData.password}
                  onChange={(e) => setPinData((p) => ({ ...p, password: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary btn-block" disabled={processing}>
                {processing ? "Setting..." : profile?.hasPIN ? "Update PIN" : "Set PIN"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="animate-fade-in" style={{ maxWidth: "700px" }}>
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">Notifications ({notifications.length})</span>
          <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead}>
            <HiOutlineCheck /> Mark All Read
          </button>
        </div>
        {notifications.length > 0 ? (
          <div>
            {notifications.map((notif) => (
              <div key={notif.NotificationID} className={`notif-item ${!notif.IsRead ? "unread" : ""}`}>
                <div className="notif-item-title">{notif.Title}</div>
                <div className="notif-item-message">{notif.Message}</div>
                <div className="notif-item-time">{formatDate(notif.CreatedAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🔔</div>
            <div className="empty-state-title">All caught up!</div>
            <div className="empty-state-text">No notifications to show.</div>
          </div>
        )}
      </div>
    </div>
  );

  const renderReports = () => (
    <div className="animate-fade-in" style={{ maxWidth: "500px" }}>
      <div className="form-card">
        <h3 className="form-card-title"><HiOutlineDocumentDownload /> Account Statement</h3>
        <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "20px" }}>
          Generate a PDF statement for your account. Leave dates empty for the complete history.
        </p>
        <div className="form-group" style={{ marginBottom: "16px" }}>
          <label>Start Date</label>
          <input type="date" className="form-input" value={reportDates.startDate}
            onChange={(e) => setReportDates((p) => ({ ...p, startDate: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: "20px" }}>
          <label>End Date</label>
          <input type="date" className="form-input" value={reportDates.endDate}
            onChange={(e) => setReportDates((p) => ({ ...p, endDate: e.target.value }))} />
        </div>
        <button className="btn btn-primary btn-block btn-lg" onClick={handleDownloadReport}>
          <HiOutlineDownload /> Download PDF Report
        </button>
      </div>
    </div>
  );

  const renderSupport = () => (
    <div className="animate-fade-in">
      <div className="grid grid-2">
        <div className="form-card" style={{ height: "fit-content" }}>
          <h3 className="form-card-title"><HiOutlineQuestionMarkCircle /> Contact Support</h3>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "16px" }}>
            Submit a help ticket to our banking administrators. We usually reply within 24 hours.
          </p>
          <form onSubmit={handleCreateTicket}>
            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label>Subject</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Transaction delayed, Card enquiry"
                value={ticketSubject}
                onChange={(e) => setTicketSubject(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label>Message</label>
              <textarea
                className="form-input"
                placeholder="Describe your query in detail..."
                value={ticketMessage}
                onChange={(e) => setTicketMessage(e.target.value)}
                style={{ minHeight: "120px", padding: "10px", resize: "none" }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-block" disabled={processing}>
              {processing ? "Submitting..." : "Submit Ticket"}
            </button>
          </form>
        </div>

        <div className="form-card" style={{ height: "fit-content" }}>
          <h3 className="form-card-title">Support Ticket History</h3>
          {tickets.length > 0 ? (
            <div style={{ maxHeight: "400px", overflowY: "auto", paddingRight: "8px" }}>
              {tickets.map((t) => (
                <div key={t.TicketID} style={{ padding: "16px", background: "var(--bg-secondary)", borderRadius: "12px", marginBottom: "12px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>{t.Subject}</span>
                    <span className={`badge ${t.Status === 'Closed' ? 'badge-success' : t.Status === 'In_Progress' ? 'badge-info' : 'badge-warning'}`}>
                      {t.Status === 'In_Progress' ? 'In Progress' : t.Status}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "4px" }}>{t.Message}</p>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "8px" }}>{formatDate(t.CreatedAt)}</div>
                  
                  {t.AdminReply && (
                    <div style={{ marginTop: "12px", padding: "10px 12px", background: "rgba(6, 182, 212, 0.1)", borderRadius: "8px", borderLeft: "3px solid var(--accent)", fontSize: "13px", textAlign: "left" }}>
                      <div style={{ fontWeight: 600, color: "var(--accent)", fontSize: "11px", marginBottom: "2px" }}>
                        Reply from {t.AdminName || "Administrator"}
                      </div>
                      <p style={{ margin: 0 }}>{t.AdminReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: "30px" }}>
              <div className="empty-state-text">No support tickets found.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderDisputes = () => (
    <div className="animate-fade-in">
      <div className="table-container">
        <div className="table-header">
          <span className="table-title">My Disputes Center</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveView("history")}>
            Dispute A Transaction
          </button>
        </div>
        
        {disputes.length > 0 ? (
          <div style={{ padding: "8px 24px" }}>
            <table className="data-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Date Raised</th>
                  <th>Amount</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Admin Resolution Remarks</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((d) => (
                  <tr key={d.DisputeID}>
                    <td>{formatDate(d.CreatedAt)}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(d.TransactionAmount)}</td>
                    <td style={{ fontSize: "13px", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d.DisputeReason}>
                      {d.DisputeReason}
                    </td>
                    <td>
                      <span className={`badge ${d.DisputeStatus === 'Resolved' ? 'badge-success' : d.DisputeStatus === 'Rejected' ? 'badge-error' : 'badge-warning'}`}>
                        {d.DisputeStatus}
                      </span>
                    </td>
                    <td style={{ fontSize: "13px", color: d.AdminRemarks ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {d.AdminRemarks || "Pending administrator review"}
                      {d.ResolvedBy && (
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                          Resolved by {d.AdminName}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🛡️</div>
            <div className="empty-state-title">No disputes raised</div>
            <div className="empty-state-text">
              If you suspect any fraudulent transactions, go to Transaction History and click "Dispute" to request a reversal.
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Main Render ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-overlay" style={{ minHeight: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="app-layout">
      <Navbar
        activeView={activeView}
        setActiveView={setActiveView}
        profile={profile}
        unreadCount={accountInfo?.unreadNotifications || 0}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      <div className="main-content">
        <div className="topbar">
          <div className="topbar-left">
            <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
              <HiOutlineMenu />
            </button>
            <h2 className="topbar-title">{getViewTitle()}</h2>
          </div>
          <div className="topbar-right">
            <button className="topbar-icon-btn" onClick={() => { fetchDashboard(); toast.info("Refreshed!"); }}>
              <HiOutlineRefresh />
            </button>
            <button className="topbar-icon-btn" onClick={() => setActiveView("notifications")}>
              <HiOutlineBell />
              {accountInfo?.unreadNotifications > 0 && (
                <span className="notification-badge">
                  {accountInfo.unreadNotifications > 9 ? "9+" : accountInfo.unreadNotifications}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="page-content">
          {activeView === "dashboard" && renderDashboard()}
          {activeView === "transfer" && renderTransfer()}
          {activeView === "withdraw" && renderWithdraw()}
          {activeView === "loans" && renderLoans()}
          {activeView === "history" && renderHistory()}
          {activeView === "profile" && renderProfile()}
          {activeView === "notifications" && renderNotifications()}
          {activeView === "reports" && renderReports()}
          {activeView === "support" && renderSupport()}
          {activeView === "disputes" && renderDisputes()}
        </div>
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.5)", zIndex: 99,
          }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}

export default Home;
