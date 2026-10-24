const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    messageId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['SENT', 'DELIVERED', 'READ', 'FAILED'],
      required: true
    },
    occurredAt: {
      type: Date,
      required: true
    },
    receivedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    processedStatus: {
      type: String,
      enum: ['APPLIED', 'IGNORED_DUPLICATE', 'IGNORED_OUT_OF_ORDER', 'UNMATCHED_MESSAGE'],
      required: true,
      index: true
    },
    reason: {
      type: String,
      default: null
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

// Compound index for querying event history for a given message
webhookEventSchema.index({ messageId: 1, occurredAt: 1 });

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

module.exports = {
  WebhookEvent
};
