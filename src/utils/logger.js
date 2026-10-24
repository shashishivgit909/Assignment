const env = require('../config/env');

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevelPriority = LOG_LEVELS[env.logLevel] ?? LOG_LEVELS.info;

/**
 * Redacts sensitive fields and message contents to protect privacy & secrets
 */
function sanitize(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitize(item, depth + 1));
  }

  const sanitized = {};
  const sensitiveKeys = ['password', 'secret', 'token', 'authorization', 'apiKey', 'text'];

  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = key.toLowerCase() === 'text' 
        ? '[CONTENT_REDACTED_FOR_PRIVACY]'
        : '***REDACTED***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitize(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

function formatLog(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    message,
    ...sanitize(meta)
  };

  return JSON.stringify(entry);
}

const logger = {
  debug(message, meta) {
    if (currentLevelPriority <= LOG_LEVELS.debug && !env.isTest) {
      console.debug(formatLog('debug', message, meta));
    }
  },
  info(message, meta) {
    if (currentLevelPriority <= LOG_LEVELS.info && !env.isTest) {
      console.log(formatLog('info', message, meta));
    }
  },
  warn(message, meta) {
    if (currentLevelPriority <= LOG_LEVELS.warn && !env.isTest) {
      console.warn(formatLog('warn', message, meta));
    }
  },
  error(message, meta) {
    if (currentLevelPriority <= LOG_LEVELS.error && !env.isTest) {
      console.error(formatLog('error', message, meta));
    }
  }
};

module.exports = logger;
