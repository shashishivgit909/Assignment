const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // Syntax error in JSON body
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains malformed JSON'
      }
    });
  }

  // MongoDB duplicate key error (E11000)
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || {});
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: `A resource with duplicate field [${fields.join(', ')}] already exists`,
        fields
      }
    });
  }

  // App specific errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code || 'BAD_REQUEST',
        message: err.message,
        details: err.details || undefined
      }
    });
  }

  // Unhandled server error
  logger.error('Unhandled internal server error', {
    correlationId: req.correlationId,
    message: err.message,
    stack: err.stack
  });

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please refer to correlation ID for support.'
    },
    correlationId: req.correlationId
  });
}

module.exports = errorHandler;
