const db = require('./backend/dataBase/MySQL');

async function check() {
  const connection = await db.getConnection();
  try {
    const [columns] = await connection.query("SHOW COLUMNS FROM Notification");
    console.log("Notification columns:", columns);
  } catch (err) {
    console.error(err);
  } finally {
    connection.release();
    process.exit(0);
  }
}
check();
