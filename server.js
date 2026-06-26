const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
require("dotenv").config();

const app = express();

// IMPORTANT FOR RENDER
const PORT = process.env.PORT || 3000;

// ========================
// DATA FILE SETUP
// ========================

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "employees.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, "[]");
}

// ========================
// CLOUDINARY
// ========================

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========================
// MIDDLEWARE
// ========================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS FOR NETLIFY
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

// ========================
// FILE UPLOAD
// ========================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter(req, file, cb) {
    const allowed = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (!allowed.includes(ext)) {
      return cb(
        new Error("Only PDF, DOC and DOCX files are allowed")
      );
    }

    cb(null, true);
  }
});

// ========================
// HELPERS
// ========================

function readEmployees() {
  try {
    return JSON.parse(fs.readFileSync(dataFile, "utf8"));
  } catch {
    return [];
  }
}

function saveEmployees(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

function uploadToCloudinary(buffer, originalName) {
  return new Promise((resolve, reject) => {
    const fileName = originalName
      .replace(/\s+/g, "-")
      .replace(/\.[^/.]+$/, "");

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "talentbridge-resumes",
        resource_type: "raw",
        public_id: `${Date.now()}-${fileName}`
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

// ========================
// ROUTES
// ========================

// Health Check
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "TalentBridge API Running"
  });
});

// Upload Resume
app.post(
  "/api/employees",
  upload.single("resume"),
  async (req, res) => {
    try {
      const { name, jobRole, location } = req.body;

      if (!name || !jobRole || !location || !req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Name, Job Role, Location and Resume are required"
        });
      }

      const cloudinaryFile = await uploadToCloudinary(
        req.file.buffer,
        req.file.originalname
      );

      const employees = readEmployees();

      const employee = {
        id: Date.now(),
        name,
        jobRole,
        location,
        resumeFileName: req.file.originalname,
        resumeUrl: cloudinaryFile.secure_url,
        cloudinaryPublicId: cloudinaryFile.public_id,
        createdAt: new Date().toISOString()
      };

      employees.unshift(employee);

      saveEmployees(employees);

      res.status(201).json({
        success: true,
        message: "Resume uploaded successfully",
        employee
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        success: false,
        message: error.message || "Upload failed"
      });
    }
  }
);

// Get All Employees
app.get("/api/employees", (req, res) => {
  const employees = readEmployees();

  res.json(employees);
});

// Search Employees
app.get("/api/search", (req, res) => {
  const jobRole = (req.query.jobRole || "").toLowerCase();
  const location = (req.query.location || "").toLowerCase();

  const employees = readEmployees();

  const results = employees.filter((employee) => {
    const roleMatch = employee.jobRole
      .toLowerCase()
      .includes(jobRole);

    const locationMatch = employee.location
      .toLowerCase()
      .includes(location);

    return roleMatch && locationMatch;
  });

  res.json(results);
});

// ========================
// START SERVER
// ========================

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
