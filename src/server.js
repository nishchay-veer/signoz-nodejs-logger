require('dotenv').config();
const express = require('express');
const logger = require('./logger');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  const start = Date.now();
  
  // Log after response is sent
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request processed', {
      metadata: {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        duration,
        userAgent: req.get('user-agent'),
        ip: req.ip
      }
    });
  });
  
  next();
});

app.use((err, req, res, next) => {
  logger.error('Application error', {
    metadata: {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url
    }
  });
  
  res.status(500).json({ error: 'Internal Server Error' });
});

app.get('/', (req, res) => {
  logger.info('Home route accessed', {
    metadata: {
      customField: 'test value'
    }
  });
  res.json({ message: 'Welcome to the SigNoz logging demo!' });
});

app.post('/api/data', (req, res) => {
  try {
    // Simulate some processing
    if (!req.body.data) {
      throw new Error('Data is required');
    }
    
    logger.info('Data processing successful', {
      metadata: {
        dataSize: JSON.stringify(req.body).length,
        processedAt: new Date().toISOString()
      }
    });
    
    res.json({ success: true });
  } catch (error) {
    logger.error('Data processing failed', {
      metadata: {
        error: error.message,
        payload: req.body
      }
    });
    res.status(400).json({ error: error.message });
  }
});

// Test error route
app.get('/error', (req, res, next) => {
  try {
    throw new Error('Test error');
  } catch (error) {
    next(error);
  }
});

// Start server
app.listen(port, () => {
  logger.info(`Server started`, {
    metadata: {
      port,
      environment: process.env.NODE_ENV,
      serviceName: process.env.SERVICE_NAME
    }
  });
});

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

async function gracefulShutdown() {
  logger.info('Starting graceful shutdown');
  
  // Find SigNoz transport and flush remaining logs
  const sigNozTransport = logger.transports.find(t => t instanceof SigNozTransport);
  if (sigNozTransport) {
    await sigNozTransport.flush();
  }
  
  process.exit(0);
}