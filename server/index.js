import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';
import { marked } from 'marked';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads/'))
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname)
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Check file extension instead of mimetype
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.md' || ext === '.markdown' || file.mimetype === 'text/markdown' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only Markdown files (.md or .markdown) are allowed!'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// File upload and optimization endpoint
app.post('/api/optimize', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file || !req.body.jobDescription) {
      return res.status(400).json({ message: 'Both resume and job description are required' });
    }

    // Read the uploaded markdown file
    const resumeContent = fs.readFileSync(req.file.path, 'utf8');
    
    console.log('Original Resume Content:', resumeContent);

    // Convert markdown to plain text for better processing
    const plainText = marked.parse(resumeContent);
    const textContent = plainText.replace(/<[^>]*>/g, '');

    // Prepare the prompt for GPT
    const prompt = `
    You are a professional resume writer. Your task is to optimize the following resume to better match the job description.
    Keep the same basic structure but enhance the content to better align with the job requirements.

    Important formatting rules:
    1. Use markdown headers (## ) for section titles, not bold text
    2. Keep the same section titles as the original resume
    3. Maintain the same overall structure and order
    4. For each significant change or highlight you make, add a brief explanation in curly brackets at the end of the line
       Example: "Led AI implementation strategy for Fortune 500 companies {Demonstrates strategic leadership in AI}"
    5. Include ALL sections from the original resume
    6. Keep the contact information and personal details exactly as they are
    7. Make sure explanations are concise and directly relate to the job requirements
    
    Job Description:
    ${req.body.jobDescription}
    
    Original Resume:
    ${resumeContent}
    
    Please provide the optimized resume in markdown format, maintaining a professional tone and being truthful to the original content.
    Use the exact same section headers as the original resume (## Summary instead of **Summary**).
    Make sure to include ALL sections and content, just optimized for the job description.
    Remember to add explanations in curly brackets for each significant change or highlight.`;

    console.log('Sending prompt to OpenAI:', prompt);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { "role": "system", "content": "You are a professional resume writer who optimizes resumes to match job descriptions." },
        { "role": "user", "content": prompt }
      ],
      temperature: 0.7,
      max_tokens: 2000
    });

    // Detailed logging
    console.log('\n=== OPENAI RESPONSE START ===');
    console.log('Full Response Object:', JSON.stringify(completion, null, 2));
    console.log('\n=== GENERATED CONTENT START ===');
    console.log(completion.choices[0].message.content);
    console.log('\n=== GENERATED CONTENT END ===');
    console.log('=== OPENAI RESPONSE END ===\n');

    // Send both original and optimized resumes
    res.json({
      original: resumeContent,
      optimized: completion.choices[0].message.content,
      message: 'Resume optimized successfully'
    });

  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({ message: 'Error optimizing resume', error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File is too large. Maximum size is 5MB.' });
    }
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: err.message });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
}); 