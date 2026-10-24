const mongoose = require('mongoose');

const STATUS_RANK = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
  FAILED: 4
};

const messageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    tenantId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    conversationId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    to: {
      type: String,
      required: true,
      trim: true
    },
    text: {
      type: String,
      required: true,
      maxlength: 4096
    },
    status: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'],
      default: 'QUEUED',
      required: true,
      index: true
    },
    statusRank: {
      type: Number,
      default: STATUS_RANK.QUEUED,
      required: true
    },
    queuedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    sentAt: {
      type: Date,
      default: null
    },
    deliveredAt: {
      type: Date,
      default: null
    },
    readAt: {
      type: Date,
      default: null
    },
    failedAt: {
      type: Date,
      default: null
    },
    lastEventOccurredAt: {
      type: Date,
      default: null
    },
    version: {
      type: Number,
      default: 1
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        delete ret._id;
        delete ret.__v;
        delete ret.statusRank;
        delete ret.version;
        return ret;
      }
    }
  }
);

// Compound index for tenant-isolated conversation history retrieval with keyset pagination
messageSchema.index({ tenantId: 1, conversationId: 1, createdAt: 1, _id: 1 });
messageSchema.index({ tenantId: 1, messageId: 1 });

const Message = mongoose.model('Message', messageSchema);

module.exports = {
  Message,
  STATUS_RANK
};
