const fs = require("fs");
const path = require("path");

// import your functions
// adjust the path based on where this file lives
const { ingestJobs } = require("./uploadJobs"); 

async function run() {
  try {
    const filePath = "C:\\Users\\kmrsa\\Downloads\\dataset_linkedin-jobs-scraper_2025-12-25_07-14-36-755.json";

    console.log("📦 Reading jobs file...");
    const rawData = fs.readFileSync(filePath, "utf-8");

    const parsed = JSON.parse(rawData);

    // depending on scraper, jobs may be nested
    const jobsArray = Array.isArray(parsed)
      ? parsed
      : parsed.jobs || [];

    if (!jobsArray.length) {
      console.warn("⚠️ No jobs found in JSON");
      return;
    }

    console.log(`🚀 Ingesting ${jobsArray.length} jobs...`);

    await ingestJobs(jobsArray);

    console.log("✅ Job ingestion completed");
  } catch (err) {
    console.error("❌ Ingestion failed:", err);
  }
}

run();
