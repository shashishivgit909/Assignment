const { Message, STATUS_RANK } = require('../models/message.model');
const { WebhookEvent } = require('../models/webhookEvent.model');
const logger = require('../utils/logger');

class WebhookService {
  /**
   * Status progression hierarchy:
   * QUEUED (0) -> SENT (1) -> DELIVERED (2) -> READ (3)
   * FAILED (4) is a terminal failure state.
   */

  isValidForwardTransition(currentStatus, incomingStatus) {
    const currentRank = STATUS_RANK[currentStatus] ?? 0;
    const incomingRank = STATUS_RANK[incomingStatus] ?? 0;

    // Terminal states cannot transition
    if (currentStatus === 'FAILED') {
      return false;
    }

    // FAILED is only permissible from QUEUED or SENT
    if (incomingStatus === 'FAILED') {
      return currentStatus === 'QUEUED' || currentStatus === 'SENT';
    }

    // Normal forward progression: rank must strictly increase
    return incomingRank > currentRank;
  }

  /**
   * Main idempotent webhook processor
   */
  async processProviderWebhook({ eventId, messageId, status, occurredAt, rawPayload = {} }) {
    const eventTimestamp = new Date(occurredAt);

    // 1. Idempotency Check: check if eventId has already been persisted
    const existingEvent = await WebhookEvent.findOne({ eventId }).exec();
    if (existingEvent) {
      logger.info('Duplicate webhook event detected and handled idempotently', {
        eventId,
        messageId,
        status,
        originalReceivedAt: existingEvent.receivedAt
      });

      return {
        isDuplicate: true,
        eventId,
        messageId,
        status: existingEvent.status,
        processedStatus: existingEvent.processedStatus,
        message: 'Duplicate event acknowledged idempotently; no changes applied'
      };
    }

    // 2. Unknown Message Handling: Check if message exists
    const message = await Message.findOne({ messageId }).exec();
    if (!message) {
      logger.warn('Webhook received for non-existent message ID', { eventId, messageId, status });

      // Persist unmatched event for auditing and potential reconciliation
      const unmatchedEvent = new WebhookEvent({
        eventId,
        messageId,
        status,
        occurredAt: eventTimestamp,
        processedStatus: 'UNMATCHED_MESSAGE',
        reason: `Message ID ${messageId} was not found in the system`,
        payload: rawPayload
      });
      await unmatchedEvent.save();

      return {
        isUnknownMessage: true,
        eventId,
        messageId,
        status
      };
    }

    const currentStatus = message.status;
    const currentRank = message.statusRank;
    const incomingRank = STATUS_RANK[status];

    // 3. Status Progression & Out-of-Order Handling
    const isForward = this.isValidForwardTransition(currentStatus, status);

    if (isForward) {
      // Valid forward transition (e.g., QUEUED -> SENT, SENT -> DELIVERED, DELIVERED -> READ)
      const timestampFieldMap = {
        SENT: 'sentAt',
        DELIVERED: 'deliveredAt',
        READ: 'readAt',
        FAILED: 'failedAt'
      };

      const updateFields = {
        status,
        statusRank: incomingRank,
        lastEventOccurredAt: eventTimestamp,
        $inc: { version: 1 }
      };

      const timeField = timestampFieldMap[status];
      if (timeField) {
        updateFields[timeField] = eventTimestamp;
      }

      // Optimistic concurrency / atomic update safeguard
      // Ensures no race condition regresses the status if two requests execute concurrently
      const updatedMessage = await Message.findOneAndUpdate(
        {
          messageId,
          statusRank: { $lt: incomingRank } // Atomic guard
        },
        updateFields,
        { new: true }
      ).exec();

      // Persist event before returning success
      const eventRecord = new WebhookEvent({
        eventId,
        messageId,
        status,
        occurredAt: eventTimestamp,
        processedStatus: 'APPLIED',
        reason: `Transitioned from ${currentStatus} to ${status}`,
        payload: rawPayload
      });
      await eventRecord.save();

      logger.info('Message status successfully updated via webhook', {
        eventId,
        messageId,
        fromStatus: currentStatus,
        toStatus: status
      });

      return {
        success: true,
        eventId,
        messageId,
        previousStatus: currentStatus,
        currentStatus: updatedMessage ? updatedMessage.status : status,
        applied: true,
        message: `Status transitioned from ${currentStatus} to ${status}`
      };
    }

    // Out-of-order or duplicate status update:
    // Example: Current status is READ or DELIVERED, but a delayed SENT webhook arrives
    logger.warn('Out-of-order or regressive webhook received; preventing backward transition', {
      eventId,
      messageId,
      currentStatus,
      incomingStatus: status,
      occurredAt
    });

    // Backfill timestamp if relevant and not already populated
    const timestampFieldMap = {
      SENT: 'sentAt',
      DELIVERED: 'deliveredAt',
      READ: 'readAt'
    };
    const timeField = timestampFieldMap[status];
    if (timeField && !message[timeField]) {
      await Message.updateOne(
        { messageId, [timeField]: null },
        { [timeField]: eventTimestamp }
      ).exec();
    }

    // Persist event record acknowledging out-of-order receipt
    const eventRecord = new WebhookEvent({
      eventId,
      messageId,
      status,
      occurredAt: eventTimestamp,
      processedStatus: 'IGNORED_OUT_OF_ORDER',
      reason: `Ignored status ${status} because current status ${currentStatus} takes precedence`,
      payload: rawPayload
    });
    await eventRecord.save();

    return {
      success: true,
      eventId,
      messageId,
      currentStatus,
      ignoredStatus: status,
      applied: false,
      message: `Out-of-order event acknowledged without regressing message status from ${currentStatus}`
    };
  }
}

module.exports = new WebhookService();
