const express = require("express");
const router = express.Router();
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { insertProfile } = require("../db/job_function");
const { v4: uuidv4 } = require("uuid");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Pool } = require("pg");
const { authMiddleware } = require("../auth/middleware");
const ImageKit = require("imagekit");

router.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false, // required for Neon
  },
});

async function executeQuery(query, values = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return result.rows;
  } finally {
    client.release();
  }
}

async function createPreSignedPost(key, contentType) {
  const s3 = new S3Client({
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    region: process.env.AWS_REGION,
  });
  const command = new PutObjectCommand({
    Bucket: process.env.BUCKET_NAME,
    Key: `images/${key}`,
    ContentType: contentType,
  });
  const fileLink = `https://${process.env.BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/images/${key}`;
  const signedUrl = await getSignedUrl(s3, command, {
    expiresIn: 5 * 60,
  });

  return { fileLink, signedUrl };
}

router.post("/profile", authMiddleware, async (req, res) => {
  const { company_name, website, fileLink } = req.body;
  const email = req.email;
  if (!company_name || !website || !fileLink) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  try {
    const result = await insertProfile(email, company_name, website, fileLink);
    if (result.success) {
      return res.status(201).json({
        message: "Data inserted successfully",
      });
    } else {
      return res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Error during profile creation:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get("/profile", authMiddleware, async (req, res) => {
  const email = req.email;

  try {
    const query = `
      SELECT 
        company_profile.id, 
        company_profile.company_name, 
        company_profile.website, 
        company_profile.image_url
      FROM 
        users
      JOIN 
        company_profile 
        ON users.id = company_profile.jb_user_id
      WHERE 
        users.email = $1
    `;

    const profiles = await executeQuery(query, [email]);
    res.status(200).send(profiles);
  } catch (error) {
    console.error("Error fetching profiles:", error);
    res.status(500).send({
      status: "error",
      message: "Failed to get the profiles",
    });
  }
});

router.get("/sitemap/jobs", async (req, res) => {
  try {
    const result = await executeQuery("SELECT id FROM jb_jobs");
    console.log("Query Result:", result);

    // Fix: Directly map `result` instead of `result.rows`
    const jobIds = result.map((row) => row.id);

    res.status(200).json({ jobIds });
  } catch (error) {
    console.error("❌ Error fetching job IDs:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.post("/s3logo", authMiddleware, async (req, res) => {
  try {
    const { contentType } = req.body;

    if (!contentType) {
      return res.status(400).send({
        status: "error",
        message: "Content type is required",
      });
    }

    const key = uuidv4();
    const { fileLink, signedUrl } = await createPreSignedPost(key, contentType);

    res.status(200).send({
      status: "success",
      data: { fileLink, signedUrl },
    });
  } catch (error) {
    console.error("Error generating signed URL:", error);

    res.status(500).send({
      status: "error",
      message: "Failed to generate signed URL",
    });
  }
});

router.get("/get-user", authMiddleware, async (req, res) => {
  const email = req.email;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email not provided" });
  }

  try {
    const query = "SELECT name, email FROM users WHERE email = $1";
    const result = await executeQuery(query, [email]);

    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    return res.status(200).json({ success: true, user: result[0] });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal Server Error" });
  }
});

router.put("/profile", authMiddleware, async (req, res) => {
  const { company_name, website, fileLink, company_id } = req.body;

  if (!company_name && !website && !fileLink) {
    return res
      .status(400)
      .json({ error: "At least one field is required to update" });
  }

  try {
    const profileId = company_id;

    // Build dynamic update query
    let updateFields = [];
    let values = [];
    let index = 1;

    if (company_name) {
      updateFields.push(`company_name = $${index++}`);
      values.push(company_name);
    }
    if (website) {
      updateFields.push(`website = $${index++}`);
      values.push(website);
    }
    if (fileLink) {
      updateFields.push(`image_url = $${index++}`);
      values.push(fileLink);
    }

    values.push(profileId);

    const updateQuery = `
      UPDATE company_profile
      SET ${updateFields.join(", ")}
      WHERE id = $${index}
      RETURNING company_name, website, image_url
    `;

    const updatedProfile = await executeQuery(updateQuery, values);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile: updatedProfile[0],
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.delete("/profile", authMiddleware, async (req, res) => {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "ID is required." });
  }

  try {
    const query = `DELETE FROM company_profile WHERE id = $1 RETURNING *`;
    const values = [id];

    const result = await executeQuery(query, values);

    if (result.length == 0) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found." });
    }

    return res.status(200).json({
      success: true,
      message: "Profile deleted successfully.",
    });
  } catch (error) {
    console.error("Error deleting profile:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to delete profile.",
      error: "Internal server error",
    });
  }
});

const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
});

router.get("/imagekit-auth", (req, res) => {
  console.log("Generating ImageKit authentication parameters");
  const authParams = imagekit.getAuthenticationParameters();
  res.json(authParams);
});


module.exports = router;
