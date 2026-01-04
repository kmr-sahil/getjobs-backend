const express = require("express");
const { Client } = require("pg");
const zod = require("zod");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { register, otpCheck } = require("../db/auth_function");
const { otpSenderMail } = require("../db/user-otp");

const emailSchema = zod
  .string()
  .email("Invalid email address")
  .optional()
  .or(zod.literal(""));
const passwordSchema = zod
  .string()
  .min(8)
  .refine((password) => /[A-Z]/.test(password) && /\d/.test(password), {
    message: "Password must contain at least one capital letter and one number",
  });

router.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;
  const emailRes = emailSchema.safeParse(email);
  const passRes = passwordSchema.safeParse(password);

  if (!emailRes.success) {
    return res.status(400).send(emailRes.error.errors[0].message);
  }

  if (!passRes.success) {
    return res.status(400).send(passRes.error.errors[0].message);
  }

  try {
    const result = await register(name, email, password);
    if (!result) {
      return res.status(409).json({ error: "User already exists" }); // Conflict
    }
    res.status(201).json({ message: "User created" });
  } catch (err) {
    console.error("Error during registration:", err);
    return res
      .status(503)
      .json({ error: "Service Unavailable, try again later" });
  }
});

router.post("/signin", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

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
    const result = await client.query(query, [email]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User does not exist" });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const newOtp = await otpSenderMail(email);

    if (!newOtp) {
      return res.status(502).json({ error: "Failed to send OTP" }); // Bad Gateway
    }

    const updateOtpQuery = `UPDATE users SET otp = $1 WHERE email = $2`;
    await client.query(updateOtpQuery, [newOtp, email]);

    return res
      .status(200)
      .json({ success: true, message: "OTP sent to your email", email });
  } catch (error) {
    console.error("Error during sign-in:", error);
    return res
      .status(503)
      .json({ error: "Service Unavailable, please try again" });
  } finally {
    await client.end();
  }
});

router.post("/check", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const verified = await otpCheck(email, otp);
    if (verified) {
      //res.cookie("token", verified.token, { httpOnly: true, sameSite: "None", secure: true, domain: ".get-jobs.xyz" }, );
      res.cookie("token", verified.token, { httpOnly: true, sameSite: "Lax" });
      return res.status(200).json({ message: "User authorized", email });
    } else {
      return res.status(401).json({ message: "Invalid OTP or email" });
    }
  } catch (error) {
    console.error("Error in /check route:", error);
    return res
      .status(503)
      .json({ message: "Service Unavailable, please try again" });
  }
});

router.post("/forgetpass", async (req, res) => {
  const { email } = req.body;

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
    const userQuery = "SELECT * FROM users WHERE email = $1";
    const userResult = await client.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const otp = await otpSenderMail(email);
    if (!otp) {
      return res.status(502).json({ message: "Failed to send OTP" });
    }

    const updateQuery = "UPDATE users SET otp = $1 WHERE email = $2";
    await client.query(updateQuery, [otp, email]);

    return res.status(200).json({ message: "OTP sent successfully", email });
  } catch (error) {
    console.error("Error during forget password process:", error);
    return res
      .status(503)
      .json({ message: "Service Unavailable, please try again" });
  } finally {
    await client.end();
  }
});

router.post("/resetpass", async (req, res) => {
  const { email, otp, newPassword } = req.body;

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
    const userQuery = "SELECT * FROM users WHERE email = $1";
    const userResult = await client.query(userQuery, [email]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = userResult.rows[0];

    if (user.otp !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updateQuery = "UPDATE users SET password = $1 WHERE email = $2";
    await client.query(updateQuery, [hashedPassword, email]);

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error during password reset process:", error);
    return res
      .status(503)
      .json({ message: "Service Unavailable, please try again" });
  } finally {
    await client.end();
  }
});

module.exports = router;
