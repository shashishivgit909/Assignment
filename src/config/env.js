const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const env = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongodbUri: process.env.MONGODB_URI || 'embedded',
  dbStoragePath: path.resolve(process.env.DB_STORAGE_PATH || './data/db'),
  enableWorkerSimulation: process.env.ENABLE_WORKER_SIMULATION === 'true',
  logLevel: process.env.LOG_LEVEL || 'info',
  isTest: process.env.NODE_ENV === 'test'
};

module.exports = env;
