const db = require("../dataBase/MySQL");

/**
 * Audit Trail Service
 * 
 * Centralized, immutable audit logging for the banking system.
 * Every significant action (authentication, financial, admin, security, account, system)
 * is recorded with actor details, IP address, and before/after JSON snapshots.
 * 
 * Design: Fire-and-forget — audit writes never block the main operation.
 * Immutability: No UPDATE or DELETE functions are exposed. Once written, entries are permanent.
 */

let _io = null;

/**
 * Inject the Socket.IO instance for real-time audit event broadcasting.
 * Called once at server startup (Phase 3).
 * @param {object} io - Socket.IO server instance
 */
function setSocketIO(io) {
  _io = io;
}

/**
 * Log an audit trail entry.
 * 
 * @param {object} params
 * @param {string} params.actorType - 'user' | 'admin' | 'system'
 * @param {string|null} params.actorId - AccountNumber, AdminID, or 'SYSTEM'
 * @param {string} params.action - Action name (e.g. 'LOGIN_SUCCESS', 'TRANSFER', 'LOAN_APPROVED')
 * @param {string} params.category - 'Authentication' | 'Financial' | 'Admin' | 'Security' | 'Account' | 'System'
 * @param {string|null} [params.entityType] - Type of entity affected (e.g. 'Account', 'Loan', 'Transaction')
 * @param {string|null} [params.entityId] - ID of entity affected
 * @param {string|null} [params.ipAddress] - Client IP address
 * @param {object|null} [params.oldValues] - Before-state snapshot (JSON)
 * @param {object|null} [params.newValues] - After-state snapshot (JSON)
 * @param {string} params.description - Human-readable description of the action
 * @param {object} [params.connection] - Optional active DB connection (for transactional logging)
 */
async function logAudit({
  actorType,
  actorId = null,
  action,
  category,
  entityType = null,
  entityId = null,
  ipAddress = null,
  oldValues = null,
  newValues = null,
  description,
  connection = null,
}) {
  try {
    const query = `
      INSERT INTO AuditLog (ActorType, ActorID, Action, Category, EntityType, EntityID, IPAddress, OldValues, NewValues, Description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      actorType,
      actorId,
      action,
      category,
      entityType,
      entityId,
      ipAddress,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      description,
    ];

    let insertId;

    if (connection) {
      // Use the provided transactional connection
      const [result] = await connection.query(query, params);
      insertId = result.insertId;
    } else {
      // Fire-and-forget: acquire own connection
      const [result] = await db.query(query, params);
      insertId = result.insertId;
    }

    // Broadcast to connected admin dashboards via Socket.IO (Phase 3)
    if (_io) {
      _io.to("audit-room").emit("audit:new", {
        AuditID: insertId,
        Timestamp: new Date().toISOString(),
        ActorType: actorType,
        ActorID: actorId,
        Action: action,
        Category: category,
        EntityType: entityType,
        EntityID: entityId,
        IPAddress: ipAddress,
        OldValues: oldValues,
        NewValues: newValues,
        Description: description,
      });
    }
  } catch (error) {
    // Never throw — audit failures must not crash the main operation
    console.error("[AUDIT] Failed to log audit entry:", error.message);
  }
}

/**
 * Helper to extract client IP from an Express request.
 * Handles proxied requests (X-Forwarded-For) and normalizes IPv6-mapped IPv4.
 * @param {object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
  let ip = req.headers["x-forwarded-for"] || req.ip || req.connection?.remoteAddress || "unknown";
  // Take first IP if comma-separated (proxy chain)
  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }
  // Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring(7);
  }
  return ip;
}

module.exports = {
  logAudit,
  setSocketIO,
  getClientIP,
};
