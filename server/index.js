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
    You are a professional resume writer and ATS (Applicant Tracking System) expert. Your task is to analyze and optimize a resume.

    STRICTLY follow this response format:

    ---SCORES---
    {
      "original": {
        "total": 70,
        "breakdown": {
          "titleAlignment": 14,
          "skillsMatch": 18,
          "keywords": 15,
          "experienceRelevance": 17,
          "actionVerbs": 6
        },
        "explanation": "Brief explanation of scoring..."
      }
    }
    ---OPTIMIZED_RESUME---
    [Your optimized resume content in markdown format with explanations in curly brackets]

    IMPORTANT: For EVERY significant change you make, add an explanation in curly brackets at the end of the line.
    
    Example format:
    ## Experience
    Senior Software Engineer at TechCorp {Aligned title with job posting and highlighted AI experience}
    - Developed machine learning models for customer segmentation {Added ML context to match required qualifications}
    - Led a team of 5 engineers in implementing cloud architecture {Emphasized leadership and cloud experience}

    ---OPTIMIZED_SCORES---
    {
      "optimized": {
        "total": 85,
        "breakdown": {
          "titleAlignment": 17,
          "skillsMatch": 22,
          "keywords": 18,
          "experienceRelevance": 20,
          "actionVerbs": 8
        },
        "explanation": "Brief explanation of improvements..."
      }
    }

    Scoring Criteria:
    1. Job Title and Position Alignment (20%): How well the candidate's titles and roles align with the target position
    2. Skills Match (25%): Technical and soft skills matching the requirements
    3. Keywords and Industry Terms (20%): Usage of relevant industry terminology and keywords
    4. Experience Relevance (25%): How well past experiences match required responsibilities
    5. Action Verbs and Impact (10%): Use of strong action verbs and quantifiable achievements

    Resume Formatting Rules:
    1. Use markdown headers (## ) for section titles
    2. Keep the same section titles as the original resume
    3. Maintain the same overall structure
    4. For EVERY significant change, add a detailed explanation in curly brackets at the end of the modified line
    5. Keep contact information unchanged
    6. Focus explanations on:
       - Why the change improves ATS matching
       - How it aligns with job requirements
       - What specific skills or experiences are being highlighted

    Job Description:
    ${req.body.jobDescription}

    Original Resume:
    ${resumeContent}

    Remember: 
    1. Your response MUST start with "---SCORES---"
    2. EVERY significant change must have an explanation in curly brackets
    3. Explanations should be specific and detailed
    4. Focus on changes that improve ATS matching and alignment with the job requirements`;

    console.log('Sending prompt to OpenAI:', prompt);

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          "role": "system", 
          "content": "You are a professional resume writer and ATS expert. You MUST format your response exactly as specified, starting with ---SCORES--- and following the exact structure provided."
        },
        { "role": "user", "content": prompt }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });

    // Log the raw response
    console.log('\n=== RAW OPENAI RESPONSE ===');
    console.log(completion.choices[0].message.content);
    console.log('=== END RAW RESPONSE ===\n');

    // Parse the response to extract scores and optimized resume
    const response = completion.choices[0].message.content;
    let originalScores = {};
    let optimizedResume = '';
    let optimizedScores = {};

    try {
      // Extract scores and resume sections using more precise regex
      const scoresMatch = response.match(/---SCORES---([\s\S]*?)---OPTIMIZED_RESUME---/);
      const resumeMatch = response.match(/---OPTIMIZED_RESUME---([\s\S]*?)---OPTIMIZED_SCORES---/);
      const optimizedScoresMatch = response.match(/---OPTIMIZED_SCORES---([\s\S]*?)$/);

      console.log('\n=== PARSED SECTIONS ===');
      console.log('Scores Match:', scoresMatch ? 'Found' : 'Not Found');
      console.log('Resume Match:', resumeMatch ? 'Found' : 'Not Found');
      console.log('Optimized Scores Match:', optimizedScoresMatch ? 'Found' : 'Not Found');

      if (scoresMatch) {
        try {
          originalScores = JSON.parse(scoresMatch[1].trim());
          console.log('Original Scores:', originalScores);
        } catch (e) {
          console.error('Error parsing original scores:', e);
        }
      }

      if (resumeMatch) {
        optimizedResume = resumeMatch[1].trim();
        console.log('Optimized Resume Length:', optimizedResume.length);
      }

      if (optimizedScoresMatch) {
        try {
          optimizedScores = JSON.parse(optimizedScoresMatch[1].trim());
          console.log('Optimized Scores:', optimizedScores);
        } catch (e) {
          console.error('Error parsing optimized scores:', e);
        }
      }
    } catch (error) {
      console.error('Error parsing OpenAI response:', error);
    }

    // Send both original and optimized resumes with scores
    res.json({
      original: resumeContent,
      optimized: optimizedResume || completion.choices[0].message.content,
      originalScores,
      optimizedScores,
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