const messageService = require('../services/message.service');
const queueService = require('../services/queue.service');
const env = require('../config/env');

class MessageController {
  async createMessage(req, res, next) {
    try {
      const headerTenantId = req.headers['x-tenant-id'];
      const { tenantId, conversationId, to, text } = req.body;

      // If x-tenant-id header is provided, it must match body tenantId to prevent tenant spoofing
      if (headerTenantId && headerTenantId !== tenantId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TENANT_MISMATCH',
            message: `tenantId in payload ('${tenantId}') does not match x-tenant-id header ('${headerTenantId}')`
          }
        });
      }

      const message = await messageService.createMessage({
        tenantId,
        conversationId,
        to,
        text
      });

      // Stretch goal: If worker simulation is enabled, dispatch to simulated queue
      if (env.enableWorkerSimulation) {
        queueService.enqueue('DISPATCH_MESSAGE', { messageId: message.messageId });
      }

      return res.status(201).json({
        success: true,
        data: message
      });
    } catch (err) {
      next(err);
    }
  }

  async getConversationMessages(req, res, next) {
    try {
      const tenantId = req.tenantId; // Guaranteed by requireTenantAuth
      const { conversationId } = req.params;
      const { limit, cursor } = req.query;

      const result = await messageService.getConversationMessages({
        tenantId,
        conversationId,
        limit,
        cursor
      });

      return res.status(200).json({
        success: true,
        data: result.messages,
        pagination: result.pagination
      });
    } catch (err) {
      next(err);
    }
  }

  async getMessageById(req, res, next) {
    try {
      const { messageId } = req.params;
      const tenantId = req.tenantId || null; // Optional isolation check if header provided

      const message = await messageService.getMessageById(messageId, tenantId);

      if (!message) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'MESSAGE_NOT_FOUND',
            message: `Message with ID '${messageId}' was not found`
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: message
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new MessageController();
