import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineShieldCheck } from "react-icons/hi";
import { adminApi } from "../utlis/api";

const AdminLogin = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error("Please enter both username and password.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await adminApi.post("/admin/login", { username, password });
      localStorage.setItem("adminToken", response.data.token);
      localStorage.setItem("adminPermissions", JSON.stringify(response.data.permissions || []));
      localStorage.setItem("adminRole", response.data.role || "Unknown");
      toast.success(`Welcome, ${response.data.admin?.fullName || username}!`);
      navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.error || "Invalid credentials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card animate-scale-in">
          <div className="auth-logo">
            <div className="auth-logo-icon" style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}>
              <HiOutlineShieldCheck />
            </div>
            <h1>Admin Portal</h1>
          </div>
          <p className="auth-subtitle">Sign in to the management console</p>

          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>Username</label>
              <input
                type="text"
                id="admin-username"
                className="form-input"
                placeholder="Enter admin username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <div style={{ position: "relative" }}>
                <input
                  type={passwordVisible ? "text" : "password"}
                  id="admin-password"
                  className="form-input"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ paddingRight: "44px" }}
                  autoComplete="current-password"
                />
                <span
                  className="form-input-icon"
                  onClick={() => setPasswordVisible(!passwordVisible)}
                >
                  {passwordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                </span>
              </div>
            </div>

            <button
              type="submit"
              id="admin-login-submit"
              className="btn btn-primary btn-block btn-lg"
              disabled={isLoading}
            >
              {isLoading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <div className="auth-footer" style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
            <a href="/" onClick={(e) => { e.preventDefault(); navigate("/"); }}>
              ← Back to Customer Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
