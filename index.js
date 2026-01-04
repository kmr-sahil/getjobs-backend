const express = require("express");
const app = express();
const cors = require("cors");
const mainRouter = require("./routes/main")
const cookieParser = require('cookie-parser');

const isProd = process.env.NODE_ENV === "production";
const PORT = process.env.PORT || 8282;

const CLIENT_ORIGIN = isProd
  ? "https://getjobs.today"
  : "http://localhost:3000";

app.use(express.json());
app.use(cookieParser());
app.set("trust proxy", 1);

app.use(
  cors({
    credentials: true,
    origin: CLIENT_ORIGIN,
  })
);

app.use("/api/v1", mainRouter)

app.get("/", (req, res) => {
  res.send(`Server running in ${isProd ? "PRODUCTION" : "DEVELOPMENT"} mode`);
});

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT} [${isProd ? "PROD" : "DEV"}]`);
});
