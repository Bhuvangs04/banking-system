import { jwtDecode } from "jwt-decode";

/**
 * Check if a customer is authenticated with a valid, non-expired token.
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem("jwtToken");
  if (!token) return false;
  try {
    const decoded = jwtDecode(token);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("jwtToken");
      localStorage.removeItem("refreshToken");
      return false;
    }
    return true;
  } catch {
    localStorage.removeItem("jwtToken");
    return false;
  }
};

/**
 * Check if an admin is authenticated with a valid, non-expired admin token.
 */
export const isAdminAuthenticated = () => {
  const token = localStorage.getItem("adminToken");
  if (!token) return false;
  try {
    const decoded = jwtDecode(token);
    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
      localStorage.removeItem("adminToken");
      return false;
    }
    return decoded.role === "admin";
  } catch {
    localStorage.removeItem("adminToken");
    return false;
  }
};

/**
 * Decode and return token payload data.
 */
export const getTokenData = (tokenKey = "jwtToken") => {
  const token = localStorage.getItem(tokenKey);
  if (!token) return null;
  try {
    return jwtDecode(token);
  } catch {
    return null;
  }
};
