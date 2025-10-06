const express = require("express");
const db = require("./dataBase/MySQL"); 
const manager = require('./routes/Manager');
const user = require("./routes/User");
const app = express();
require("dotenv").config();
const cors = require("cors");
app.use(express.json());
// Middleware to parse URL-encoded request bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));
//app.use(express.urlencoded({ extended: false }));
app.use(express.json());



const corsOptions = {
  origin: "http://localhost:3000",
  methods: "GET,POST,PUT,DELETE",
  allowedHeaders: "Content-Type, Authorization",
  credentials: true, 
};

app.use(cors(corsOptions));

(async () => {
  try {
    const connection = await db.getConnection();
    console.log("Connected to the MySQL database.");
    connection.release();
  } catch (err) {
    console.error("Error while connecting to database:", err.message);
  }
})();


app.use('/admin', manager);
app.use("/customer", user);

app.listen(8081, () => {
  console.log("Server is up and running on PORT: 8081");
});
