const webhookService = require('../services/webhook.service');

class WebhookController {
  async handleProviderWebhook(req, res, next) {
    try {
      const { eventId, messageId, status, occurredAt } = req.body;

      const result = await webhookService.processProviderWebhook({
        eventId,
        messageId,
        status,
        occurredAt,
        rawPayload: req.body
      });

      // 1. Idempotent duplicate event
      if (result.isDuplicate) {
        return res.status(200).json({
          success: true,
          duplicate: true,
          eventId: result.eventId,
          messageId: result.messageId,
          message: result.message
        });
      }

      // 2. Unknown message ID strategy (documented 404 response with audit persistence)
      if (result.isUnknownMessage) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MESSAGE_NOT_FOUND',
            message: `Message with ID '${result.messageId}' does not exist. Event recorded for audit reconciliation.`
          },
          eventId: result.eventId
        });
      }

      // 3. Normal applied status transition or out-of-order non-regressive receipt
      return res.status(200).json({
        success: true,
        eventId: result.eventId,
        messageId: result.messageId,
        message: result.message,
        applied: result.applied,
        data: {
          currentStatus: result.currentStatus,
          previousStatus: result.previousStatus || undefined,
          ignoredStatus: result.ignoredStatus || undefined
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new WebhookController();
