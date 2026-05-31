import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineLibrary } from "react-icons/hi";
import api from "../utlis/api";

function SignupForm({ toggleForm }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: "",
    accountType: "",
    phoneNumber: "",
    email: "",
    address: "",
    city: "",
    password: "",
    confirmPassword: "",
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

  const handleSignUp = async (e) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    if (
      !formData.username ||
      !formData.accountType ||
      !formData.phoneNumber ||
      !formData.email ||
      !formData.address ||
      !formData.city ||
      !formData.password
    ) {
      toast.error("Please fill out all fields.");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await api.post("/customer/createAccount", {
        customerName: formData.username,
        AccountType: formData.accountType,
        customerPhone: formData.phoneNumber,
        customerEmail: formData.email,
        customerAddress: formData.address,
        customerCity: formData.city,
        CustomerPassword: formData.password,
      });

      localStorage.setItem("jwtToken", response.data.token);
      if (response.data.refreshToken) {
        localStorage.setItem("refreshToken", response.data.refreshToken);
      }

      toast.success(
        `Account created! Your account number is ${response.data.accountNumber}. Please wait for admin verification.`
      );
      setTimeout(() => navigate("/home"), 2000);
    } catch (error) {
      toast.error(error.response?.data?.error || "Sign-up failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const strength = getPasswordStrength();

  return (
    <div className="auth-card animate-scale-in" style={{ maxWidth: "520px" }}>
      <div className="auth-logo">
        <div className="auth-logo-icon">
          <HiOutlineLibrary />
        </div>
        <h1>SecureBank</h1>
      </div>
      <p className="auth-subtitle">Create your bank account</p>

      <form className="auth-form" onSubmit={handleSignUp}>
        <div className="form-group">
          <label>Full Name</label>
          <input
            type="text"
            name="username"
            id="signup-name"
            className="form-input"
            placeholder="Enter your full name"
            value={formData.username}
            onChange={handleInputChange}
          />
        </div>

        <div className="form-group">
          <label>Account Type</label>
          <select
            name="accountType"
            id="signup-account-type"
            className="form-select"
            value={formData.accountType}
            onChange={handleInputChange}
          >
            <option value="" disabled>
              Select Account Type
            </option>
            <option value="Savings">Savings</option>
            <option value="Current">Current</option>
          </select>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Phone Number</label>
            <input
              type="tel"
              name="phoneNumber"
              id="signup-phone"
              className="form-input"
              placeholder="10-digit phone"
              value={formData.phoneNumber}
              onChange={handleInputChange}
              maxLength="15"
            />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              id="signup-email"
              className="form-input"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Address</label>
            <input
              type="text"
              name="address"
              id="signup-address"
              className="form-input"
              placeholder="Street address"
              value={formData.address}
              onChange={handleInputChange}
            />
          </div>
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              name="city"
              id="signup-city"
              className="form-input"
              placeholder="Your city"
              value={formData.city}
              onChange={handleInputChange}
            />
          </div>
        </div>

        <div className="form-group">
          <label>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={passwordVisible ? "text" : "password"}
              name="password"
              id="signup-password"
              className="form-input"
              placeholder="Min 8 characters"
              value={formData.password}
              onChange={handleInputChange}
              style={{ paddingRight: "44px" }}
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
              <span style={{ fontSize: "11px", color: strength.color, marginTop: "4px", display: "block" }}>
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
              id="signup-confirm-password"
              className="form-input"
              placeholder="Re-enter password"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              style={{ paddingRight: "44px" }}
            />
            <span
              className="form-input-icon"
              onClick={() => setConfirmPasswordVisible(!confirmPasswordVisible)}
            >
              {confirmPasswordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
            </span>
          </div>
          {formData.confirmPassword && formData.password !== formData.confirmPassword && (
            <span style={{ fontSize: "12px", color: "var(--error)", marginTop: "4px", display: "block" }}>
              Passwords don't match
            </span>
          )}
        </div>

        <button
          type="submit"
          id="signup-submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={isLoading}
        >
          {isLoading ? "Creating Account..." : "Create Account"}
        </button>
      </form>

      <div className="auth-footer">
        Already have an account?{" "}
        <a
          href="#login"
          onClick={(e) => {
            e.preventDefault();
            toggleForm();
          }}
        >
          Sign In
        </a>
      </div>
    </div>
  );
}

export default SignupForm;
