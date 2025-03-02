import express from 'express';
import { PrismaClient } from '@prisma/client';
import cors from 'cors';
import multer from 'multer';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Use a fallback for __filename and __dirname
const __filename = typeof import.meta.url !== 'undefined'
  ? fileURLToPath(import.meta.url)
  : '';
const __dirname = __filename ? path.dirname(__filename) : process.cwd();

const app = express();
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  // Don't use connectionLimit here as it's invalid
});

// Add connection management
let isConnected = false;

async function connectPrisma() {
  if (isConnected) return;
  
  try {
    await prisma.$connect();
    isConnected = true;
    console.log("Prisma connected successfully");
  } catch (e) {
    console.error("Prisma connection failed:", e);
    // Don't throw - just log and continue
  }
}

// Call this function before your app.use middleware
connectPrisma();

const upload = multer({ dest: 'uploads/' });

// const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "your-secure-jwt-secret-change-this";
const COOKIE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'your-email@gmail.com',
    pass: process.env.EMAIL_PASS || 'your-app-password'
  }
});

transporter.verify((error, success) => {
  if (error) {
    console.error("Email configuration error:", error);
  } else {
    console.log("Email server is ready to send messages");
  }
});

app.use(cors({
  origin: [
    'https://parth-soni.netlify.app',
    'https://*.netlify.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ],
  credentials: true,
  exposedHeaders: ['set-cookie']
}));

app.use(express.json());
app.use(cookieParser());
app.use(compression());

// Use path.resolve to reliably point to the public folder
app.use(express.static(path.resolve(__dirname, 'public')));
// Generate a 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Replace the existing fetchStudiesWithRetry function with:
async function fetchStudiesWithRetry(maxRetries = 3, initialDelayMs = 500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to ping the database with a simple query first to warm up the connection
      if (i > 0) {
        try {
          await prisma.$queryRaw`SELECT 1 AS connectionTest`;
          console.log("Database ping successful on retry", i);
        } catch (pingError) {
          console.log("Database ping failed on retry", i, pingError.message);
        }
      }
      
      return await prisma.caseStudy.findMany();
    } catch (error) {
      console.error(`Connection attempt ${i+1}/${maxRetries} failed:`, error.message);
      
      if (i === maxRetries - 1) throw error;
      
      // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
      const delayTime = initialDelayMs * Math.pow(2, i);
      console.log(`Retrying in ${delayTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
  }
}
// Send OTP via email
async function sendOTPEmail(email, otp) {
  const mailOptions = {
    from: process.env.EMAIL_USER || 'your-email@gmail.com',
    to: email,
    subject: 'Your Admin Login OTP',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4a5568;">Portfolio Admin Login OTP</h2>
        <p>Your one-time password for admin login is:</p>
        <div style="background-color:rgb(247, 250, 252); padding: 20px; border-radius: 6px; text-align: center;">
          <h1 style="font-size: 36px; margin: 0; color: #2d3748; letter-spacing: 8px;">${otp}</h1>
        </div>
        <p style="color: #718096; margin-top: 20px;">This OTP will expire in 10 minutes.</p>
        <p style="color: #718096;">If you didn't request this OTP, please ignore this email.</p>
      </div>
    `
  };

  return new Promise((resolve, reject) => {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Error sending email:', error);
        reject(error);
      } else {
        console.log('Email sent:', info.response);
        resolve(info);
      }
    });
  });
}

// Middleware to verify JWT token
const authenticateToken = async (req, res, next) => {
  // Check both cookie and Authorization header
  const token =
    req.cookies.adminToken ||
    (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if user exists and is admin
    const user = await prisma.user.findUnique({
      where: { id: decoded.id }
    });
    
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Not an admin' });
    }
    
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Request OTP endpoint
app.post('/api/request-otp', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Find the user
    const user = await prisma.user.findUnique({
      where: { username }
    });
    
    // Check if user exists and is admin
    if (!user || !user.isAdmin) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Generate and store OTP
    const otp = generateOTP();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Update user with OTP details
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: otp,
        otpExpiry
      }
    });
    
    // Send OTP to email
    await sendOTPEmail(user.email, otp);
    
    // Return masked email for UI
    const maskedEmail = user.email.replace(/(.{3})(.*)(@.*)/, '$1****$3');
    
    res.json({ 
      message: 'OTP sent successfully', 
      email: maskedEmail,
      requestId: user.id  // Changed from userId to requestId to match client code
    });
  } catch (error) {
    console.error('OTP request error:', error);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// Verify OTP and login
app.post('/api/verify-otp', async (req, res) => {
  const { requestId, otp } = req.body;  // Changed from userId to requestId to match client code
  
  try {
    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: requestId }  // Changed from userId to requestId
    });
    
    // Check if user exists
    if (!user) {
      return res.status(401).json({ error: 'Invalid user' });
    }
    
    // Check if OTP exists and hasn't expired
    const now = new Date();
    if (!user.otpCode || !user.otpExpiry || now > user.otpExpiry) {
      return res.status(401).json({ error: 'OTP expired or invalid' });
    }
    
    // Check if OTP matches
    if (user.otpCode !== otp) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    
    // Clear OTP data
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpCode: null,
        otpExpiry: null
      }
    });
    
    // Create JWT token
    const token = jwt.sign(
      { id: user.id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Set cookie with token
    // In the verify-otp endpoint
  res.cookie('adminToken', token, {
    maxAge: COOKIE_MAX_AGE,
    httpOnly: true,
    secure: false,          // Keep false for development
    sameSite: 'lax',        // Use 'lax' instead of 'none' in development
    path: '/',              // Make sure it's available on all paths
    });
    
    res.json({ 
      message: 'Login successful',
      token: token  // Return the token to the client
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.json({ message: 'Logout successful' });
});

// Check auth status endpoint
app.get('/api/check-auth', authenticateToken, (req, res) => {
  res.json({ authenticated: true, username: req.user.username });
});

// Get all case studies
app.get('/api/case-studies', async (req, res) => {
  try {
    const studies = await (async function fetchStudiesWithRetry(retries = 2, delayMs = 1000) {
      for (let i = 0; i < retries; i++) {
        try {
          return await prisma.caseStudy.findMany();
        } catch (error) {
          if (i === retries - 1) throw error;
          console.log("Retrying fetchStudies in", delayMs, "ms");
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    })();
    res.json(studies);
  } catch (error) {
    console.error('Error fetching case studies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a specific case study
app.get('/api/case-studies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const study = await prisma.caseStudy.findUnique({ where: { id } });
    if (study) {
      res.json(study);
    } else {
      res.status(404).json({ error: 'Case study not found' });
    }
  } catch (error) {
    console.error('Error fetching case study:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new case study - protected
app.post('/api/case-studies', authenticateToken, async (req, res) => {
  const { title, description, techStack } = req.body;
  
  try {
    // Validate required fields
    if (!title || !description || !techStack) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    const newStudy = await prisma.caseStudy.create({
      data: {
        title,
        description,
        techStack,
      }
    });
    
    res.status(201).json(newStudy);
  } catch (error) {
    console.error('Error creating case study:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update an existing case study - protected
app.put('/api/case-studies/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, techStack } = req.body;
    
    // Validate inputs
    if (!title || !description || !techStack) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    
    // Check if case study exists
    const existingStudy = await prisma.caseStudy.findUnique({
      where: { id }
    });
    
    if (!existingStudy) {
      return res.status(404).json({ error: "Case study not found" });
    }
    
    // Update the case study
    const updatedStudy = await prisma.caseStudy.update({
      where: { id },
      data: {
        title,
        description,
        techStack,
      }
    });
    
    // Return the updated case study
    res.json(updatedStudy);
  } catch (error) {
    console.error("Error updating case study:", error);
    res.status(500).json({ 
      error: "Failed to update case study", 
      details: error.message 
    });
  }
});

// Delete a case study - protected
app.delete('/api/case-studies/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  
  try {
    // Check if case study exists
    const existingStudy = await prisma.caseStudy.findUnique({
      where: { id }
    });
    
    if (!existingStudy) {
      return res.status(404).json({ error: "Case study not found" });
    }
    
    // Delete the case study
    await prisma.caseStudy.delete({
      where: { id }
    });
    
    res.json({ message: 'Case study deleted successfully' });
  } catch (error) {
    console.error('Error deleting case study:', error);
    res.status(500).json({ error: error.message });
  }
});

// Upload notebook file endpoint - protected
app.post('/api/case-studies/:id/upload', authenticateToken, upload.single('file'), async (req, res) => {
  const { id } = req.params;
  
  try {
    // 1. Check if case study exists
    const study = await prisma.caseStudy.findUnique({ where: { id } });
    if (!study) {
      return res.status(404).json({ error: 'Case study not found' });
    }

    // 2. Convert notebook to HTML
    const filePath = req.file.path;
    const outputDir = path.join(__dirname, 'public', 'notebooks');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFileName = `${id}-${Date.now()}.html`;
    const outputPath = path.join(outputDir, outputFileName);
    
    exec(`jupyter nbconvert --to html "${filePath}" --output-dir="${outputDir}" --output="${outputFileName}"`, async (err) => {
      if (err) {
        console.error('Error converting notebook:', err);
        return res.status(500).json({ error: 'Error converting notebook' });
      }
      
      // 3. Read the generated HTML
      const htmlContent = fs.readFileSync(path.join(outputDir, outputFileName), 'utf8');
      
      // 4. Update case study with notebook content
      await prisma.caseStudy.update({
        where: { id },
        data: { content: htmlContent }
      });
      
      // 5. Clean up files
      fs.unlinkSync(filePath);
      fs.unlinkSync(path.join(outputDir, outputFileName));
      
      res.json({ success: true, message: 'Notebook uploaded and associated with case study' });
    });
  } catch (error) {
    console.error('Error processing upload:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health-check', async (req, res) => {
  try {
    // Try a simple query to check database connection
    await prisma.$queryRaw`SELECT 1 AS connectionTest`;
    res.json({ status: 'ok', message: 'Database connection successful' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      message: 'Database connection failed',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`API server is running on port ${PORT}`);
});
