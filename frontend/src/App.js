import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import FormComponent from "./components/FormComponent";
import Home from "./components/Home";
import NotFound from "./components/NotFound";
import Admin from "./components/Admin";
import "./App.css";

// Function to verify JWT token
const isAuthenticated = () => {
  const token = localStorage.getItem("jwtToken");
  //console.log("Token in localStorage:", token); // Debugging log
  return token ? true : false;
};

// Private route component to protect routes
const PrivateRoute = ({ children }) => {
  console.log(
    "PrivateRoute is being called. Authenticated:",
    isAuthenticated()
  );
  return isAuthenticated() ? children : <Navigate to="/" />;
};

function App() {
  return (
    <div className="App">
      <Routes>
        {/* Public route for login */}
        <Route path="/" element={<FormComponent />} />
        {/* Private route for home */}
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />
        <Route path="/admin" element={<Admin />} />
        {/* 404 route for unmatched paths */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;
