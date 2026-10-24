const { ZodError } = require('zod');

function formatZodErrors(error) {
  return error.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    rule: issue.code
  }));
}

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request body payload',
            details: formatZodErrors(err)
          }
        });
      }
      next(err);
    }
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: formatZodErrors(err)
          }
        });
      }
      next(err);
    }
  };
}

function validateParams(schema) {
  return (req, res, next) => {
    try {
      req.params = schema.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid route parameters',
            details: formatZodErrors(err)
          }
        });
      }
      next(err);
    }
  };
}

module.exports = {
  validateBody,
  validateQuery,
  validateParams
};
