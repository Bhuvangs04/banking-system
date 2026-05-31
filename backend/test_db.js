const mysql = require("mysql2/promise");
require("dotenv").config();

async function testConnection(host) {
  console.log(`Testing connection to host: ${host}...`);
  try {
    const connection = await mysql.createConnection({
      host: host,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    console.log(`SUCCESS connected to host: ${host}`);
    const [rows] = await connection.query("SHOW TABLES;");
    console.log("Tables in database:", rows.map(r => Object.values(r)[0]));
    await connection.end();
    return true;
  } catch (err) {
    console.error(`FAILED host: ${host} - Error: ${err.message}`);
    return false;
  }
}

(async () => {
  const hosts = ["127.0.0.1", "localhost", "::1", "::"];
  for (const host of hosts) {
    const ok = await testConnection(host);
    if (ok) {
      console.log(`\nFound working host: ${host}`);
      break;
    }
  }
})();
