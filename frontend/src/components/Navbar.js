import React from "react";
import { useNavigate } from "react-router-dom";
import {
  HiOutlineHome,
  HiOutlineSwitchHorizontal,
  HiOutlineCash,
  HiOutlineCreditCard,
  HiOutlineClock,
  HiOutlineDocumentDownload,
  HiOutlineUser,
  HiOutlineBell,
  HiOutlineLogout,
  HiOutlineLibrary,
  HiOutlineQuestionMarkCircle,
  HiOutlineExclamationCircle,
} from "react-icons/hi";

function Navbar({ activeView, setActiveView, profile, unreadCount, sidebarOpen, onCloseSidebar }) {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("jwtToken");
    localStorage.removeItem("refreshToken");
    navigate("/");
  };

  const handleNavClick = (viewId) => {
    setActiveView(viewId);
    if (onCloseSidebar) onCloseSidebar();
  };

  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: <HiOutlineHome /> },
    { id: "transfer", label: "Transfer", icon: <HiOutlineSwitchHorizontal /> },
    { id: "withdraw", label: "Withdraw", icon: <HiOutlineCash /> },
    { id: "loans", label: "Loans", icon: <HiOutlineCreditCard /> },
    { id: "history", label: "History", icon: <HiOutlineClock /> },
    { id: "reports", label: "Statements", icon: <HiOutlineDocumentDownload /> },
  ];

  const accountItems = [
    { id: "profile", label: "Profile", icon: <HiOutlineUser /> },
    { id: "notifications", label: "Notifications", icon: <HiOutlineBell />, badge: unreadCount },
    { id: "support", label: "Help & Support", icon: <HiOutlineQuestionMarkCircle /> },
    { id: "disputes", label: "Disputes Center", icon: <HiOutlineExclamationCircle /> },
  ];

  return (
    <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">
          <HiOutlineLibrary />
        </div>
        <span>SecureBank</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-title">Main Menu</div>
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${activeView === item.id ? "active" : ""}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="sidebar-section-title">Account</div>
        {accountItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-link ${activeView === item.id ? "active" : ""}`}
            onClick={() => handleNavClick(item.id)}
          >
            <span className="icon">{item.icon}</span>
            {item.label}
            {item.badge > 0 && (
              <span
                className="notification-badge"
                style={{ position: "static", marginLeft: "auto" }}
              >
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </button>
        ))}

        <div style={{ flex: 1 }} />

        <button className="sidebar-link" onClick={logout}>
          <span className="icon">
            <HiOutlineLogout />
          </span>
          Logout
        </button>
      </nav>

      {profile && (
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {profile.customerName?.[0]?.toUpperCase() || "U"}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{profile.customerName || "User"}</div>
              <div className="sidebar-user-account">
                {profile.AccountNumber || ""}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

export default Navbar;
