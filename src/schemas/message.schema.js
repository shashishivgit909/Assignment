const { z } = require('zod');

const createMessageSchema = z.object({
  tenantId: z.string().trim().min(1, 'tenantId is required').max(100, 'tenantId exceeds max 100 characters'),
  conversationId: z.string().trim().min(1, 'conversationId is required').max(100, 'conversationId exceeds max 100 characters'),
  to: z.string().trim().min(3, 'to recipient must be at least 3 characters').max(50, 'to recipient exceeds max 50 characters'),
  text: z.string().min(1, 'text cannot be empty').max(4096, 'text exceeds max 4096 characters')
});

const listConversationMessagesQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .default('20')
    .transform(val => {
      const parsed = parseInt(val, 10);
      if (isNaN(parsed) || parsed < 1) return 20;
      if (parsed > 100) return 100;
      return parsed;
    }),
  cursor: z.string().optional()
});

const conversationParamsSchema = z.object({
  conversationId: z.string().trim().min(1, 'conversationId is required').max(100)
});

const messageParamsSchema = z.object({
  messageId: z.string().trim().min(1, 'messageId is required').max(100)
});

module.exports = {
  createMessageSchema,
  listConversationMessagesQuerySchema,
  conversationParamsSchema,
  messageParamsSchema
};
