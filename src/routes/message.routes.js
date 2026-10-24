const { Router } = require('express');
const messageController = require('../controllers/message.controller');
const { requireTenantAuth, optionalTenantAuth } = require('../middleware/tenantAuth');
const { validateBody, validateParams, validateQuery } = require('../middleware/validate');
const {
  createMessageSchema,
  conversationParamsSchema,
  listConversationMessagesQuerySchema,
  messageParamsSchema
} = require('../schemas/message.schema');

const router = Router();

// POST /api/v1/messages
router.post(
  '/messages',
  validateBody(createMessageSchema),
  messageController.createMessage
);

// GET /api/v1/conversations/:conversationId/messages?limit=20&cursor=...
router.get(
  '/conversations/:conversationId/messages',
  requireTenantAuth,
  validateParams(conversationParamsSchema),
  validateQuery(listConversationMessagesQuerySchema),
  messageController.getConversationMessages
);

// GET /api/v1/messages/:messageId
router.get(
  '/messages/:messageId',
  optionalTenantAuth,
  validateParams(messageParamsSchema),
  messageController.getMessageById
);

module.exports = router;
