const JWT = require("jsonwebtoken");
require("dotenv").config();
const db = require("../dataBase/MySQL");

const SECRET = process.env.JWT_SECRET;

/**
 * Verify JWT token for regular users.
 */
async function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Token not found in header." });
  }

  try {
    const decoded = JWT.verify(token, SECRET);
    req.user = decoded;

    // Check if customer is active
    if (decoded.AccNumber) {
      let connection;
      try {
        connection = await db.getConnection();
        const [rows] = await connection.query(
          "SELECT isActive FROM Customer WHERE AccountNumber = ?",
          [decoded.AccNumber]
        );
        if (rows.length === 0 || rows[0].isActive === 0) {
          return res.status(403).json({ error: "Access denied. Account is blocked or inactive." });
        }
      } finally {
        if (connection) connection.release();
      }
    }

    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please login again.", expired: true });
    }
    return res.status(403).json({ error: "Invalid token." });
  }
}

/**
 * Verify that the authenticated user has admin role.
 */
function verifyAdmin(req, res, next) {
  if (!req.user || (req.user.role !== "admin" && req.user.role !== "superadmin")) {
    return res.status(403).json({ error: "Access denied. Admin privileges required." });
  }
  next();
}

/**
 * Combined middleware: verify token + verify admin.
 */
async function verifyAdminToken(req, res, next) {
  await verifyToken(req, res, () => {
    verifyAdmin(req, res, next);
  });
}

/**
 * Middleware factory: require specific permission(s).
 * Checks the admin's role permissions from the database.
 * Grants access if the admin has ANY of the required permissions.
 * 
 * Usage:
 *   requirePermission('approve_loans')
 *   requirePermission('resolve_disputes', 'resolve_cases')  // any of these
 */
function requirePermission(...permissions) {
  return async (req, res, next) => {
    try {
      // Must be authenticated admin
      if (!req.user || (req.user.role !== "admin" && req.user.role !== "superadmin")) {
        return res.status(403).json({ error: "Admin access required." });
      }

      // Fetch admin's role permissions from DB
      const [rows] = await db.query(
        `SELECT rp.Permission FROM RolePermission rp
         JOIN Admin a ON a.RoleID = rp.RoleID
         WHERE a.AdminID = ?`,
        [req.user.adminId]
      );

      const adminPermissions = rows.map(r => r.Permission);

      // Check if admin has ANY of the required permissions
      const hasPermission = permissions.some(p => adminPermissions.includes(p));
      if (!hasPermission) {
        return res.status(403).json({
          error: "Insufficient permissions.",
          required: permissions,
        });
      }

      // Attach permissions to request for downstream use
      req.adminPermissions = adminPermissions;
      next();
    } catch (err) {
      console.error("Permission check error:", err);
      return res.status(500).json({ error: "Failed to verify permissions." });
    }
  };
}

module.exports = { verifyToken, verifyAdmin, verifyAdminToken, requirePermission };
