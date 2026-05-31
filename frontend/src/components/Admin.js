import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { io } from "socket.io-client";
import {
  HiOutlineChartBar,
  HiOutlineCreditCard,
  HiOutlineCash,
  HiOutlineShieldCheck,
  HiOutlineSearch,
  HiOutlineUsers,
  HiOutlineLogout,
  HiOutlineLibrary,
  HiOutlineCheck,
  HiOutlineX,
  HiOutlinePencil,
  HiOutlineMenu,
  HiOutlineRefresh,
  HiOutlineQuestionMarkCircle,
  HiOutlineExclamationCircle,
  HiOutlineClipboardList,
  HiOutlineDownload,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
  HiOutlineFilter,
  HiOutlineCog,
} from "react-icons/hi";
import { adminApi } from "../utlis/api";
import AdminManagement from "./AdminManagement";
import AdminSettings from "./AdminSettings";
import "../App.css";

const Admin = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Dashboard stats
  const [stats, setStats] = useState(null);
  const [recentTxns, setRecentTxns] = useState([]);
  const [newCustomers, setNewCustomers] = useState([]);

  // Loan applications
  const [loanApplications, setLoanApplications] = useState([]);
  const [loanRemarks, setLoanRemarks] = useState({});

  // Deposit
  const [depositAccountNumber, setDepositAccountNumber] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositAccountName, setDepositAccountName] = useState("");
  const [depositConfirmText, setDepositConfirmText] = useState("");

  // Maker-Checker Queue
  const [pendingDeposits, setPendingDeposits] = useState([]);
  const [approvalOtp, setApprovalOtp] = useState({});
  const [otpRequiredFor, setOtpRequiredFor] = useState(null);

  // Verify accounts
  const [unverifiedAccounts, setUnverifiedAccounts] = useState([]);

  // Search customers
  const [searchName, setSearchName] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [editModal, setEditModal] = useState(null);

  // Disputes state
  const [disputes, setDisputes] = useState([]);
  const [resolvingDisputeId, setResolvingDisputeId] = useState(null);
  const [disputeRemarks, setDisputeRemarks] = useState("");

  // Support tickets state
  const [tickets, setTickets] = useState([]);
  const [replyingTicketId, setReplyingTicketId] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [cases, setCases] = useState([]);
  const [resolvingCaseId, setResolvingCaseId] = useState(null);
  const [caseRemarks, setCaseRemarks] = useState("");

  // RBAC State
  const [adminPermissions, setAdminPermissions] = useState([]);
  const [adminRole, setAdminRole] = useState("Unknown");

  useEffect(() => {
    try {
      const perms = JSON.parse(localStorage.getItem("adminPermissions") || "[]");
      setAdminPermissions(perms);
      setAdminRole(localStorage.getItem("adminRole") || "Unknown");
    } catch (e) {
      console.error("Failed to parse permissions", e);
    }
  }, []);

  const hasPermission = (permission) => adminPermissions.includes(permission);
  // Audit trail state
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditCategoryCounts, setAuditCategoryCounts] = useState({});
  const [auditCategoryFilter, setAuditCategoryFilter] = useState("");
  const [auditActorTypeFilter, setAuditActorTypeFilter] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [auditEntityIdFilter, setAuditEntityIdFilter] = useState("");
  const [expandedAuditId, setExpandedAuditId] = useState(null);
  const [auditViewMode, setAuditViewMode] = useState("table"); // "table" or "timeline"
  const [auditLive, setAuditLive] = useState(false);
  const socketRef = useRef(null);

  // Socket.IO: Connect to real-time audit feed when audit view is active
  useEffect(() => {
    if (activeView !== "audit") {
      // Disconnect when navigating away
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setAuditLive(false);
      }
      return;
    }

    const token = localStorage.getItem("adminToken");
    if (!token) return;

    const socket = io("http://localhost:8081", {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      setAuditLive(true);
    });

    socket.on("disconnect", () => {
      setAuditLive(false);
    });

    socket.on("audit:new", (entry) => {
      // Prepend new entry to the logs list in real-time
      setAuditLogs((prev) => [entry, ...prev].slice(0, 50));
      setAuditTotal((prev) => prev + 1);
      // Update category counts
      if (entry.Category) {
        setAuditCategoryCounts((prev) => ({
          ...prev,
          [entry.Category]: (prev[entry.Category] || 0) + 1,
        }));
      }
    });

    socket.on("connect_error", () => {
      setAuditLive(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      setAuditLive(false);
    };
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Formatters ────────────────────────────────────────────
  const formatCurrency = (val) => {
    const num = parseFloat(val);
    if (isNaN(num)) return "₹0.00";
    return "₹" + num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (d) =>
    new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

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

  // ── Data Fetching ─────────────────────────────────────────
  const fetchDashboard = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/dashboard");
      setStats(res.data.stats);
      setRecentTxns(res.data.recentTransactions || []);
      setNewCustomers(res.data.newCustomers || []);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        toast.error("Session expired. Please login again.");
        localStorage.removeItem("adminToken");
        navigate("/admin/login");
      } else {
        toast.error("Failed to load dashboard.");
      }
    }
  }, [navigate]);

  const fetchLoanApplications = useCallback(async () => {
    try {
      const res = await adminApi.get("/admin/loans");
      setLoanApplications(res.data.loans);
    } catch (error) {
      console.error("Failed to load loans:", error);
    }
  }, []);

  const fetchPendingDeposits = useCallback(async () => {
    if (!hasPermission("deposit_money")) return;
    try {
      const res = await adminApi.get("/admin/pending-deposits");
      setPendingDeposits(res.data.deposits);
    } catch (error) {
      console.error("Failed to load pending deposits:", error);
    }
  }, [adminPermissions]);

  const handleApproveDeposit = async (id) => {
    try {
      setProcessing(true);
      const payload = otpRequiredFor === id ? { otp: approvalOtp[id] } : {};
      const res = await adminApi.post(`/admin/approve-deposit/${id}`, payload);
      
      if (res.data.otp_required) {
        setOtpRequiredFor(id);
        toast.info(res.data.message);
      } else {
        toast.success(res.data.message);
        setOtpRequiredFor(null);
        fetchPendingDeposits();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to approve deposit");
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectDeposit = async (id) => {
    if (!window.confirm("Are you sure you want to reject this deposit?")) return;
    try {
      setProcessing(true);
      await adminApi.post(`/admin/reject-deposit/${id}`);
      toast.success("Deposit rejected");
      fetchPendingDeposits();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to reject deposit");
    } finally {
      setProcessing(false);
    }
  };

  const handleReverseDeposit = async (id) => {
    if (!window.confirm("Are you sure you want to reverse this deposit? This will debit the customer's account.")) return;
    try {
      setProcessing(true);
      await adminApi.post(`/admin/reverse-deposit/${id}`);
      toast.success("Deposit reversed successfully");
      fetchPendingDeposits(); 
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to reverse deposit");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    if (activeView === "loans") fetchLoans();
    if (activeView === "verify") fetchUnverified();
    if (activeView === "disputes") fetchDisputes();
    if (activeView === "support") fetchTickets();
    if (activeView === "ledger") fetchLedger();
    if (activeView === "cases") fetchCases();
    if (activeView === "audit") fetchAuditLogs();
    if (activeView === "approvals") fetchPendingDeposits();
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchCases = async () => {
    try {
      const res = await adminApi.get("/admin/investigation-cases");
      setCases(res.data.cases || []);
    } catch {
      toast.error("Failed to fetch investigation cases.");
    }
  };

  const fetchLedger = async () => {
    try {
      const res = await adminApi.get("/admin/ledger");
      setLedgerEntries(res.data.ledger || []);
    } catch {
      toast.error("Failed to fetch general ledger.");
    }
  };

  const fetchLoans = async () => {
    try {
      const res = await adminApi.get("/admin/loanApplications");
      setLoanApplications(res.data.loanApplications || []);
    } catch {
      toast.error("Failed to fetch loan applications.");
    }
  };

  const fetchUnverified = async () => {
    try {
      const res = await adminApi.get("/admin/reports");
      setUnverifiedAccounts(res.data.accounts || []);
    } catch {
      toast.error("Failed to fetch unverified accounts.");
    }
  };

  const fetchDisputes = async () => {
    try {
      const res = await adminApi.get("/admin/disputes");
      setDisputes(res.data.disputes || []);
    } catch {
      toast.error("Failed to fetch disputes.");
    }
  };

  const fetchTickets = async () => {
    try {
      const res = await adminApi.get("/admin/support/tickets");
      setTickets(res.data.tickets || []);
    } catch {
      toast.error("Failed to fetch support tickets.");
    }
  };

  // ── Actions ───────────────────────────────────────────────
  const handleLoanAction = async (loanId, status) => {
    setProcessing(true);
    try {
      await adminApi.post(`/admin/approveLoan/${loanId}`, {
        approvalStatus: status,
        remarks: loanRemarks[loanId] || undefined,
      });
      toast.success(`Loan ${status.toLowerCase()} successfully!`);
      setLoanApplications((prev) => prev.filter((l) => l.LoanID !== loanId));
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${status.toLowerCase()} loan.`);
    } finally {
      setProcessing(false);
    }
  };

  const handleVerifyAccount = async (accountNumber) => {
    try {
      await adminApi.post("/admin/verifyCustomerAccount", { accountNumber });
      toast.success("Account verified successfully!");
      setUnverifiedAccounts((prev) => prev.filter((a) => a.AccountNumber !== accountNumber));
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to verify account.");
    }
  };

  const handleVerifyDeposit = async () => {
    if (!depositAccountNumber) return;
    try {
      const res = await adminApi.get(`/admin/verifyAccount/${depositAccountNumber}`);
      if (res.data.accountExists) {
        setDepositAccountName(res.data.accountName);
      } else {
        toast.error("Account not found.");
        setDepositAccountName("");
      }
    } catch {
      toast.error("Account not found.");
      setDepositAccountName("");
    }
  };

  const handleDeposit = async () => {
    if (!depositAccountNumber || !depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("Enter valid account number and amount.");
      return;
    }
    setProcessing(true);
    try {
      const res = await adminApi.post("/admin/depositMoney", {
        accountNumber: depositAccountNumber,
        depositAmount,
      });
      toast.success(res.data.message || "Deposit successful!");
      setDepositAccountNumber("");
      setDepositAmount("");
      setDepositAccountName("");
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || "Deposit failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSearchCustomer = async () => {
    if (!searchName.trim()) return;
    try {
      const res = await adminApi.get("/admin/customer/searchByName", { params: { name: searchName } });
      setSearchResults(Array.isArray(res.data) ? res.data : []);
      if (res.data.length === 0) toast.info("No customers found.");
    } catch (err) {
      if (err.response?.status === 404) {
        toast.info("No customers found.");
        setSearchResults([]);
      } else {
        toast.error("Search failed.");
      }
    }
  };

  const handleUpdateCustomer = async (e) => {
    e.preventDefault();
    if (!editModal) return;
    setProcessing(true);
    try {
      await adminApi.post(`/admin/customer/update?accountNumber=${editModal.AccountNumber}`, {
        customerName: editModal.customerName,
        customerPhone: editModal.customerPhone,
        customerEmail: editModal.customerEmail,
        customerAddress: editModal.customerAddress,
        customerCity: editModal.customerCity,
      });
      toast.success("Customer updated successfully!");
      setEditModal(null);
      handleSearchCustomer();
    } catch (err) {
      toast.error(err.response?.data?.error || "Update failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleToggleBlock = async (accountNumber) => {
    setProcessing(true);
    try {
      const res = await adminApi.post(`/admin/customers/${accountNumber}/toggle-block`);
      toast.success(res.data.message || "Customer block status updated.");
      setSearchResults((prev) =>
        prev.map((c) => (c.AccountNumber === accountNumber ? { ...c, isActive: res.data.isActive } : c))
      );
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to update block status.");
    } finally {
      setProcessing(false);
    }
  };

  const handleApplyLateFees = async () => {
    setProcessing(true);
    try {
      const res = await adminApi.post("/admin/loans/apply-late-fees");
      toast.success(res.data.message || "Late fees processed.");
    } catch (err) {
      toast.error(err.response?.data?.error || "Failed to process late fees.");
    } finally {
      setProcessing(false);
    }
  };

  const renderDisputes = () => {
    const handleResolve = async (disputeId, action) => {
      const remarks = disputeRemarks || (action === "Resolve" ? "Approved reversal refund." : "Dispute rejected.");
      setProcessing(true);
      try {
        const res = await adminApi.post(`/admin/disputes/${disputeId}/resolve`, {
          action,
          adminRemarks: remarks,
        });
        toast.success(res.data.message || `Dispute ${action}d successfully!`);
        setDisputeRemarks("");
        setResolvingDisputeId(null);
        fetchDisputes();
        fetchDashboard();
      } catch (err) {
        toast.error(err.response?.data?.error || `Failed to ${action.toLowerCase()} dispute.`);
      } finally {
        setProcessing(false);
      }
    };

    return (
      <div className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
            Dispute Claims ({disputes.length})
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={fetchDisputes}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>

        {disputes.length > 0 ? (
          <div className="disputes-list" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {disputes.map((disp) => (
              <div className="loan-card" key={disp.DisputeID} style={{ borderLeft: disp.DisputeStatus === "Open" ? "4px solid var(--warning)" : disp.DisputeStatus === "Resolved" ? "4px solid var(--success)" : "4px solid var(--text-muted)" }}>
                <div className="loan-card-header">
                  <div>
                    <div className="loan-card-amount">
                      Claim #{disp.DisputeID}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Raised by {disp.customerName} ({disp.AccountNumber}) • {formatDate(disp.CreatedAt)}
                    </div>
                  </div>
                  <span className={`badge ${disp.DisputeStatus === 'Open' ? 'badge-warning' : disp.DisputeStatus === 'Resolved' ? 'badge-success' : 'badge-error'}`}>
                    {disp.DisputeStatus}
                  </span>
                </div>

                <div style={{ background: "rgba(255,255,255,0.02)", padding: "16px", borderRadius: "8px", margin: "12px 0", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ fontWeight: 600, fontSize: "14px", marginBottom: "8px" }}>Disputed Transaction:</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr", gap: "12px", fontSize: "13px" }}>
                    <div><strong>TxID:</strong> {disp.TransactionID}</div>
                    <div><strong>Type:</strong> {disp.TransactionType}</div>
                    <div><strong>Amount:</strong> <span style={{ color: "var(--error)", fontWeight: 600 }}>{formatCurrency(disp.TransactionAmount)}</span></div>
                    <div><strong>Ref ID:</strong> {disp.ReferenceID || "N/A"}</div>
                    <div><strong>Date:</strong> {formatDate(disp.TransactionDate)}</div>
                    <div><strong>Status:</strong> {renderStatusBadge(disp.TransactionStatus)}</div>
                    <div><strong>Description:</strong> {disp.TxDescription}</div>
                  </div>
                </div>

                <div style={{ fontSize: "14px", marginBottom: "12px" }}>
                  <strong>Dispute Reason:</strong> <span style={{ color: "var(--text-muted)" }}>{disp.Reason}</span>
                </div>

                {disp.DisputeStatus === "Open" ? (
                  <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Remarks / Reason for decision"
                      style={{ flex: 1, padding: "8px 12px" }}
                      value={resolvingDisputeId === disp.DisputeID ? disputeRemarks : ""}
                      onChange={(e) => {
                        setResolvingDisputeId(disp.DisputeID);
                        setDisputeRemarks(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleResolve(disp.DisputeID, "Resolve")}
                      disabled={processing}
                    >
                      Approve Reversal
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleResolve(disp.DisputeID, "Reject")}
                      disabled={processing}
                    >
                      Reject Dispute
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px", marginTop: "8px" }}>
                    <strong>Admin Remarks:</strong> {disp.AdminRemarks || "No remarks provided."}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🛡️</div>
            <div className="empty-state-title">No transaction disputes</div>
            <div className="empty-state-text">Customers haven't submitted any disputes yet.</div>
          </div>
        )}
      </div>
    );
  };

  const handleResolveCase = async (caseId, action) => {
    const remarks = caseRemarks || (action === "Approve_Refund" ? "Approved bank-funded refund after fraud claim validation." : "Fraud investigation completed, case closed without refund.");
    setProcessing(true);
    try {
      const res = await adminApi.post(`/admin/investigation-cases/${caseId}/resolve`, {
        action,
        adminRemarks: remarks,
      });
      toast.success(res.data.message || `Case resolved successfully!`);
      setCaseRemarks("");
      setResolvingCaseId(null);
      fetchCases();
      fetchDashboard();
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to resolve case.`);
    } finally {
      setProcessing(false);
    }
  };

  const renderInvestigationCases = () => {
    return (
      <div className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
            Fraud Investigation Cases ({cases.length})
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={fetchCases}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>

        {cases.length > 0 ? (
          <div className="disputes-list" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {cases.map((c) => (
              <div className="loan-card" key={c.CaseID} style={{ borderLeft: c.CaseStatus === "Open" ? "4px solid var(--warning)" : c.CaseStatus === "Resolved" ? "4px solid var(--success)" : "4px solid var(--text-muted)" }}>
                <div className="loan-card-header">
                  <div>
                    <div className="loan-card-amount">
                      Case #{c.CaseID} • Disputed: {formatCurrency(c.DisputedAmount)}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Opened: {formatDate(c.CreatedAt)}
                    </div>
                  </div>
                  <span className={`badge ${c.CaseStatus === 'Open' ? 'badge-warning' : c.CaseStatus === 'Resolved' ? 'badge-success' : 'badge-error'}`}>
                    {c.CaseStatus}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", margin: "16px 0" }}>
                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "13px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--error)" }}>Victim (Claimant):</div>
                    <div><strong>Acc:</strong> {c.VictimAccountNumber}</div>
                    <div><strong>Name:</strong> {c.VictimName}</div>
                    <div><strong>Email:</strong> {c.VictimEmail}</div>
                  </div>

                  <div style={{ background: "rgba(255,255,255,0.02)", padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)", fontSize: "13px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "6px", color: "var(--warning)" }}>Suspect (Accused):</div>
                    <div><strong>Acc:</strong> {c.SuspectAccountNumber}</div>
                    <div><strong>Name:</strong> {c.SuspectName}</div>
                    <div><strong>Email:</strong> {c.SuspectEmail}</div>
                  </div>
                </div>

                <div style={{ background: "rgba(255,255,255,0.01)", padding: "12px", borderRadius: "8px", fontSize: "13px", marginBottom: "12px" }}>
                  <div><strong>Transaction Type:</strong> {c.TransactionType}</div>
                  <div><strong>Description:</strong> {c.TxDescription}</div>
                  <div><strong>Ref ID:</strong> {c.ReferenceID}</div>
                  <div style={{ marginTop: "6px" }}><strong>Fraud Reason Details:</strong> {c.DisputeReason}</div>
                </div>

                {c.CaseStatus === "Open" ? (
                  <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Remarks / Reason for decision"
                      style={{ flex: 1, padding: "8px 12px" }}
                      value={resolvingCaseId === c.CaseID ? caseRemarks : ""}
                      onChange={(e) => {
                        setResolvingCaseId(c.CaseID);
                        setCaseRemarks(e.target.value);
                      }}
                    />
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleResolveCase(c.CaseID, "Approve_Refund")}
                      disabled={processing}
                    >
                      Approve Bank-Funded Refund
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleResolveCase(c.CaseID, "Close_Case")}
                      disabled={processing}
                    >
                      Reject Refund & Close
                    </button>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px", marginTop: "8px" }}>
                    <strong>Admin Resolution Remarks:</strong> {c.AdminRemarks || "No remarks provided."}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🛡️</div>
            <div className="empty-state-title">No open fraud cases</div>
            <div className="empty-state-text">There are currently no fraud cases requiring manual review.</div>
          </div>
        )}
      </div>
    );
  };

  const renderSupport = () => {
    const handleReply = async (ticketId) => {
      if (!replyText.trim()) {
        toast.error("Reply text cannot be empty.");
        return;
      }
      setProcessing(true);
      try {
        await adminApi.post(`/admin/support/tickets/${ticketId}/reply`, {
          adminReply: replyText,
          status: "Closed",
        });
        toast.success("Reply submitted successfully!");
        setReplyText("");
        setReplyingTicketId(null);
        fetchTickets();
      } catch (err) {
        toast.error(err.response?.data?.error || "Failed to submit reply.");
      } finally {
        setProcessing(false);
      }
    };

    return (
      <div className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
            Support Tickets ({tickets.length})
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={fetchTickets}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>

        {tickets.length > 0 ? (
          <div className="tickets-list" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {tickets.map((ticket) => (
              <div className="loan-card" key={ticket.TicketID} style={{ borderLeft: ticket.Status === "Open" ? "4px solid var(--warning)" : "4px solid var(--text-muted)" }}>
                <div className="loan-card-header">
                  <div>
                    <div className="loan-card-amount">
                      Ticket #{ticket.TicketID}: {ticket.Subject}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                      From {ticket.customerName} ({ticket.AccountNumber}) • {formatDate(ticket.CreatedAt)}
                    </div>
                  </div>
                  <span className={`badge ${ticket.Status === 'Open' ? 'badge-warning' : 'badge-success'}`}>
                    {ticket.Status}
                  </span>
                </div>

                <div style={{ fontSize: "14px", margin: "12px 0", whiteSpace: "pre-wrap" }}>
                  <strong>Message:</strong> <span style={{ color: "var(--text-muted)" }}>{ticket.Message}</span>
                </div>

                {ticket.Status === "Open" ? (
                  <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <textarea
                      className="form-input"
                      placeholder="Type reply to customer..."
                      rows="3"
                      value={replyingTicketId === ticket.TicketID ? replyText : ""}
                      onChange={(e) => {
                        setReplyingTicketId(ticket.TicketID);
                        setReplyText(e.target.value);
                      }}
                      style={{ resize: "vertical", width: "100%", padding: "10px" }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleReply(ticket.TicketID)}
                        disabled={processing}
                      >
                        Send Reply & Close Ticket
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: "13px", color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "8px", marginTop: "8px" }}>
                    <strong>Admin Reply:</strong> {ticket.AdminReply}
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Replied on: {formatDate(ticket.UpdatedAt)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">No support tickets</div>
            <div className="empty-state-text">Customers haven't submitted any tickets.</div>
          </div>
        )}
      </div>
    );
  };

  const renderLedger = () => {
    return (
      <div className="animate-fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
            General Ledger Journal ({ledgerEntries.length} entries)
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={fetchLedger}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>

        {ledgerEntries.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {ledgerEntries.map((journal) => (
              <div className="loan-card" key={journal.JournalID} style={{ borderLeft: "4px solid var(--primary)", padding: "20px" }}>
                <div className="loan-card-header" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "10px", marginBottom: "15px" }}>
                  <div>
                    <div className="loan-card-amount" style={{ fontSize: "15px" }}>
                      Journal Entry #{journal.JournalID} • {journal.TransactionType}
                    </div>
                    <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Ref ID: {journal.ReferenceID || "N/A"} • {formatDate(journal.CreatedAt)}
                    </div>
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-muted)" }}>
                    {journal.Description}
                  </div>
                </div>

                <div className="table-container" style={{ background: "transparent", border: "none", boxShadow: "none", margin: 0, padding: 0 }}>
                  <table className="data-table" style={{ width: "100%", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "rgba(255,255,255,0.01)" }}>
                        <th style={{ padding: "8px 12px" }}>Account Name</th>
                        <th style={{ padding: "8px 12px" }}>Customer / Sub-Ledger</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Debit (Dr)</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Credit (Cr)</th>
                        <th style={{ padding: "8px 12px", textAlign: "right" }}>Account Bal After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {journal.entries.map((entry) => {
                        const isDebit = entry.EntryType === "Debit";
                        return (
                          <tr key={entry.EntryID} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                            <td style={{ padding: "8px 12px", paddingLeft: isDebit ? "12px" : "32px", fontWeight: isDebit ? "600" : "400", color: isDebit ? "var(--text)" : "var(--text-muted)" }}>
                              {entry.AccountName}
                            </td>
                            <td style={{ padding: "8px 12px", color: "var(--text-muted)" }}>
                              {entry.SubAccountNumber ? `${entry.customerName || "Customer"} (${entry.SubAccountNumber})` : "N/A"}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--success)", fontWeight: 600 }}>
                              {isDebit ? formatCurrency(entry.Amount) : ""}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--warning)", fontWeight: 600 }}>
                              {!isDebit ? formatCurrency(entry.Amount) : ""}
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right", color: "var(--text-muted)" }}>
                              {formatCurrency(entry.BalanceAfter)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">📖</div>
            <div className="empty-state-title">No ledger entries</div>
            <div className="empty-state-text">No double-entry journals have been recorded yet.</div>
          </div>
        )}
      </div>
    );
  };

  // ── Audit Trail ──────────────────────────────────────────────
  const fetchAuditLogs = async (pageOverride) => {
    try {
      const params = new URLSearchParams();
      params.set("page", pageOverride || auditPage);
      params.set("limit", "30");
      if (auditCategoryFilter) params.set("category", auditCategoryFilter);
      if (auditActorTypeFilter) params.set("actorType", auditActorTypeFilter);
      if (auditActionFilter) params.set("action", auditActionFilter);
      if (auditStartDate) params.set("startDate", auditStartDate);
      if (auditEndDate) params.set("endDate", auditEndDate);
      if (auditEntityIdFilter) params.set("entityId", auditEntityIdFilter);

      const res = await adminApi.get(`/admin/audit-logs?${params.toString()}`);
      setAuditLogs(res.data.logs || []);
      setAuditTotal(res.data.total || 0);
      setAuditTotalPages(res.data.totalPages || 1);
      setAuditCategoryCounts(res.data.categoryCounts || {});
    } catch (err) {
      toast.error("Failed to load audit logs.");
    }
  };

  const handleAuditCategoryClick = (cat) => {
    setAuditCategoryFilter(cat);
    setAuditPage(1);
    setTimeout(() => fetchAuditLogs(1), 0);
  };

  const handleAuditFilterApply = () => {
    setAuditPage(1);
    fetchAuditLogs(1);
  };

  const handleAuditResetFilters = () => {
    setAuditCategoryFilter("");
    setAuditActorTypeFilter("");
    setAuditActionFilter("");
    setAuditStartDate("");
    setAuditEndDate("");
    setAuditEntityIdFilter("");
    setAuditPage(1);
    setTimeout(() => fetchAuditLogs(1), 50);
  };

  const handleAuditExport = async (format) => {
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      if (auditCategoryFilter) params.set("category", auditCategoryFilter);
      if (auditActorTypeFilter) params.set("actorType", auditActorTypeFilter);
      if (auditActionFilter) params.set("action", auditActionFilter);
      if (auditStartDate) params.set("startDate", auditStartDate);
      if (auditEndDate) params.set("endDate", auditEndDate);
      if (auditEntityIdFilter) params.set("entityId", auditEntityIdFilter);

      const res = await adminApi.get(`/admin/audit-logs/export?${params.toString()}`, {
        responseType: format === "csv" ? "blob" : "json",
      });

      const blob = format === "csv"
        ? new Blob([res.data], { type: "text/csv" })
        : new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported audit logs as ${format.toUpperCase()}`);
    } catch (err) {
      toast.error("Failed to export audit logs.");
    }
  };

  const getAuditActionColor = (action) => {
    if (action.includes("FAILED") || action.includes("LOCKED") || action.includes("BLOCKED")) return "#f87171";
    if (action.includes("SUCCESS") || action.includes("APPROVED") || action.includes("VERIFIED") || action.includes("REGISTER")) return "#34d399";
    if (action.includes("TRANSFER") || action.includes("DEPOSIT") || action.includes("WITHDRAWAL") || action.includes("REPAYMENT")) return "#60a5fa";
    if (action.includes("FRAUD") || action.includes("COOLDOWN") || action.includes("PIN")) return "#fbbf24";
    if (action.includes("ADMIN") || action.includes("CASE") || action.includes("DISPUTE")) return "#a78bfa";
    if (action.includes("SYSTEM") || action.includes("MIGRATION") || action.includes("SERVER")) return "#94a3b8";
    return "#e2e8f0";
  };

  const getCategoryIcon = (category) => {
    const map = {
      Authentication: "🔐", Financial: "💰", Admin: "⚙️",
      Security: "🛡️", Account: "👤", System: "🖥️",
    };
    return map[category] || "📋";
  };

  const renderJsonDiff = (oldValues, newValues) => {
    const allKeys = new Set([...Object.keys(oldValues || {}), ...Object.keys(newValues || {})]);
    if (allKeys.size === 0) return <p style={{ color: "var(--text-muted)" }}>No detail data</p>;

    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", fontSize: "13px" }}>
        {oldValues && Object.keys(oldValues).length > 0 && (
          <div>
            <div style={{ fontWeight: 600, color: "#f87171", marginBottom: "8px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Before</div>
            {Object.entries(oldValues).map(([key, val]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: "4px", background: "rgba(248, 113, 113, 0.08)", marginBottom: "2px" }}>
                <span style={{ color: "var(--text-muted)" }}>{key}</span>
                <span style={{ color: "#f87171", fontFamily: "monospace" }}>{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        )}
        {newValues && Object.keys(newValues).length > 0 && (
          <div>
            <div style={{ fontWeight: 600, color: "#34d399", marginBottom: "8px", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>After</div>
            {Object.entries(newValues).map(([key, val]) => (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", padding: "4px 8px", borderRadius: "4px", background: "rgba(52, 211, 153, 0.08)", marginBottom: "2px" }}>
                <span style={{ color: "var(--text-muted)" }}>{key}</span>
                <span style={{ color: "#34d399", fontFamily: "monospace" }}>{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAuditTrail = () => {
    const categories = ["", "Authentication", "Financial", "Admin", "Security", "Account", "System"];
    const totalAll = Object.values(auditCategoryCounts).reduce((s, v) => s + v, 0);

    return (
      <div className="animate-fade-in">
        {/* Category Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "20px", flexWrap: "wrap" }}>
          {categories.map((cat) => {
            const count = cat === "" ? totalAll : (auditCategoryCounts[cat] || 0);
            const isActive = auditCategoryFilter === cat;
            return (
              <button
                key={cat || "all"}
                onClick={() => handleAuditCategoryClick(cat)}
                style={{
                  padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "8px",
                  fontSize: "13px", fontWeight: isActive ? 600 : 400,
                  background: isActive ? "var(--primary)" : "var(--card-bg)",
                  color: isActive ? "#fff" : "var(--text-secondary)",
                  transition: "all 0.2s ease",
                }}
              >
                {cat ? getCategoryIcon(cat) : "📋"} {cat || "All"}
                <span style={{
                  background: isActive ? "rgba(255,255,255,0.25)" : "var(--bg)",
                  padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                }}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Filter Bar */}
        <div className="card" style={{ padding: "16px", marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
            <HiOutlineFilter /> Filters
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px" }}>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Actor Type</label>
              <select className="form-input" value={auditActorTypeFilter} onChange={(e) => setAuditActorTypeFilter(e.target.value)} style={{ fontSize: "13px" }}>
                <option value="">All</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="system">System</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Action</label>
              <input className="form-input" placeholder="e.g. LOGIN" value={auditActionFilter} onChange={(e) => setAuditActionFilter(e.target.value)} style={{ fontSize: "13px" }} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Entity ID</label>
              <input className="form-input" placeholder="e.g. 101064853404" value={auditEntityIdFilter} onChange={(e) => setAuditEntityIdFilter(e.target.value)} style={{ fontSize: "13px" }} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>Start Date</label>
              <input type="date" className="form-input" value={auditStartDate} onChange={(e) => setAuditStartDate(e.target.value)} style={{ fontSize: "13px" }} />
            </div>
            <div>
              <label style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", display: "block" }}>End Date</label>
              <input type="date" className="form-input" value={auditEndDate} onChange={(e) => setAuditEndDate(e.target.value)} style={{ fontSize: "13px" }} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
              <button className="btn btn-primary" onClick={handleAuditFilterApply} style={{ fontSize: "13px", padding: "8px 16px" }}>
                <HiOutlineSearch style={{ marginRight: "4px" }} /> Apply
              </button>
              <button className="btn btn-secondary" onClick={handleAuditResetFilters} style={{ fontSize: "13px", padding: "8px 16px" }}>
                Reset
              </button>
            </div>
          </div>
        </div>

        {/* View toggle + Export */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "4px", background: "var(--card-bg)", borderRadius: "8px", padding: "4px" }}>
            <button
              onClick={() => setAuditViewMode("table")}
              style={{
                padding: "6px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px",
                background: auditViewMode === "table" ? "var(--primary)" : "transparent",
                color: auditViewMode === "table" ? "#fff" : "var(--text-muted)",
              }}
            >Table</button>
            <button
              onClick={() => setAuditViewMode("timeline")}
              style={{
                padding: "6px 14px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "12px",
                background: auditViewMode === "timeline" ? "var(--primary)" : "transparent",
                color: auditViewMode === "timeline" ? "#fff" : "var(--text-muted)",
              }}
            >Timeline</button>
          </div>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{auditTotal} records</span>
            {auditLive && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                background: "rgba(52, 211, 153, 0.15)", color: "#34d399",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                animation: "pulse 2s ease-in-out infinite",
              }}>
                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#34d399" }} />
                Live
              </span>
            )}
            <button className="btn btn-secondary" onClick={() => handleAuditExport("csv")} style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "4px" }}>
              <HiOutlineDownload /> CSV
            </button>
            <button className="btn btn-secondary" onClick={() => handleAuditExport("json")} style={{ fontSize: "12px", padding: "6px 12px", display: "flex", alignItems: "center", gap: "4px" }}>
              <HiOutlineDownload /> JSON
            </button>
          </div>
        </div>

        {/* Table View */}
        {auditViewMode === "table" && (
          <div className="card" style={{ overflow: "auto" }}>
            <table className="data-table" style={{ width: "100%", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={{ width: "140px" }}>Timestamp</th>
                  <th style={{ width: "70px" }}>Actor</th>
                  <th>Action</th>
                  <th style={{ width: "100px" }}>Category</th>
                  <th>Entity</th>
                  <th style={{ width: "120px" }}>IP Address</th>
                  <th>Description</th>
                  <th style={{ width: "60px" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>No audit entries found</td></tr>
                ) : auditLogs.map((log) => (
                  <React.Fragment key={log.AuditID}>
                    <tr style={{ borderBottom: expandedAuditId === log.AuditID ? "none" : undefined }}>
                      <td style={{ fontSize: "12px", whiteSpace: "nowrap" }}>{formatDate(log.Timestamp)}</td>
                      <td>
                        <span style={{
                          padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 600,
                          background: log.ActorType === "admin" ? "rgba(167, 139, 250, 0.15)" : log.ActorType === "system" ? "rgba(148, 163, 184, 0.15)" : "rgba(96, 165, 250, 0.15)",
                          color: log.ActorType === "admin" ? "#a78bfa" : log.ActorType === "system" ? "#94a3b8" : "#60a5fa",
                        }}>{log.ActorType}</span>
                      </td>
                      <td>
                        <span style={{
                          padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                          background: `${getAuditActionColor(log.Action)}20`,
                          color: getAuditActionColor(log.Action),
                          border: `1px solid ${getAuditActionColor(log.Action)}40`,
                        }}>{log.Action}</span>
                      </td>
                      <td style={{ fontSize: "12px" }}>{getCategoryIcon(log.Category)} {log.Category}</td>
                      <td style={{ fontSize: "12px", fontFamily: "monospace" }}>
                        {log.EntityType && <span style={{ color: "var(--text-muted)" }}>{log.EntityType}: </span>}
                        {log.EntityID || "—"}
                      </td>
                      <td style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--text-muted)" }}>{log.IPAddress || "—"}</td>
                      <td style={{ fontSize: "12px", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.Description}>{log.Description}</td>
                      <td>
                        {(log.OldValues || log.NewValues) ? (
                          <button
                            onClick={() => setExpandedAuditId(expandedAuditId === log.AuditID ? null : log.AuditID)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", fontSize: "16px" }}
                          >
                            {expandedAuditId === log.AuditID ? <HiOutlineChevronUp /> : <HiOutlineChevronDown />}
                          </button>
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    </tr>
                    {expandedAuditId === log.AuditID && (
                      <tr>
                        <td colSpan="8" style={{ padding: "16px 24px", background: "var(--bg)" }}>
                          {renderJsonDiff(log.OldValues, log.NewValues)}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline View */}
        {auditViewMode === "timeline" && (
          <div style={{ position: "relative", paddingLeft: "32px" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: "14px", top: 0, bottom: 0, width: "2px", background: "var(--border-color)" }} />
            {auditLogs.length === 0 ? (
              <div className="card" style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>No audit entries found</div>
            ) : auditLogs.map((log, idx) => (
              <div key={log.AuditID} className="animate-fade-in" style={{ marginBottom: "16px", position: "relative", animationDelay: `${idx * 0.05}s` }}>
                {/* Timeline dot */}
                <div style={{
                  position: "absolute", left: "-25px", top: "16px", width: "12px", height: "12px",
                  borderRadius: "50%", background: getAuditActionColor(log.Action),
                  border: "2px solid var(--card-bg)", zIndex: 1,
                  boxShadow: `0 0 8px ${getAuditActionColor(log.Action)}40`,
                }} />
                <div className="card" style={{ padding: "16px", transition: "transform 0.2s ease" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        padding: "3px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                        background: `${getAuditActionColor(log.Action)}20`,
                        color: getAuditActionColor(log.Action),
                        border: `1px solid ${getAuditActionColor(log.Action)}40`,
                      }}>{log.Action}</span>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{getCategoryIcon(log.Category)} {log.Category}</span>
                      <span style={{
                        padding: "2px 8px", borderRadius: "4px", fontSize: "10px", fontWeight: 600,
                        background: log.ActorType === "admin" ? "rgba(167, 139, 250, 0.15)" : log.ActorType === "system" ? "rgba(148, 163, 184, 0.15)" : "rgba(96, 165, 250, 0.15)",
                        color: log.ActorType === "admin" ? "#a78bfa" : log.ActorType === "system" ? "#94a3b8" : "#60a5fa",
                      }}>{log.ActorType}: {log.ActorID || "—"}</span>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatDate(log.Timestamp)}</span>
                  </div>
                  <p style={{ fontSize: "13px", margin: "4px 0 0 0", color: "var(--text-primary)" }}>{log.Description}</p>
                  {log.IPAddress && <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 0 0", fontFamily: "monospace" }}>IP: {log.IPAddress}</p>}
                  {(log.OldValues || log.NewValues) && (
                    <div style={{ marginTop: "12px", borderTop: "1px solid var(--border-color)", paddingTop: "12px" }}>
                      {renderJsonDiff(log.OldValues, log.NewValues)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {auditTotalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "24px" }}>
            <button
              className="btn btn-secondary"
              disabled={auditPage <= 1}
              onClick={() => { setAuditPage(auditPage - 1); fetchAuditLogs(auditPage - 1); }}
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >Previous</button>
            <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              Page {auditPage} of {auditTotalPages}
            </span>
            <button
              className="btn btn-secondary"
              disabled={auditPage >= auditTotalPages}
              onClick={() => { setAuditPage(auditPage + 1); fetchAuditLogs(auditPage + 1); }}
              style={{ fontSize: "13px", padding: "8px 16px" }}
            >Next</button>
          </div>
        )}
      </div>
    );
  };

  const adminLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/admin/login");
  };

  // ── Sidebar Navigation Items ──────────────────────────────
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <HiOutlineChartBar />, permission: "view_dashboard" },
    { id: "loans", label: "Loan Applications", icon: <HiOutlineCreditCard />, permission: "view_loans" },
    { id: "deposit", label: "Deposit Money", icon: <HiOutlineCash />, permission: "deposit_money" },
    { id: "approvals", label: "Maker-Checker Queue", icon: <HiOutlineShieldCheck />, permission: "deposit_money" },
    { id: "verify", label: "Verify Accounts", icon: <HiOutlineShieldCheck />, permission: "verify_accounts" },
    { id: "customers", label: "Customer Directory", icon: <HiOutlineUsers />, permission: "view_customers" },
    { id: "ledger", label: "General Ledger", icon: <HiOutlineLibrary />, permission: "view_ledger" },
    { id: "disputes", label: "Disputes Center", icon: <HiOutlineExclamationCircle />, permission: "view_disputes" },
    { id: "cases", label: "Investigation Cases", icon: <HiOutlineShieldCheck />, permission: "view_disputes" },
    { id: "audit", label: "Audit Trail", icon: <HiOutlineClipboardList />, permission: "view_audit" },
    { id: "support", label: "Help Tickets", icon: <HiOutlineQuestionMarkCircle />, permission: "view_tickets" },
    { id: "admins", label: "Admin Management", icon: <HiOutlineUsers />, permission: "manage_admins" }, // fallback to roles
    { id: "settings", label: "System Settings", icon: <HiOutlineCog />, permission: "manage_settings" },
  ].filter(item => {
    if (item.id === "admins") return hasPermission("manage_admins") || hasPermission("manage_roles");
    return hasPermission(item.permission);
  });

  const getViewTitle = () => {
    const titles = {
      dashboard: "Admin Dashboard",
      loans: "Loan Applications",
      deposit: "Deposit Money",
      approvals: "Maker-Checker Queue",
      verify: "Account Verification",
      customers: "Customer Management",
      ledger: "General Ledger & Double-Entry Journal",
      disputes: "Disputes & Reversals",
      cases: "Fraud Investigation Cases",
      audit: "Audit Trail & Activity Log",
      support: "Support Tickets Reply Center",
      admins: "Admin & Role Management",
      settings: "Global System Settings"
    };
    return titles[activeView] || "Dashboard";
  };

  // ── Views ─────────────────────────────────────────────────
  const renderDashboard = () => (
    <div className="animate-fade-in">
      {stats && (
        <>
          <div className="grid grid-4" style={{ marginBottom: "32px" }}>
            <div className="stat-card stagger-1 animate-fade-in">
              <div className="stat-card-icon blue"><HiOutlineUsers /></div>
              <div className="stat-card-label">Total Customers</div>
              <div className="stat-card-value">{stats.totalCustomers}</div>
              <div className="stat-card-change" style={{ color: "var(--success)" }}>
                {stats.verifiedCustomers} verified
              </div>
            </div>
            <div className="stat-card stagger-2 animate-fade-in">
              <div className="stat-card-icon green">₹</div>
              <div className="stat-card-label">Total Deposits</div>
              <div className="stat-card-value">{formatCurrency(stats.totalBalance)}</div>
            </div>
            <div className="stat-card stagger-3 animate-fade-in">
              <div className="stat-card-icon yellow"><HiOutlineCreditCard /></div>
              <div className="stat-card-label">Pending Loans</div>
              <div className="stat-card-value">{stats.pendingLoans?.count || 0}</div>
              <div className="stat-card-change" style={{ color: "var(--warning)" }}>
                {formatCurrency(stats.pendingLoans?.amount)}
              </div>
            </div>
            <div className="stat-card stagger-4 animate-fade-in">
              <div className="stat-card-icon cyan"><HiOutlineChartBar /></div>
              <div className="stat-card-label">Today's Transactions</div>
              <div className="stat-card-value">{stats.todayTransactions?.count || 0}</div>
              <div className="stat-card-change" style={{ color: "var(--text-muted)" }}>
                {formatCurrency(stats.todayTransactions?.amount)}
              </div>
            </div>
          </div>

          <div className="grid grid-2">
            {/* Recent transactions */}
            <div className="table-container">
              <div className="table-header">
                <span className="table-title">Recent Transactions</span>
              </div>
              {recentTxns.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentTxns.map((txn, i) => {
                      const isCredit = ["Deposit", "Receive", "Loan Approved"].includes(txn.TransactionType);
                      return (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{txn.customerName}</td>
                          <td><span className={`badge ${isCredit ? "badge-success" : "badge-error"}`}>{txn.TransactionType}</span></td>
                          <td style={{ fontWeight: 600, color: isCredit ? "var(--success)" : "var(--error)" }}>
                            {formatCurrency(txn.TransactionAmount)}
                          </td>
                          <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{formatDate(txn.TransactionDate)}</td>
                          <td>{renderStatusBadge(txn.TransactionStatus)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ padding: "30px" }}>
                  <div className="empty-state-text">No recent transactions</div>
                </div>
              )}
            </div>

            {/* New customers */}
            <div className="table-container">
              <div className="table-header">
                <span className="table-title">New Customers</span>
              </div>
              {newCustomers.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newCustomers.map((c, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{c.customerName}</td>
                        <td>{c.AccountType}</td>
                        <td>
                          <span className={`badge ${c.AccountVerify ? "badge-success" : "badge-warning"}`}>
                            {c.AccountVerify ? "Verified" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ padding: "30px" }}>
                  <div className="empty-state-text">No new customers</div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderLoans = () => (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
          Pending Applications ({loanApplications.length})
        </h3>
        <div style={{ display: "flex", gap: "12px" }}>
          <button
            className="btn btn-warning btn-sm"
            onClick={handleApplyLateFees}
            disabled={processing}
          >
            Apply Late Fees
          </button>
          <button className="btn btn-secondary btn-sm" onClick={fetchLoans}>
            <HiOutlineRefresh /> Refresh
          </button>
        </div>
      </div>

      {loanApplications.length > 0 ? (
        loanApplications.map((loan) => (
          <div className="loan-card" key={loan.LoanID}>
            <div className="loan-card-header">
              <div>
                <div className="loan-card-amount">{formatCurrency(loan.LoanAmount)}</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "4px" }}>
                  {loan.customerName} • {loan.AccountNumber}
                </div>
              </div>
              <span className="badge badge-warning">{loan.ApprovalStatus}</span>
            </div>

            <div className="loan-card-details" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
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
              <div className="loan-detail-item">
                <div className="loan-detail-label">Balance</div>
                <div className="loan-detail-value">{formatCurrency(loan.Balance)}</div>
              </div>
              <div className="loan-detail-item">
                <div className="loan-detail-label">Applied</div>
                <div className="loan-detail-value" style={{ fontSize: "12px" }}>
                  {formatDate(loan.AppliedDate)}
                </div>
              </div>
            </div>

            <div style={{ marginTop: "16px", display: "flex", gap: "12px", alignItems: "center" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Remarks (optional)"
                style={{ flex: 1, padding: "8px 12px" }}
                value={loanRemarks[loan.LoanID] || ""}
                onChange={(e) => setLoanRemarks((p) => ({ ...p, [loan.LoanID]: e.target.value }))}
              />
              <button
                className="btn btn-success btn-sm"
                onClick={() => handleLoanAction(loan.LoanID, "Approved")}
                disabled={processing}
              >
                <HiOutlineCheck /> Approve
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleLoanAction(loan.LoanID, "Denied")}
                disabled={processing}
              >
                <HiOutlineX /> Deny
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No pending applications</div>
          <div className="empty-state-text">All loan applications have been processed.</div>
        </div>
      )}
    </div>
  );

  const renderDeposit = () => (
    <div className="animate-fade-in" style={{ maxWidth: "500px" }}>
      <div className="form-card">
        <h3 className="form-card-title"><HiOutlineCash /> Deposit Money</h3>

        <div className="form-group" style={{ marginBottom: "12px" }}>
          <label>Account Number</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              className="form-input"
              placeholder="Enter account number"
              value={depositAccountNumber}
              onChange={(e) => { setDepositAccountNumber(e.target.value); setDepositAccountName(""); }}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary" onClick={handleVerifyDeposit}>
              Verify
            </button>
          </div>
        </div>

        {depositAccountName && (
          <div className="auth-success" style={{ marginBottom: "16px" }}>
            Account Holder: <strong>{depositAccountName}</strong>
          </div>
        )}

        <div className="form-group" style={{ marginBottom: "20px" }}>
          <label>Deposit Amount (₹)</label>
          <input
            type="number"
            className="form-input"
            placeholder="Enter amount"
            value={depositAmount}
            onChange={(e) => setDepositAmount(e.target.value)}
            min="1"
          />
        </div>

        {parseFloat(depositAmount) > 500000 && (
          <div className="auth-error" style={{ marginBottom: "20px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid var(--error)", color: "var(--error)" }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <HiOutlineExclamationCircle size={24} />
              <strong style={{ fontSize: '1.1rem' }}>Warning: High Value Transaction</strong>
            </div>
            <p style={{ margin: "0 0 12px 0", fontSize: "0.9rem" }}>This deposit exceeds ₹5,00,000. It will require a Maker-Checker approval workflow and an OTP for clearance. Please type <strong>CONFIRM</strong> to proceed.</p>
            <input
              type="text"
              className="form-input"
              placeholder="TYPE CONFIRM TO CONTINUE"
              value={depositConfirmText}
              onChange={(e) => setDepositConfirmText(e.target.value)}
              style={{ textTransform: "uppercase", borderColor: "var(--error)" }}
            />
          </div>
        )}

        <button
          className="btn btn-success btn-block btn-lg"
          onClick={handleDeposit}
          disabled={processing || !depositAccountName || !depositAmount || (parseFloat(depositAmount) > 500000 && depositConfirmText.toUpperCase() !== "CONFIRM")}
        >
          {processing ? "Processing..." : parseFloat(depositAmount) > 500000 ? "Submit for Approval" : "Process Deposit"}
        </button>
      </div>
    </div>
  );

  const renderApprovals = () => (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Pending Deposits</h2>
        <button className="btn btn-secondary btn-sm" onClick={fetchPendingDeposits} disabled={processing}>
          <HiOutlineRefresh className={processing ? "spin" : ""} /> Refresh
        </button>
      </div>

      {pendingDeposits.length > 0 ? (
        <div className="grid grid-2">
          {pendingDeposits.map((dep) => (
            <div key={dep.DepositID} className="form-card" style={{ padding: "20px", position: "relative" }}>
              {dep.DepositAmount > 1000000 && (
                <div style={{ position: "absolute", top: "12px", right: "12px" }} className="badge badge-error">High Risk</div>
              )}
              
              <h3 className="form-card-title" style={{ marginBottom: "8px", fontSize: "1.3rem" }}>
                <span style={{ color: "var(--success)" }}>{formatCurrency(dep.DepositAmount)}</span>
              </h3>
              
              <div style={{ fontSize: "0.95rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                <div><strong>Account:</strong> {dep.AccountNumber} ({dep.customerName})</div>
                <div><strong>Maker:</strong> {dep.MakerName || "System"}</div>
                <div><strong>Time:</strong> {new Date(dep.DepositTime).toLocaleString()}</div>
                <div><strong>Approvals:</strong> {dep.CurrentApprovals} / {dep.ApprovalRequiredCount}</div>
              </div>

              {otpRequiredFor === dep.DepositID ? (
                <div className="form-group" style={{ marginBottom: "16px" }}>
                  <label>Enter Admin OTP sent to your notifications</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="6-digit OTP" 
                    maxLength="6"
                    value={approvalOtp[dep.DepositID] || ""}
                    onChange={(e) => setApprovalOtp(prev => ({...prev, [dep.DepositID]: e.target.value}))}
                  />
                </div>
              ) : null}

              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  className="btn btn-success btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => handleApproveDeposit(dep.DepositID)}
                  disabled={processing || (otpRequiredFor === dep.DepositID && (!approvalOtp[dep.DepositID] || approvalOtp[dep.DepositID].length < 6))}
                >
                  <HiOutlineCheck /> {otpRequiredFor === dep.DepositID ? "Verify & Approve" : "Approve"}
                </button>
                {otpRequiredFor !== dep.DepositID && (
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleRejectDeposit(dep.DepositID)}
                    disabled={processing}
                  >
                    <HiOutlineX /> Reject
                  </button>
                )}
                {otpRequiredFor === dep.DepositID && (
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setOtpRequiredFor(null)}
                    disabled={processing}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">No pending approvals</div>
          <div className="empty-state-text">All deposits have been reviewed.</div>
        </div>
      )}
    </div>
  );

  const renderVerify = () => (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 700 }}>
          Unverified Accounts ({unverifiedAccounts.length})
        </h3>
        <button className="btn btn-secondary btn-sm" onClick={fetchUnverified}>
          <HiOutlineRefresh /> Refresh
        </button>
      </div>

      {unverifiedAccounts.length > 0 ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account Number</th>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Registered</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {unverifiedAccounts.map((account) => (
                <tr key={account.AccountNumber}>
                  <td style={{ fontWeight: 600 }}>{account.AccountNumber}</td>
                  <td>{account.customerName}</td>
                  <td>{account.customerEmail}</td>
                  <td>{account.customerPhone}</td>
                  <td><span className="badge badge-info">{account.AccountType}</span></td>
                  <td style={{ fontSize: "12px", color: "var(--text-muted)" }}>{formatDate(account.createdAt)}</td>
                  <td>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleVerifyAccount(account.AccountNumber)}
                    >
                      <HiOutlineShieldCheck /> Verify
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <div className="empty-state-title">All accounts verified</div>
          <div className="empty-state-text">No pending verifications.</div>
        </div>
      )}
    </div>
  );

  const renderCustomers = () => (
    <div className="animate-fade-in">
      <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
        <div className="search-input-wrapper" style={{ flex: 1 }}>
          <span className="search-icon"><HiOutlineSearch /></span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by customer name..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearchCustomer()}
          />
        </div>
        <button className="btn btn-primary" onClick={handleSearchCustomer}>
          Search
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Balance</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((cust) => (
                <tr key={cust.AccountNumber}>
                  <td style={{ fontWeight: 600 }}>{cust.AccountNumber}</td>
                  <td>{cust.customerName}</td>
                  <td>{cust.customerPhone}</td>
                  <td>{cust.customerEmail}</td>
                  <td style={{ fontWeight: 600 }}>{formatCurrency(cust.Balance)}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span className={`badge ${cust.AccountVerify ? "badge-success" : "badge-warning"}`}>
                        {cust.AccountVerify ? "Verified" : "Pending"}
                      </span>
                      <span className={`badge ${cust.isActive !== 0 ? "badge-success" : "badge-error"}`}>
                        {cust.isActive !== 0 ? "Active" : "Blocked"}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditModal({ ...cust })}>
                        <HiOutlinePencil /> Edit
                      </button>
                      <button
                        className={`btn ${cust.isActive !== 0 ? "btn-danger" : "btn-success"} btn-sm`}
                        onClick={() => handleToggleBlock(cust.AccountNumber)}
                        disabled={processing}
                      >
                        {cust.isActive !== 0 ? "Block" : "Unblock"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {searchResults.length === 0 && searchName && (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <div className="empty-state-title">Search for customers</div>
          <div className="empty-state-text">Enter a name and click Search.</div>
        </div>
      )}

      {/* Edit Modal */}
      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(null)}>
          <div className="modal-card animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Customer</h3>
              <button className="modal-close" onClick={() => setEditModal(null)}>
                <HiOutlineX />
              </button>
            </div>
            <form className="modal-body" onSubmit={handleUpdateCustomer}>
              <div className="form-group">
                <label>Name</label>
                <input type="text" className="form-input" value={editModal.customerName}
                  onChange={(e) => setEditModal((p) => ({ ...p, customerName: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input type="tel" className="form-input" value={editModal.customerPhone}
                  onChange={(e) => setEditModal((p) => ({ ...p, customerPhone: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" className="form-input" value={editModal.customerEmail}
                  onChange={(e) => setEditModal((p) => ({ ...p, customerEmail: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Address</label>
                <input type="text" className="form-input" value={editModal.customerAddress || ""}
                  onChange={(e) => setEditModal((p) => ({ ...p, customerAddress: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>City</label>
                <input type="text" className="form-input" value={editModal.customerCity || ""}
                  onChange={(e) => setEditModal((p) => ({ ...p, customerCity: e.target.value }))} />
              </div>
              <div className="modal-footer" style={{ marginTop: "8px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={processing}>
                  {processing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  // ── Main Render ───────────────────────────────────────────
  return (
    <div className="app-layout">
      {/* Admin Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
            <HiOutlineLibrary />
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span>Admin Panel</span>
            <span style={{ fontSize: "11px", color: "#f59e0b", fontWeight: "normal", marginTop: "2px" }}>
              {adminRole}
            </span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Management</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`sidebar-link ${activeView === item.id ? "active" : ""}`}
              onClick={() => { setActiveView(item.id); setSidebarOpen(false); }}
            >
              <span className="icon">{item.icon}</span>
              {item.label}
              {item.id === "loans" && loanApplications.length > 0 && (
                <span className="notification-badge" style={{ position: "static", marginLeft: "auto" }}>
                  {loanApplications.length}
                </span>
              )}
            </button>
          ))}

          <div style={{ flex: 1 }} />

          <button className="sidebar-link" onClick={adminLogout}>
            <span className="icon"><HiOutlineLogout /></span>
            Logout
          </button>
        </nav>
      </aside>

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
          </div>
        </div>

        <div className="page-content">
          {activeView === "dashboard" && renderDashboard()}
          {activeView === "loans" && renderLoans()}
          {activeView === "deposit" && renderDeposit()}
          {activeView === "approvals" && renderApprovals()}
          {activeView === "verify" && renderVerify()}
          {activeView === "customers" && renderCustomers()}
          {activeView === "disputes" && renderDisputes()}
          {activeView === "cases" && renderInvestigationCases()}
          {activeView === "audit" && renderAuditTrail()}
          {activeView === "support" && renderSupport()}
          {activeView === "ledger" && renderLedger()}
          {activeView === "admins" && <AdminManagement hasPermission={hasPermission} />}
          {activeView === "settings" && <AdminSettings hasPermission={hasPermission} />}
        </div>
      </div>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 99 }}
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};

export default Admin;
