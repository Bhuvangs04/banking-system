const db = require('../backend/dataBase/MySQL');

async function inspectSchema() {
  const connection = await db.getConnection();
  try {
    const [rows] = await connection.query("DESCRIBE Loan");
    console.log(rows);
  } finally {
    connection.release();
    process.exit();
  }
}

inspectSchema();
