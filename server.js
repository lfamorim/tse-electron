const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('yaml');

const { queryTSE, CaptchaError } = require('./main');

// Common user agents for rotation
const userAgents = [ 
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Safari/605.1.15'
];

// Common screen resolutions
const screenResolutions = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 }
];

// Language codes
const languages = ['pt-BR', 'pt', 'en-US'];

// Get random item from array
const getRandomItem = (array) => array[Math.floor(Math.random() * array.length)];

const app = express();
const port = process.env.PORT || 3000;

// Parse swagger.yaml
const swaggerDocument = yaml.parse(fs.readFileSync('./swagger.yaml', 'utf8'));

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Retry wrapper for queryTSE
async function queryTSEWithRetry(options, signal, maxRetries = 6) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (signal?.aborted) {
        throw new Error('Operation aborted');
      }
      console.log(`Attempt ${attempt} of ${maxRetries}`);
      return await queryTSE({ ...options, signal });
    } catch (error) {
      lastError = error;
      if (signal?.aborted || error.message === 'Operation aborted') {
        throw error; // If aborted, stop retrying
      }
      if (!(error.type == 'CaptchaError')) {
        throw error; // If it's not a CaptchaError, throw immediately
      }
      if (attempt === maxRetries) {
        throw error; // If we're out of retries, throw the last error
      }
      // Wait 1 second before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

// Routes
app.get('/', async (req, res) => {
  try {
    const { inscricaoNome, nomeMae, dataNascimento } = req.query;

    if (!inscricaoNome || !nomeMae || !dataNascimento) {
      return res.status(400).json({
        error: 'Missing required fields',
        requiredFields: ['inscricaoNome', 'nomeMae', 'dataNascimento']
      });
    }

    // Get random configurations
    const userAgent = getRandomItem(userAgents);
    const resolution = getRandomItem(screenResolutions);
    const language = getRandomItem(languages);

    // Add anonymity options
    const options = {
      inscricaoNome,
      nomeMae,
      dataNascimento,
      userAgent,
      resolution,
      language
    };

    const result = await (() => {
      const controller = new AbortController();
      const signal = controller.signal;
      
      return Promise.race([
        queryTSEWithRetry(options, signal),
        queryTSEWithRetry(options, signal)
      ])
        .then(result => {
        controller.abort(); // Abort the other query when one succeeds
        return result;
      }).catch(error => {
        controller.abort(); // Also abort on error
        throw error;
      });
    })();
    res.json({
      inscricaoNome,
      nomeMae,
      dataNascimento,
      ...result.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      type: error.type || 'UNKNOWN_ERROR',
      timestamp: new Date().toISOString()
    });
  }
});

// Only run Electron app if this file is the main module
const { app: electronApp } = require('electron');

electronApp.whenReady().then(() => {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`API documentation available at http://localhost:${port}/api-docs`);
  });
});
