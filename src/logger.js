const winston = require('winston');
const axios = require('axios');

class SigNozTransport extends winston.Transport {
  constructor(opts) {
    super(opts);
    this.signozEndpoint = opts.signozEndpoint || 'https://ingest.in.signoz.cloud:443/v1/logs';
    this.signozToken = opts.signozToken;
    this.serviceName = opts.serviceName;
    this.batchSize = opts.batchSize || 100;
    this.batchTimeout = opts.batchTimeout || 5000;
    this.logs = [];
    this.timer = null;
  }

  async log(info, callback) {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        severity: info.level.toUpperCase(),
        message: info.message,
        attributes: {
          service: this.serviceName,
          environment: process.env.NODE_ENV,
          ...info.metadata
        },
        resource: {
          'service.name': this.serviceName,
          'service.environment': process.env.NODE_ENV
        }
      };

      this.logs.push(logEntry);

      if (this.logs.length >= this.batchSize) {
        await this.flush();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this.flush(), this.batchTimeout);
      }

      callback();
    } catch (error) {
      console.error('Error in SigNoz logging:', error);
      callback(error);
    }
  }

  async flush() {
    if (this.logs.length === 0) return;
    
    const logsToSend = [...this.logs];
    this.logs = [];
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    try {
      await axios.post(this.signozEndpoint, logsToSend, {
        headers: {
          'Content-Type': 'application/json',
          'signoz-access-token': this.signozToken
        }
      });
    } catch (error) {
      console.error('Error sending logs to SigNoz:', error);
      // Requeue failed logs
      this.logs = [...logsToSend, ...this.logs];
    }
  }
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.metadata(),
    winston.format.json()
  ),
  defaultMeta: {
    service: process.env.SERVICE_NAME
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // SigNoz transport
    new SigNozTransport({
      signozToken: process.env.SIGNOZ_TOKEN,
      serviceName: process.env.SERVICE_NAME,
      batchSize: 100,
      batchTimeout: 5000
    })
  ]
});

// Export logger instance
module.exports = logger;