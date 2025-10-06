import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";
import Lottie from "react-lottie-player";
import loadingAnimation from "./Animation - 1729331805975.json"; // Update with correct path

function SignupForm({ toggleForm }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
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
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const navigate = useNavigate();

  const handlePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleConfirmPasswordVisibility = () => {
    setConfirmPasswordVisible(!confirmPasswordVisible);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setErrorMessage("Passwords do not match.");
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
      setErrorMessage("Please fill out all fields.");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(
        "http://localhost:8081/customer/createAccount",
        {
          customerName: formData.username,
          AccountType: formData.accountType,
          customerPhone: formData.phoneNumber,
          customerEmail: formData.email,
          customerAddress: formData.address,
          customerCity: formData.city,
          CustomerPassword: formData.password,
        }
      );
      const { token } = response.data;
      localStorage.setItem("jwtToken", token);
      setSuccessMessage("Your account is being created. Please wait...");
      setTimeout(() => {
        navigate("/home");
      }, 10000);
    } catch (error) {
      setErrorMessage("Sign-up failed. Please try again.");
    } finally {
      setTimeout(() => {
        setLoading(false);
      }, 10000);
    }
  };

  return (
    <section>
      <div className="user signupBx">
        <div className="formBx">
          {loading ? (
            <div className="loading-screen">
              <p>{successMessage}</p>
              <Lottie
                loop
                animationData={loadingAnimation}
                play
                style={{ width: 300, height: 300 }}
              />
            </div>
          ) : (
            <form onSubmit={handleSignUp}>
              <h2>Create an account</h2>
              <input
                type="text"
                name="username"
                placeholder="Username"
                value={formData.username}
                onChange={handleInputChange}
                required
              />
              <select
                name="accountType"
                value={formData.accountType}
                onChange={handleInputChange}
                className="input-field"
              >
                <option value="" disabled>
                  Select Account Type
                </option>
                <option value="Savings">Savings</option>
                <option value="Current">Current</option>
              </select>

              <input
                type="tel"
                name="phoneNumber"
                placeholder="Phone Number"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                maxLength="10"
                required
              />
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={formData.email}
                onChange={handleInputChange}
                required
              />
              <input
                type="text"
                name="address"
                placeholder="Address"
                value={formData.address}
                onChange={handleInputChange}
                required
              />
              <input
                type="text"
                name="city"
                placeholder="City"
                value={formData.city}
                onChange={handleInputChange}
                required
              />
              <input
                type={passwordVisible ? "text" : "password"}
                name="password"
                placeholder="Create Password"
                value={formData.password}
                onChange={(e) => handleInputChange(e)}
              />
              <input
                type={confirmPasswordVisible ? "text" : "password"}
                name="confirmPassword"
                placeholder="Confirm Password"
                value={formData.confirmPassword}
                onChange={(e) => handleInputChange(e)}
              />
              <div>
                <input
                  type="button"
                  value={passwordVisible ? "Hide Password" : "Show Password"}
                  onClick={handlePasswordVisibility}
                />
                <input
                  type="button"
                  value={
                    confirmPasswordVisible
                      ? "Hide Confirm Password"
                      : "Show Confirm Password"
                  }
                  onClick={handleConfirmPasswordVisibility}
                />
              </div>
              {errorMessage && <p className="error">{errorMessage}</p>}
              <input type="submit" value="Sign Up" />
              <p className="signup">
                Already have an account?{" "}
                <a href="#" onClick={toggleForm}>
                  Sign in.
                </a>
              </p>
            </form>
          )}
        </div>
        <div className="imgBx">
          <img
            src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1470&q=80"
            alt="Signup"
          />
        </div>
      </div>
    </section>
  );
}

export default SignupForm;
