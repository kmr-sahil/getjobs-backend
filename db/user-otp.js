const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

//const SECRET_KEY = process.env.SECRET_KEY;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_PORT == 465, 
  auth: {
    user: process.env.SMTP_MAIL,
    pass: process.env.SMTP_PASSWORD,
  },
});

const generateOTP = () => {
  return otpGenerator.generate(6, {
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
};

async function otpSenderMail(email) {
  const otp = generateOTP();

  const mailOptions = {
    from: process.env.SMTP_MAIL,
    to: email,
    subject: "OTP from GetJobs.Today",
    text: `Your OTP is: ${otp}`,
  };

  try {
    // await transporter.sendMail(mailOptions);
    return otp;
  } catch (error) {
    console.error("Error sending email:", error);
    throw new Error("Error sending OTP via email");
  }
}
module.exports = {
    otpSenderMail
};