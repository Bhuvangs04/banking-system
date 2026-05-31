const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const db = require("./dataBase/MySQL");
const { logAudit } = require("./services/audit");
const managerRoutes = require("./routes/Manager");
const userRoutes = require("./routes/User");
const { generalLimiter } = require("./middleware/rateLimiter");
const { startLoanCron } = require("./services/loanCron");

const app = express();
const PORT = process.env.PORT || 8081;

// Security headers
app.use(helmet());

// Trust proxy for accurate IP extraction behind reverse proxies
// app.set('trust proxy', true);

// Request logging
app.use(morgan("dev"));

// Body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  methods: "GET,POST,PUT,DELETE,PATCH",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true,
};
app.use(cors(corsOptions));

// General rate limiting
app.use(generalLimiter);

// Health check
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/admin", managerRoutes);
app.use("/customer", userRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// Database connection test & server start
(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Connected to the MySQL database.");
    connection.release();

    app.listen(PORT, () => {
      console.log(`Server is running on PORT: ${PORT}`);
      // Log system startup audit entry
      logAudit({
        actorType: 'system',
        actorId: 'SYSTEM',
        action: 'SERVER_START',
        category: 'System',
        description: `Server started on port ${PORT}`,
      });
      // Start the automated loan processor
      startLoanCron();
    });
  } catch (err) {
    console.error("Failed to connect to database:", err.message);
    process.exit(1);
  }
})();
