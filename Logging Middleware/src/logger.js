const axios = require('axios');
require('dotenv').config();

class Logger {
  constructor(config = {}) {
    const { 
      apiUrl = process.env.LOG_API_URL || 'http://20.244.56.144', 
      timeout = parseInt(process.env.LOG_TIMEOUT) || 5000, 
      authToken = process.env.LOG_AUTH_TOKEN || null 
    } = config;
    
    this.apiClient = axios.create({
      baseURL: apiUrl,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken && { 'Authorization': `Bearer ${authToken}` })
      }
    });
  }

  async Log(stack, level, pkg, message) {
    try {
      const response = await this.apiClient.post('/evaluation-service/logs', {
        stack: stack.toLowerCase(),
        level: level.toLowerCase(),
        package: pkg.toLowerCase(),
        message
      });
      return response.data;
    } catch (error) {
      console.error(`[LOGGING_ERROR] ${error.message}`);
      return null;
    }
  }

  setAuthToken(token) {
    if (token) {
      this.apiClient.defaults.headers['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.apiClient.defaults.headers['Authorization'];
    }
  }
}

const defaultLogger = new Logger();

const Log = (stack, level, pkg, message) => {
  return defaultLogger.Log(stack, level, pkg, message);
};

module.exports = { Logger, Log, defaultLogger };
