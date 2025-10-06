import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../App.css";

function LoginForm({ toggleForm }) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [formData, setFormData] = useState({
    accountNumber: "",
    password: "",
  });
  const [errorMessage, setErrorMessage] = useState("");

  const navigate = useNavigate();

  const handlePasswordVisibility = () => {
    setPasswordVisible(!passwordVisible);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!formData.accountNumber || !formData.password) {
      setErrorMessage("Please fill out all required fields.");
      return;
    }
    try {
      console.log("Login Request:", formData);
      const response = await axios.post(
        "http://localhost:8081/customer/login",
        {
          accountNumber: formData.accountNumber,
          password: formData.password,
        }
      );
      console.log("Login successful", response.data);
      const { token } = response.data;
      localStorage.setItem("jwtToken", token);
      navigate("/home");
    } catch (error) {
      console.error(
        "Login failed",
        error.response ? error.response.data : error.message
      );
      setErrorMessage("Invalid account number or password.");
    }
  };

  return (
    <section>
      <div className="user signinBx">
        <div className="imgBx">
          <img
            src="https://cdn.dribbble.com/users/1783302/screenshots/14785073/bank_logo-01_4x.jpg"
            alt="Login"
            style={{ width: "950px", height: "750px", objectFit: "cover" }}
          />
        </div>

        <div className="formBx">
          <form onSubmit={handleLogin}>
            <h2>Log In</h2>
            <input
              type="text"
              name="accountNumber"
              placeholder="Account Number"
              value={formData.accountNumber}
              onChange={handleInputChange}
            />
            <input
              type={passwordVisible ? "text" : "password"}
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleInputChange}
            />
            <input
              type="button"
              value={passwordVisible ? "Hide" : "Show"}
              onClick={handlePasswordVisibility}
            />
            {errorMessage && <p className="error">{errorMessage}</p>}
            <input type="submit" value="Login" />
            <p className="signup">
              Need a new bank account?{" "}
              <a href="#" onClick={toggleForm}>
                Open
              </a>
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

export default LoginForm;
