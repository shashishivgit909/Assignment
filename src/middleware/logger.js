const logger = require('../utils/logger');

function requestLoggerMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs: duration,
      correlationId: req.correlationId,
      tenantId: req.headers['x-tenant-id'] || req.body?.tenantId || undefined,
      ip: req.ip
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP Request failed with server error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP Request failed with client error', logData);
    } else {
      logger.info('HTTP Request handled', logData);
    }
  });

  next();
}

module.exports = requestLoggerMiddleware;
