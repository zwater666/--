require('dotenv').config();
const mysql = require('mysql2/promise');

async function test() {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0
    });

    const conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT 1+1 AS result');
    console.log('DB CONNECTED:', rows[0].result === 2);
    conn.release();
    await pool.end();
  } catch (err) {
    console.error('DB CONNECT ERROR:', err.message || err);
    process.exitCode = 1;
  }
}

test();
