import React from "react";
import { useNavigate } from "react-router-dom";

const Unauthorized = () => {
  const navigate = useNavigate();

  return (
    <div className="error-page">
      <div className="error-code">403</div>
      <h2 className="error-title">Unauthorized Access</h2>
      <p className="error-text">
        You do not have permission to view this page. Please sign in first.
      </p>
      <button className="btn btn-primary btn-lg" onClick={() => navigate("/")}>
        Sign In
      </button>
    </div>
  );
};

export default Unauthorized;
