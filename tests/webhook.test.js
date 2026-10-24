const request = require('supertest');
const app = require('../src/app');
const { WebhookEvent } = require('../src/models/webhookEvent.model');
const { Message } = require('../src/models/message.model');
const { setupTestDb, teardownTestDb, clearTestDb } = require('./test-helper');

describe('Provider Webhooks Endpoints', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    await clearTestDb();
  });

  async function createTestMessage() {
    const res = await request(app)
      .post('/api/v1/messages')
      .send({
        tenantId: 'tenant-test',
        conversationId: 'conv-webhook-1',
        to: '+1234567890',
        text: 'Testing webhooks'
      })
      .expect(201);
    return res.body.data.messageId;
  }

  describe('Forward Status Progression', () => {
    it('should transition status from QUEUED -> SENT -> DELIVERED -> READ', async () => {
      const messageId = await createTestMessage();

      // 1. SENT
      const sentRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-sent-1',
          messageId,
          status: 'SENT',
          occurredAt: '2026-10-16T08:00:00.000Z'
        })
        .expect(200);

      expect(sentRes.body.success).toBe(true);
      expect(sentRes.body.data.currentStatus).toBe('SENT');

      // 2. DELIVERED
      const delivRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-deliv-1',
          messageId,
          status: 'DELIVERED',
          occurredAt: '2026-10-16T08:01:00.000Z'
        })
        .expect(200);

      expect(delivRes.body.success).toBe(true);
      expect(delivRes.body.data.currentStatus).toBe('DELIVERED');

      // 3. READ
      const readRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-read-1',
          messageId,
          status: 'READ',
          occurredAt: '2026-10-16T08:02:00.000Z'
        })
        .expect(200);

      expect(readRes.body.success).toBe(true);
      expect(readRes.body.data.currentStatus).toBe('READ');

      // Verify database state and timestamps
      const msg = await Message.findOne({ messageId });
      expect(msg.status).toBe('READ');
      expect(msg.sentAt).toBeDefined();
      expect(msg.deliveredAt).toBeDefined();
      expect(msg.readAt).toBeDefined();
    });
  });

  describe('Idempotency', () => {
    it('repeated eventId must not duplicate event records or apply effects twice', async () => {
      const messageId = await createTestMessage();
      const eventPayload = {
        eventId: 'evt-idempotent-100',
        messageId,
        status: 'DELIVERED',
        occurredAt: '2026-10-16T08:30:00.000Z'
      };

      // First call: succeeds and applies
      const firstRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send(eventPayload)
        .expect(200);

      expect(firstRes.body.success).toBe(true);
      expect(firstRes.body.applied).toBe(true);

      // Second call: duplicate eventId
      const secondRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send(eventPayload)
        .expect(200);

      expect(secondRes.body.success).toBe(true);
      expect(secondRes.body.duplicate).toBe(true);
      expect(secondRes.body.message).toMatch(/duplicate/i);

      // Third call: repeated again
      const thirdRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send(eventPayload)
        .expect(200);

      expect(thirdRes.body.duplicate).toBe(true);

      // Verify in DB that only exactly 1 event record exists for this eventId
      const eventCount = await WebhookEvent.countDocuments({ eventId: eventPayload.eventId });
      expect(eventCount).toBe(1);
    });
  });

  describe('Out-of-Order Handling & Progression Rules', () => {
    it('should NOT move message backwards when older event arrives (DELIVERED before SENT)', async () => {
      const messageId = await createTestMessage();

      // Step 1: DELIVERED arrives first
      await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-out-of-order-deliv',
          messageId,
          status: 'DELIVERED',
          occurredAt: '2026-10-16T08:10:00.000Z'
        })
        .expect(200);

      let msg = await Message.findOne({ messageId });
      expect(msg.status).toBe('DELIVERED');

      // Step 2: Delayed SENT event arrives with earlier timestamp
      const sentRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-out-of-order-sent',
          messageId,
          status: 'SENT',
          occurredAt: '2026-10-16T08:05:00.000Z'
        })
        .expect(200);

      expect(sentRes.body.success).toBe(true);
      expect(sentRes.body.applied).toBe(false);
      expect(sentRes.body.data.currentStatus).toBe('DELIVERED');

      // Verify status in DB was NOT moved backwards to SENT
      msg = await Message.findOne({ messageId });
      expect(msg.status).toBe('DELIVERED');
      // But sentAt timestamp should be backfilled
      expect(msg.sentAt).toEqual(new Date('2026-10-16T08:05:00.000Z'));

      // Verify event record was saved with IGNORED_OUT_OF_ORDER
      const delayedEvent = await WebhookEvent.findOne({ eventId: 'evt-out-of-order-sent' });
      expect(delayedEvent).toBeDefined();
      expect(delayedEvent.processedStatus).toBe('IGNORED_OUT_OF_ORDER');
    });

    it('should not allow moving from DELIVERED or READ to FAILED', async () => {
      const messageId = await createTestMessage();

      // Transition to DELIVERED
      await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-del-check',
          messageId,
          status: 'DELIVERED',
          occurredAt: '2026-10-16T08:15:00.000Z'
        })
        .expect(200);

      // Attempt to send FAILED
      const failedRes = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-fail-check',
          messageId,
          status: 'FAILED',
          occurredAt: '2026-10-16T08:16:00.000Z'
        })
        .expect(200);

      expect(failedRes.body.applied).toBe(false);
      expect(failedRes.body.data.currentStatus).toBe('DELIVERED');

      const msg = await Message.findOne({ messageId });
      expect(msg.status).toBe('DELIVERED');
    });
  });

  describe('Unknown Message ID Strategy', () => {
    it('should return 404 and persist unmatched event when messageId does not exist', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-orphan-001',
          messageId: 'msg-unknown-does-not-exist',
          status: 'DELIVERED',
          occurredAt: '2026-10-16T08:00:00.000Z'
        })
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('MESSAGE_NOT_FOUND');

      // Check that event was persisted with UNMATCHED_MESSAGE for audit
      const orphanEvent = await WebhookEvent.findOne({ eventId: 'evt-orphan-001' });
      expect(orphanEvent).toBeDefined();
      expect(orphanEvent.processedStatus).toBe('UNMATCHED_MESSAGE');
    });
  });

  describe('Payload Validation', () => {
    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          // missing eventId
          messageId: 'msg-123',
          status: 'DELIVERED'
          // missing occurredAt
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid status value', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-invalid-status',
          messageId: 'msg-123',
          status: 'PENDING_INVALID',
          occurredAt: '2026-10-16T08:00:00.000Z'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid occurredAt timestamp', async () => {
      const res = await request(app)
        .post('/api/v1/webhooks/provider')
        .send({
          eventId: 'evt-invalid-date',
          messageId: 'msg-123',
          status: 'DELIVERED',
          occurredAt: 'not-a-valid-date'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });
});
