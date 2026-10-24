const crypto = require('crypto');
const { Message, STATUS_RANK } = require('../models/message.model');
const { encodeCursor, decodeCursor } = require('../utils/pagination');

class MessageService {
  /**
   * Creates and persists a new message with initial status QUEUED
   */
  async createMessage({ tenantId, conversationId, to, text }) {
    const messageId = `msg_${crypto.randomUUID()}`;
    const now = new Date();

    const message = new Message({
      messageId,
      tenantId,
      conversationId,
      to,
      text,
      status: 'QUEUED',
      statusRank: STATUS_RANK.QUEUED,
      queuedAt: now
    });

    await message.save();
    return message.toJSON();
  }

  /**
   * Retrieves messages for a conversation with cursor-based pagination and strict tenant isolation
   */
  async getConversationMessages({ tenantId, conversationId, limit = 20, cursor = null }) {
    const query = {
      tenantId,
      conversationId
    };

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        query.$or = [
          { createdAt: { $gt: decoded.createdAt } },
          { createdAt: decoded.createdAt, _id: { $gt: decoded.id } }
        ];
      }
    }

    // Fetch limit + 1 to reliably detect next page
    const rawItems = await Message.find(query)
      .sort({ createdAt: 1, _id: 1 })
      .limit(limit + 1)
      .exec();

    const hasMore = rawItems.length > limit;
    const pageItems = hasMore ? rawItems.slice(0, limit) : rawItems;

    let nextCursor = null;
    if (hasMore && pageItems.length > 0) {
      const last = pageItems[pageItems.length - 1];
      nextCursor = encodeCursor(last.createdAt, last._id);
    }

    return {
      messages: pageItems.map(m => m.toJSON()),
      pagination: {
        limit,
        count: pageItems.length,
        hasMore,
        nextCursor
      }
    };
  }

  /**
   * Retrieves message details by messageId with optional tenant isolation check
   */
  async getMessageById(messageId, tenantId = null) {
    const query = { messageId };
    if (tenantId) {
      query.tenantId = tenantId;
    }

    const message = await Message.findOne(query).exec();
    return message ? message.toJSON() : null;
  }
}

module.exports = new MessageService();
