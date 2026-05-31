import React from "react";
import { useNavigate } from "react-router-dom";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="error-page">
      <div className="error-code">404</div>
      <h2 className="error-title">Page Not Found</h2>
      <p className="error-text">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <button className="btn btn-primary btn-lg" onClick={() => navigate("/")}>
        Go Home
      </button>
    </div>
  );
};

export default NotFound;
