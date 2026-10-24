const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');

describe('Database Persistence Verification', () => {
  const persistDbPath = path.resolve('./data/test_persist_db');
  let mongodInstance = null;

  beforeAll(() => {
    fs.mkdirSync(persistDbPath, { recursive: true });
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongodInstance) {
      await mongodInstance.stop();
    }
    fs.rmSync(persistDbPath, { recursive: true, force: true });
  });

  it('persists message after server and database restart and allows retrieval', async () => {
    // 1. Initial server startup with disk storage
    mongodInstance = await MongoMemoryServer.create({
      binary: { version: '6.0.14' },
      instance: { dbPath: persistDbPath, storageEngine: 'wiredTiger' }
    });
    await mongoose.connect(mongodInstance.getUri());

    // 2. Create message via API
    const createRes = await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-persistent',
        conversationId: 'conv-disk-1',
        to: '+1999888777',
        text: 'Data that must survive a server restart'
      })
      .expect(201);

    const messageId = createRes.body.data.messageId;
    expect(messageId).toBeDefined();

    // 3. Simulate Server Shutdown: Disconnect and stop DB process
    await mongoose.disconnect();
    await mongodInstance.stop();
    mongodInstance = null;

    // 4. Simulate Server Restart: Launch DB pointing to the same disk path
    mongodInstance = await MongoMemoryServer.create({
      binary: { version: '6.0.14' },
      instance: { dbPath: persistDbPath, storageEngine: 'wiredTiger' }
    });
    await mongoose.connect(mongodInstance.getUri());

    // 5. Retrieve message from restarted server
    const getRes = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-persistent')
      .expect(200);

    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.messageId).toBe(messageId);
    expect(getRes.body.data.text).toBe('Data that must survive a server restart');
    expect(getRes.body.data.status).toBe('QUEUED');
  });
});
