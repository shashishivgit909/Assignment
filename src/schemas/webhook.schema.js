const { z } = require('zod');

const providerWebhookSchema = z.object({
  eventId: z
    .string({ required_error: 'eventId is required' })
    .trim()
    .min(1, 'eventId cannot be empty')
    .max(100, 'eventId exceeds max 100 characters'),
  messageId: z
    .string({ required_error: 'messageId is required' })
    .trim()
    .min(1, 'messageId cannot be empty')
    .max(100, 'messageId exceeds max 100 characters'),
  status: z.enum(['SENT', 'DELIVERED', 'READ', 'FAILED'], {
    errorMap: () => ({ message: 'status must be one of: SENT, DELIVERED, READ, FAILED' })
  }),
  occurredAt: z
    .string({ required_error: 'occurredAt is required' })
    .refine(val => !isNaN(Date.parse(val)), {
      message: 'occurredAt must be a valid ISO 8601 date string'
    })
});

module.exports = {
  providerWebhookSchema
};
