import React, { useState } from "react";
import LoginForm from "./login"; // Import the LoginForm component
import SignupForm from "./signup"; // Import the SignupForm component

function FormComponent() {
  const [isSignUp, setIsSignUp] = useState(false);

  const toggleForm = () => {
    setIsSignUp(!isSignUp);
  };

  return (
    <div>
      {isSignUp ? (
        <SignupForm toggleForm={toggleForm} /> // Show SignupForm if isSignUp is true
      ) : (
        <LoginForm toggleForm={toggleForm} /> // Show LoginForm if isSignUp is false
      )}
    </div>
  );
}

export default FormComponent;
