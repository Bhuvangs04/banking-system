import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineShieldCheck } from "react-icons/hi";
import { adminApi } from "../utlis/api";

const AdminRegister = () => {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
    fullName: "",
    registrationKey: "",
  });
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const getPasswordStrength = () => {
    const p = formData.password;
    if (!p) return { level: 0, label: "", color: "" };
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { level: 1, label: "Weak", color: "var(--error)" };
    if (score === 2) return { level: 2, label: "Fair", color: "var(--warning)" };
    if (score === 3) return { level: 3, label: "Good", color: "var(--accent)" };
    return { level: 4, label: "Strong", color: "var(--success)" };
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (
      !formData.username ||
      !formData.email ||
      !formData.password ||
      !formData.fullName ||
      !formData.registrationKey
    ) {
      toast.error("Please fill out all fields.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await adminApi.post("/admin/register", {
        username: formData.username,
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        registrationKey: formData.registrationKey,
      });

      localStorage.setItem("adminToken", response.data.token);
      localStorage.setItem("adminPermissions", JSON.stringify(response.data.permissions || []));
      localStorage.setItem("adminRole", response.data.role || "Unknown");
      toast.success(response.data.message || "Admin account registered successfully!");
      navigate("/admin");
    } catch (err) {
      toast.error(err.response?.data?.error || "Registration failed. Please check the secret key.");
    } finally {
      setIsLoading(false);
    }
  };

  const strength = getPasswordStrength();

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card animate-scale-in" style={{ maxWidth: "520px" }}>
          <div className="auth-logo">
            <div
              className="auth-logo-icon"
              style={{ background: "linear-gradient(135deg, #f59e0b, #ef4444)" }}
            >
              <HiOutlineShieldCheck />
            </div>
            <h1>Admin Registration</h1>
          </div>
          <p className="auth-subtitle">Create a new administrator account</p>

          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label>Full Name</label>
              <input
                type="text"
                name="fullName"
                id="admin-register-fullname"
                className="form-input"
                placeholder="Enter full name"
                value={formData.fullName}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  name="email"
                  id="admin-register-email"
                  className="form-input"
                  placeholder="admin@securebank.com"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  id="admin-register-username"
                  className="form-input"
                  placeholder="admin_username"
                  value={formData.username}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Admin Registration Key</label>
              <input
                type="password"
                name="registrationKey"
                id="admin-register-key"
                className="form-input"
                placeholder="Enter secret registration key"
                value={formData.registrationKey}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={passwordVisible ? "text" : "password"}
                    name="password"
                    id="admin-register-password"
                    className="form-input"
                    placeholder="Min 8 characters"
                    value={formData.password}
                    onChange={handleInputChange}
                    style={{ paddingRight: "44px" }}
                    required
                  />
                  <span
                    className="form-input-icon"
                    onClick={() => setPasswordVisible(!passwordVisible)}
                  >
                    {passwordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                  </span>
                </div>
                {formData.password && (
                  <div style={{ marginTop: "8px" }}>
                    <div
                      style={{
                        height: "4px",
                        borderRadius: "2px",
                        background: "var(--border)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${strength.level * 25}%`,
                          height: "100%",
                          background: strength.color,
                          transition: "all 0.3s ease",
                          borderRadius: "2px",
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: "11px",
                        color: strength.color,
                        marginTop: "4px",
                        display: "block",
                      }}
                    >
                      {strength.label}
                    </span>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label>Confirm Password</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={confirmPasswordVisible ? "text" : "password"}
                    name="confirmPassword"
                    id="admin-register-confirm"
                    className="form-input"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    style={{ paddingRight: "44px" }}
                    required
                  />
                  <span
                    className="form-input-icon"
                    onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
                  >
                    {confirmPasswordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
                  </span>
                </div>
                {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--error)",
                      marginTop: "4px",
                      display: "block",
                    }}
                  >
                    Passwords don't match
                  </span>
                )}
              </div>
            </div>

            <button
              type="submit"
              id="admin-register-submit"
              className="btn btn-primary btn-block btn-lg"
              style={{
                background: "linear-gradient(135deg, #f59e0b, #ef4444)",
                border: "none",
              }}
              disabled={isLoading}
            >
              {isLoading ? "Registering..." : "Register Admin"}
            </button>
          </form>

          <div className="auth-footer">
            Already have an admin account?{" "}
            <a
              href="/admin/login"
              onClick={(e) => {
                e.preventDefault();
                navigate("/admin/login");
              }}
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminRegister;
