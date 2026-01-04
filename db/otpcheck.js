const jwt = require("jsonwebtoken");
const { Client } = require("pg");
require("dotenv").config();

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
  otpCheck,
};
