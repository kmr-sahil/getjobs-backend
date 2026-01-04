const { Pool } = require("pg");
const path = require("path");

require("dotenv").config();

console.log("ENV CHECK:", {
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    require: true,
    rejectUnauthorized: false,
  },
});

(async () => {
  console.log(process.env.DB_USER, process.env.DB_PASSWORD)
  const res = await pool.query("SELECT NOW()");
  console.log("DB Connected:", res.rows[0]);
  process.exit(0);
})();
