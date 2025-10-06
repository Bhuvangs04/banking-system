// utils/auth.js (or another relevant file)
import { jwtDecode } from "jwt-decode";
const secretKey = "!#*&*@#13215465454545";

// Function to verify JWT token and get the role
export const isAuthenticated = () => {
  const token = localStorage.getItem("AAjwtToken");
  if (!token) {
    return { authenticated: false, role: null };
  }

  try {
    const decodedToken = jwtDecode(token, secretKey);
    console.log("Decoded Token:", decodedToken);
    return { authenticated: true, role: decodedToken?.role };
  } catch (error) {
    console.error("Error decoding token:", error);
    return { authenticated: false, role: null };
  }
};
