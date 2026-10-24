const request = require('supertest');
const app = require('../src/app');
const { setupTestDb, teardownTestDb, clearTestDb } = require('./test-helper');

describe('Message Endpoints', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  describe('POST /api/v1/messages', () => {
    it('should create and persist a new message with status QUEUED', async () => {
      const payload = {
        tenantId: 'tenant-alpha',
        conversationId: 'conv-101',
        to: '+919876543210',
        text: 'Your Order has shipped'
      };

      const res = await request(app)
        .post('/api/v1/messages')
        .send(payload)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.messageId).toMatch(/^msg_[a-f0-9-]+$/);
      expect(res.body.data.status).toBe('QUEUED');
      expect(res.body.data.tenantId).toBe(payload.tenantId);
      expect(res.body.data.conversationId).toBe(payload.conversationId);
      expect(res.body.data.to).toBe(payload.to);
      expect(res.body.data.text).toBe(payload.text);
      expect(res.body.data.queuedAt).toBeDefined();
    });

    it('should reject invalid payload with 400 Bad Request and detailed issues', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .send({
          tenantId: '',
          // missing conversationId
          to: 'a', // too short
          text: '' // empty
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(Array.isArray(res.body.error.details)).toBe(true);
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
    });

    it('should return 400 when x-tenant-id header does not match body tenantId', async () => {
      const res = await request(app)
        .post('/api/v1/messages')
        .set('x-tenant-id', 'tenant-a')
        .send({
          tenantId: 'tenant-b',
          conversationId: 'conv-101',
          to: '+919876543210',
          text: 'Hello'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_MISMATCH');
    });
  });

  describe('GET /api/v1/conversations/:conversationId/messages', () => {
    it('should retrieve conversation messages with stable pagination and cursor', async () => {
      const tenantId = 'tenant-test';
      const conversationId = 'conv-pagination-1';

      // Insert 5 test messages
      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post('/api/v1/messages')
          .send({
            tenantId,
            conversationId,
            to: `+1000000000${i}`,
            text: `Message ${i}`
          })
          .expect(201);
      }

      // Fetch page 1 with limit = 2
      const page1 = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages?limit=2`)
        .set('x-tenant-id', tenantId)
        .expect(200);

      expect(page1.body.success).toBe(true);
      expect(page1.body.data.length).toBe(2);
      expect(page1.body.pagination.hasMore).toBe(true);
      expect(page1.body.pagination.nextCursor).toBeDefined();

      const cursor = page1.body.pagination.nextCursor;

      // Fetch page 2 using cursor
      const page2 = await request(app)
        .get(`/api/v1/conversations/${conversationId}/messages?limit=2&cursor=${cursor}`)
        .set('x-tenant-id', tenantId)
        .expect(200);

      expect(page2.body.success).toBe(true);
      expect(page2.body.data.length).toBe(2);
      expect(page2.body.pagination.hasMore).toBe(true);

      // Verify records are distinct and in stable order
      const page1Ids = page1.body.data.map(m => m.messageId);
      const page2Ids = page2.body.data.map(m => m.messageId);
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it('should return 401 when x-tenant-id is omitted', async () => {
      const res = await request(app)
        .get('/api/v1/conversations/conv-123/messages')
        .expect(401);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('TENANT_AUTH_REQUIRED');
    });
  });

  describe('GET /api/v1/messages/:messageId', () => {
    it('should retrieve a message by messageId', async () => {
      const createRes = await request(app)
        .post('/api/v1/messages')
        .send({
          tenantId: 'tenant-alpha',
          conversationId: 'conv-101',
          to: '+919876543210',
          text: 'Retrieval check'
        })
        .expect(201);

      const messageId = createRes.body.data.messageId;

      const getRes = await request(app)
        .get(`/api/v1/messages/${messageId}`)
        .set('x-tenant-id', 'tenant-alpha')
        .expect(200);

      expect(getRes.body.success).toBe(true);
      expect(getRes.body.data.messageId).toBe(messageId);
      expect(getRes.body.data.status).toBe('QUEUED');
      expect(getRes.body.data.text).toBe('Retrieval check');
    });

    it('should return 404 for non-existent messageId', async () => {
      const res = await request(app)
        .get('/api/v1/messages/msg-non-existent')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');
    });
  });
});
