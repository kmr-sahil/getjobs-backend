const jwt = require("jsonwebtoken");
const { Client } = require("pg");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { otpSenderMail } = require("./user-otp");

async function register(name, email, password) {
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

    const insertQuery = `INSERT INTO users (name ,email, password, otp) VALUES ($1, $2, $3, $4) RETURNING *`;
    await client.query(insertQuery, [name, email, hashedPassword, otp]);

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

async function otpCheck(email, otp) {
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
    const query = `SELECT * FROM users WHERE email = $1 AND otp = $2`;
    const values = [email, otp];
    const result = await client.query(query, values);
    if (result.rows.length === 0) {
      return false;
    }
    const token = jwt.sign({ email }, process.env.SECRET_KEY, {
      expiresIn: "30d",
    });
    return { token };
  } catch (error) {
    console.error("Error during OTP verification:", error);
    return false;
  } finally {
    await client.end();
  }
}

module.exports = {
  register,
  otpCheck,
};