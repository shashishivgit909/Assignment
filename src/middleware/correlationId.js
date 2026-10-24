const crypto = require('crypto');

function correlationIdMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || `corr_${crypto.randomUUID()}`;
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  next();
}

module.exports = correlationIdMiddleware;
