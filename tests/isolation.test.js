const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb, clearTestDb } = require('./test-helper');

describe('Multi-Tenant Isolation', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  it('enforces tenant isolation across conversation history', async () => {
    const conversationId = 'shared-conv-name-100';

    // Tenant A creates 2 messages in conv-100
    await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-a',
        conversationId,
        to: '+1111111111',
        text: 'Secret message from Tenant A'
      })
      .expect(201);

    await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-a',
        conversationId,
        to: '+1111111111',
        text: 'Second secret from Tenant A'
      })
      .expect(201);

    // Tenant B creates 1 message in conv-100
    await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-b',
        conversationId,
        to: '+2222222222',
        text: 'Private data from Tenant B'
      })
      .expect(201);

    // Tenant A queries the conversation
    const resA = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('x-tenant-id', 'tenant-a')
      .expect(200);

    expect(resA.body.data.length).toBe(2);
    for (const msg of resA.body.data) {
      expect(msg.tenantId).toBe('tenant-a');
      expect(msg.text).not.toContain('Tenant B');
    }

    // Tenant B queries the same conversation ID
    const resB = await request(app)
      .get(`/api/v1/conversations/${conversationId}/messages`)
      .set('x-tenant-id', 'tenant-b')
      .expect(200);

    expect(resB.body.data.length).toBe(1);
    expect(resB.body.data[0].tenantId).toBe('tenant-b');
    expect(resB.body.data[0].text).toContain('Tenant B');
  });

  it('prevents tenant B from retrieving message of tenant A by messageId', async () => {
    // Tenant A creates a message
    const createRes = await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-a',
        conversationId: 'conv-private',
        to: '+1111111111',
        text: 'Confidential Tenant A info'
      })
      .expect(201);

    const messageId = createRes.body.data.messageId;

    // Tenant B attempts to fetch messageId of Tenant A
    const unauthorizedRes = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-b')
      .expect(404); // Returns 404 to prevent enumeration/disclosure

    expect(unauthorizedRes.body.success).toBe(false);
    expect(unauthorizedRes.body.error.code).toBe('MESSAGE_NOT_FOUND');

    // Tenant A fetches its own message successfully
    const authorizedRes = await request(app)
      .get(`/api/v1/messages/${messageId}`)
      .set('x-tenant-id', 'tenant-a')
      .expect(200);

    expect(authorizedRes.body.data.messageId).toBe(messageId);
  });
});
