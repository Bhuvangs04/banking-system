import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { HiOutlineEye, HiOutlineEyeOff, HiOutlineLibrary } from "react-icons/hi";
import api from "../utlis/api";

function LoginForm({ toggleForm }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [formData, setFormData] = useState({ accountNumber: "", password: "" });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!formData.accountNumber || !formData.password) {
      toast.error("Please fill out all required fields.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.post("/customer/login", {
        accountNumber: formData.accountNumber,
        password: formData.password,
      });
      localStorage.setItem("jwtToken", response.data.token);
      if (response.data.refreshToken) {
        localStorage.setItem("refreshToken", response.data.refreshToken);
      }
      toast.success(`Welcome back, ${response.data.customerName || ""}!`);
      navigate("/home");
    } catch (error) {
      toast.error(error.response?.data?.error || "Invalid account number or password.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-card animate-scale-in">
      <div className="auth-logo">
        <div className="auth-logo-icon">
          <HiOutlineLibrary />
        </div>
        <h1>SecureBank</h1>
      </div>
      <p className="auth-subtitle">Sign in to access your account</p>

      <form className="auth-form" onSubmit={handleLogin}>
        <div className="form-group">
          <label>Account Number</label>
          <input
            type="text"
            name="accountNumber"
            id="login-account-number"
            className="form-input"
            placeholder="Enter your 12-digit account number"
            value={formData.accountNumber}
            onChange={handleInputChange}
            autoComplete="username"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <div style={{ position: "relative" }}>
            <input
              type={passwordVisible ? "text" : "password"}
              name="password"
              id="login-password"
              className="form-input"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleInputChange}
              style={{ paddingRight: "44px" }}
              autoComplete="current-password"
            />
            <span
              className="form-input-icon"
              onClick={() => setPasswordVisible(!passwordVisible)}
              role="button"
              aria-label={passwordVisible ? "Hide password" : "Show password"}
            >
              {passwordVisible ? <HiOutlineEyeOff size={18} /> : <HiOutlineEye size={18} />}
            </span>
          </div>
        </div>

        <button
          type="submit"
          id="login-submit"
          className="btn btn-primary btn-block btn-lg"
          disabled={isLoading}
        >
          {isLoading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="auth-footer">
        Need a new bank account?{" "}
        <a
          href="#signup"
          onClick={(e) => {
            e.preventDefault();
            toggleForm();
          }}
        >
          Create Account
        </a>
      </div>
    </div>
  );
}

export default LoginForm;
