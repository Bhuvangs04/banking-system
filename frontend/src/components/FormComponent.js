import React, { useState } from "react";
import LoginForm from "./login";
import SignupForm from "./signup";

function FormComponent() {
  const [isSignUp, setIsSignUp] = useState(false);

  const toggleForm = () => {
    setIsSignUp(!isSignUp);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        {isSignUp ? (
          <SignupForm toggleForm={toggleForm} />
        ) : (
          <LoginForm toggleForm={toggleForm} />
        )}
      </div>
    </div>
  );
}

export default FormComponent;
