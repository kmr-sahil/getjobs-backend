const bcrypt = require("bcryptjs");
const { Client } = require("pg");
const { otpSenderMail } = require("./user-otp");
require("dotenv").config();

async function register(email, password) {
  const client = new Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: {
      require: true,
    },
  });

  try {
    await client.connect();

    const query = `SELECT * FROM users WHERE email = $1`;
    const value = [email];
    const result = await client.query(query, value);

    if (result.rows.length > 0) {
      return { success: false, message: "User already exists" };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = await otpSenderMail(email);
    if (!otp) {
      return { success: false, message: "Failed to send OTP" };
    }

    const insertQuery = `INSERT INTO users (email, password, otp) VALUES ($1, $2, $3) RETURNING *`;
    await client.query(insertQuery, [email, hashedPassword, otp]);

    return {
      success: true,
      message: "User registered successfully. Check your email for OTP.",
    };
  } catch (error) {
    console.error("Error executing query:", error);
    return { success: false, message: "Internal server error" };
  } finally {
    await client.end();
  }
}

module.exports = {
  register,
};
