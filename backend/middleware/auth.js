const JWT = require("jsonwebtoken");
const Secret = "SecureOnlyPassword";

function verifyToken(req, res, next) {
  const authHeader = req.headers["authorization"]; 
  if (!authHeader) {
    return res.status(401).send({ error: "Access Denied. No token provided." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(400).send({ error: "Token not found in header." });
  }

  try {
    const decoded = JWT.verify(token, Secret);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(400).send({ error: "Invalid Token" });
  }
}

module.exports = verifyToken;
