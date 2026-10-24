const EventEmitter = require('events');
const logger = require('../utils/logger');

class QueueService extends EventEmitter {
  constructor() {
    super();
    this.jobs = [];
    this.deadLetterQueue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.baseBackoffMs = 100;
  }

  /**
   * Enqueues a job for dispatching or async work
   */
  enqueue(jobType, payload, options = {}) {
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: jobType,
      payload,
      attempts: 0,
      maxRetries: options.maxRetries || this.maxRetries,
      createdAt: new Date(),
      nextRunAt: new Date()
    };

    this.jobs.push(job);
    logger.debug('Job enqueued', { jobId: job.id, type: jobType });

    setImmediate(() => this.processNext());
    return job;
  }

  async processNext() {
    if (this.isProcessing || this.jobs.length === 0) {
      return;
    }

    const now = new Date();
    const readyIndex = this.jobs.findIndex(j => j.nextRunAt <= now);
    if (readyIndex === -1) {
      return;
    }

    const [job] = this.jobs.splice(readyIndex, 1);
    this.isProcessing = true;

    try {
      job.attempts += 1;
      logger.debug('Processing queue job', { jobId: job.id, attempt: job.attempts });

      // Emit event for registered handlers to process
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Job execution timed out')), 5000);

        this.emit(job.type, job.payload, err => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve();
        });
      });

      logger.debug('Job completed successfully', { jobId: job.id });
    } catch (err) {
      logger.error('Job processing failed', { jobId: job.id, attempt: job.attempts, error: err.message });

      if (job.attempts < job.maxRetries) {
        // Exponential backoff: baseBackoff * 2^(attempts - 1)
        const delay = this.baseBackoffMs * Math.pow(2, job.attempts - 1);
        job.nextRunAt = new Date(Date.now() + delay);
        this.jobs.push(job);
        logger.warn('Job scheduled for retry with backoff', { jobId: job.id, delayMs: delay });
      } else {
        // Move to Dead Letter Queue (DLQ)
        job.failedAt = new Date();
        job.failureReason = err.message;
        this.deadLetterQueue.push(job);
        logger.error('Job exceeded max retries, sent to Dead Letter Queue', { jobId: job.id });
      }
    } finally {
      this.isProcessing = false;
      if (this.jobs.length > 0) {
        setTimeout(() => this.processNext(), 50);
      }
    }
  }

  getMetrics() {
    return {
      pendingJobs: this.jobs.length,
      deadLetterJobs: this.deadLetterQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

module.exports = new QueueService();
