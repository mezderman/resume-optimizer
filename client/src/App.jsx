import { useState, useEffect } from 'react'

const ScoreDial = ({ score, label }) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    setAnimatedScore(0);
    const timer = setTimeout(() => {
      setAnimatedScore(score);
    }, 100);
    return () => clearTimeout(timer);
  }, [score]);

  const rotation = (animatedScore / 100) * 360;
  const isOver50 = rotation > 180;
  const fillStyle = {
    transform: `rotate(${Math.min(rotation, 180)}deg)`,
  };
  const fill2Style = {
    transform: `rotate(${Math.max(rotation - 180, 0)}deg)`,
    opacity: isOver50 ? 1 : 0,
  };

  return (
    <div className="score-dial">
      <div className="score-dial-circle">
        <div className="score-dial-fill" style={fillStyle}></div>
        <div className="score-dial-fill" style={fill2Style}></div>
        <div className="score-dial-center">
          <span className="score-value">{Math.round(animatedScore)}%</span>
          <span className="score-label">{label}</span>
        </div>
      </div>
    </div>
  );
};

// Helper function to parse resume into sections
const parseResumeIntoSections = (markdown) => {
  if (!markdown) return {};
  
  const sections = {};
  let currentSection = '';
  let currentContent = [];
  
  markdown.split('\n').forEach(line => {
    // Check for different header formats:
    // 1. Markdown headers (## or #)
    // 2. Bold text with asterisks (**Section**)
    // 3. Bold text with underscores (__Section__)
    const headerMatch = line.match(/^#{1,2}\s+(.+)$/) || // Markdown headers
                       line.match(/^\*\*([^*]+)\*\*$/) || // Bold with asterisks
                       line.match(/^__([^_]+)__$/);       // Bold with underscores
    
    if (headerMatch) {
      // Save previous section if it exists
      if (currentSection) {
        sections[currentSection] = currentContent.join('\n');
      }
      // Start new section
      currentSection = headerMatch[1].trim();
      currentContent = [line];
    } else {
      // Special case: if line contains only dashes, add it to current content
      if (line.trim() === '---') {
        currentContent.push(line);
      } 
      // Skip empty lines at the start of a section
      else if (line.trim() || currentContent.length > 0) {
        currentContent.push(line);
      }
    }
  });
  
  // Save the last section
  if (currentSection) {
    sections[currentSection] = currentContent.join('\n');
  }
  
  return sections;
};

// Helper function to process text with explanations
const processTextWithExplanations = (text) => {
  if (!text) return '';
  
  // Process the text line by line
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // Find content and explanation in curly brackets
    const match = line.match(/(.*?)\s*{([^}]+)}/);
    if (match) {
      const [_, content, explanation] = match;
      // Create a span with tooltip for the entire content
      return `<span class="tooltip-text" data-tooltip="${explanation.trim()}">${content.trim()}</span>`;
    }
    return line;
  });
  
  return processedLines.join('\n');
};

function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [jobDescription, setJobDescription] = useState('')
  const [status, setStatus] = useState('')
  const [originalResume, setOriginalResume] = useState('')
  const [optimizedResume, setOptimizedResume] = useState('')
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [originalScore, setOriginalScore] = useState(0)
  const [optimizedScore, setOptimizedScore] = useState(0)
  const [hasResults, setHasResults] = useState(false)

  const handleFileChange = (event) => {
    const file = event.target.files[0]
    if (file && (file.type === 'text/markdown' || file.name.endsWith('.md'))) {
      setSelectedFile(file)
      setStatus('')
      
      // Read and display the original resume
      const reader = new FileReader()
      reader.onload = (e) => {
        setOriginalResume(e.target.result)
      }
      reader.readAsText(file)
    } else {
      setSelectedFile(null)
      setStatus('Please select a Markdown (.md) file')
    }
  }

  const handleOptimize = async () => {
    if (!selectedFile || !jobDescription.trim()) {
      setStatus('Please provide both a resume file and job description')
      return
    }

    setIsOptimizing(true)
    setStatus('Optimizing your resume...')
    setHasResults(false)

    const formData = new FormData()
    formData.append('resume', selectedFile)
    formData.append('jobDescription', jobDescription)

    try {
      const response = await fetch('/api/optimize', {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const data = await response.json()
        setOriginalResume(data.original)
        setOptimizedResume(data.optimized)
        
        // Set scores from the API response
        if (data.originalScores?.original?.total) {
          setOriginalScore(data.originalScores.original.total)
        }
        if (data.optimizedScores?.optimized?.total) {
          setOptimizedScore(data.optimizedScores.optimized.total)
        }
        
        setStatus('Resume optimized successfully!')
        setHasResults(true)
      } else {
        const error = await response.json()
        setStatus(error.message || 'Optimization failed. Please try again.')
      }
    } catch (error) {
      setStatus('Error connecting to the server. Please try again.')
      console.error('Optimization error:', error)
    } finally {
      setIsOptimizing(false)
    }
  }

  // Parse resumes into sections
  const originalSections = parseResumeIntoSections(originalResume);
  const optimizedSections = parseResumeIntoSections(optimizedResume);

  // Get all unique section titles
  const allSections = Object.keys(originalSections);

  // Function to render content with HTML
  const renderContent = (content) => {
    return { __html: processTextWithExplanations(content) };
  };

  return (
    <div className="container">
      <h1>Resume Optimizer</h1>
      
      <div className="upload-section">
        <input
          type="file"
          accept=".md"
          onChange={handleFileChange}
          className="file-input"
          id="resume-upload"
        />
        <label htmlFor="resume-upload" className="file-label">
          {selectedFile ? selectedFile.name : 'Choose Markdown Resume'}
        </label>
      </div>

      <div className="job-description">
        <textarea
          placeholder="Paste the job description here..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          disabled={isOptimizing}
        />
      </div>

      <div className="upload-section">
        <button 
          onClick={handleOptimize}
          className="optimize-button"
          disabled={!selectedFile || !jobDescription.trim() || isOptimizing}
        >
          {isOptimizing ? 'Optimizing...' : 'Optimize Resume'}
        </button>
        
        {status && (
          <p className={`status-message ${status.includes('failed') || status.includes('error') ? 'error' : ''}`}>
            {status}
          </p>
        )}
      </div>

      {hasResults && (
        <>
          <div className="resume-scores">
            <div className="score-section">
              <h3 className="score-title">Original Resume Match</h3>
              <ScoreDial score={originalScore} label="Match Score" />
            </div>
            <div className="score-section">
              <h3 className="score-title">Optimized Resume Match</h3>
              <ScoreDial score={optimizedScore} label="Match Score" />
            </div>
          </div>

          <div className="resume-comparison">
            <div className="resume-headers">
              <h2>Original Resume</h2>
              <h2>Optimized Resume</h2>
            </div>
            {allSections.map((sectionTitle, index) => (
              <div key={index} className="section-comparison">
                <div className="section-title">{sectionTitle}</div>
                <div className="section-content">
                  <div className="original-section">
                    <pre className="resume-content">{originalSections[sectionTitle]}</pre>
                  </div>
                  <div className="optimized-section">
                    <pre 
                      className="resume-content"
                      dangerouslySetInnerHTML={renderContent(optimizedSections[sectionTitle])}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default App 