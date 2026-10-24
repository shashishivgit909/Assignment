const { Router } = require('express');
const webhookController = require('../controllers/webhook.controller');
const { validateBody } = require('../middleware/validate');
const { providerWebhookSchema } = require('../schemas/webhook.schema');

const router = Router();

// POST /api/v1/webhooks/provider
router.post(
  '/webhooks/provider',
  validateBody(providerWebhookSchema),
  webhookController.handleProviderWebhook
);

module.exports = router;
