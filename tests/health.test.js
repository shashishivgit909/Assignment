const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb } = require('./test-helper');

describe('Health Endpoint', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it('GET /health returns healthy service status with database connectivity', async () => {
    const res = await request(app)
      .get('/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
    expect(res.body.timestamp).toBeDefined();
    expect(res.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(res.body.database).toBeDefined();
    expect(res.body.database.status).toBe('connected');

    // Confirm secrets are NOT exposed
    const stringified = JSON.stringify(res.body);
    expect(stringified).not.toContain('password');
    expect(stringified).not.toContain('mongodb://');
  });

  it('GET /api/v1/health is also accessible', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.status).toBe('healthy');
  });
});
