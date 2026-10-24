const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const env = require('./env');
const logger = require('../utils/logger');

let mongodInstance = null;

async function connectDatabase(customUri = null) {
  const uriToUse = customUri || env.mongodbUri;

  if (uriToUse && uriToUse !== 'embedded') {
    logger.info('Connecting to external MongoDB instance...', { uriHost: uriToUse.split('@').pop() });
    await mongoose.connect(uriToUse);
    logger.info('Connected to external MongoDB successfully.');
    return { uri: uriToUse, embedded: false };
  }

  // Embedded persistent MongoDB instance using wiredTiger
  logger.info('Starting embedded persistent MongoDB engine...', { storagePath: env.dbStoragePath });
  fs.mkdirSync(env.dbStoragePath, { recursive: true });

  mongodInstance = await MongoMemoryServer.create({
    binary: {
      version: '6.0.14'
    },
    instance: {
      dbPath: env.dbStoragePath,
      storageEngine: 'wiredTiger'
    }
  });

  const embeddedUri = mongodInstance.getUri();
  logger.info('Connecting to embedded MongoDB instance...', { uri: embeddedUri });
  await mongoose.connect(embeddedUri);
  logger.info('Connected to embedded persistent MongoDB successfully.');

  return { uri: embeddedUri, embedded: true };
}

async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongodInstance) {
    await mongodInstance.stop();
    mongodInstance = null;
  }
  logger.info('Database disconnected and server cleaned up.');
}

function checkDatabaseHealth() {
  const readyState = mongoose.connection.readyState;
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const isHealthy = readyState === 1;

  return {
    isHealthy,
    status: isHealthy ? 'connected' : 'disconnected',
    readyState,
    databaseName: mongoose.connection.name || 'unknown'
  };
}

module.exports = {
  connectDatabase,
  disconnectDatabase,
  checkDatabaseHealth
};
