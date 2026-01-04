const { Pool } = require("pg");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });
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

async function executeQuery(query, values = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return result.rows;
  } finally {
    client.release();
  }
}

async function getOrCreateCompanyProfile({ companyName, companyUrl }) {
  const name = companyName?.trim();
  const website = companyUrl?.trim() || null;

  if (!name) return null;

  let findQuery;
  let values;

  if (website) {
    findQuery = `
      SELECT id
      FROM company_profile
      WHERE LOWER(company_name) = LOWER($1)
        AND website = $2
      LIMIT 1
    `;
    values = [name, website];
  } else {
    findQuery = `
      SELECT id
      FROM company_profile
      WHERE LOWER(company_name) = LOWER($1)
        AND website IS NULL
      LIMIT 1
    `;
    values = [name];
  }

  const existing = await executeQuery(findQuery, values);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const insertQuery = `
    INSERT INTO company_profile (company_name, website, jb_user_id)
    VALUES ($1, $2, $3)
    RETURNING id
  `;

  const inserted = await executeQuery(insertQuery, [
    name,
    website,
    1
  ]);

  return inserted[0].id;
}

async function insertData(
  companyProfileId,
  job_title,
  work_loc,
  commitment,
  remote,
  job_link,
  description,
  categories,
  level,
  compensation
) {
  const insertJobQuery = `
    INSERT INTO jobs (
      company_profile_id,
      job_title,
      work_loc,
      commitment,
      remote,
      job_link,
      description,
      categories,
      level,
      compensation
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10
    )
    RETURNING id
  `;

  const values = [
    companyProfileId,
    job_title,
    work_loc,
    commitment,
    remote,
    job_link,
    description,
    categories,
    level,
    compensation
  ];

  const result = await executeQuery(insertJobQuery, values);
  return result[0];
}


function normalizeJob(raw) {
  return {
    job_title: raw.title || null,
    work_loc: raw.location || null,
    commitment: raw.contractType || null,
    remote: raw.workType?.toLowerCase().includes("remote") || false,
    job_link: raw.jobUrl || raw.applyUrl || null,
    description: raw.description || raw.descriptionHtml || null,
    categories: raw.sector || null,
    level: raw.experienceLevel || null,
    compensation: raw.salary || null,
  };
}

async function ingestJob(rawJob) {
  try {
    // 1. get or create company
    const companyProfileId = await getOrCreateCompanyProfile({
      companyName: rawJob.companyName,
      companyUrl: rawJob.companyUrl,
      jb_user_id: 1,
    });

    if (!companyProfileId) {
      console.warn("Skipping job, no company profile");
      return null;
    }

    // 2. normalize job fields
    const job = normalizeJob(rawJob);

    // 3. insert job
    const insertedJob = await insertData(
      companyProfileId,
      job.job_title,
      job.work_loc,
      job.commitment,
      job.remote,
      job.job_link,
      job.description,
      job.categories,
      job.level,
      job.compensation
    );

    return insertedJob;
  } catch (err) {
    console.error("Failed to ingest job:", err);
    return null;
  }
}

async function ingestJobs(jobsArray) {
  for (const job of jobsArray) {
    await ingestJob(job);
  }
}

module.exports = {
  ingestJobs,
};
