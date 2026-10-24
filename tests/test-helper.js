const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Extend default Jest timeout for in-memory MongoDB initialization
jest.setTimeout(60000);

let mongod = null;

async function setupTestDb() {
  mongod = await MongoMemoryServer.create({
    binary: {
      version: '6.0.14'
    }
  });
  const uri = mongod.getUri();
  await mongoose.connect(uri);
  return uri;
}

async function teardownTestDb() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongod) {
    await mongod.stop();
  }
}

async function clearTestDb() {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
}

module.exports = {
  setupTestDb,
  teardownTestDb,
  clearTestDb
};
