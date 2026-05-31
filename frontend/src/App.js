import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import FormComponent from "./components/FormComponent";
import Home from "./components/Home";
import AdminLogin from "./components/Adminlogin";
import AdminRegister from "./components/AdminRegister";
import Admin from "./components/Admin";
import NotFound from "./components/NotFound";
import Unauthorized from "./components/Unauthorized";
import { isAuthenticated, isAdminAuthenticated } from "./utlis/auth";
import "./App.css";

const PrivateRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/" replace />;
};

const AdminPrivateRoute = ({ children }) => {
  return isAdminAuthenticated() ? children : <Navigate to="/admin/login" replace />;
};

function App() {
  return (
    <div className="App">
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
      <Routes>
        <Route path="/" element={<FormComponent />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <Home />
            </PrivateRoute>
          }
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/register" element={<AdminRegister />} />
        <Route
          path="/admin"
          element={
            <AdminPrivateRoute>
              <Admin />
            </AdminPrivateRoute>
          }
        />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}

export default App;
