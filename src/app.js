const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const correlationIdMiddleware = require('./middleware/correlationId');
const requestLoggerMiddleware = require('./middleware/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security and standard middlewares
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Tracking and structured logging
app.use(correlationIdMiddleware);
app.use(requestLoggerMiddleware);

// API routes
app.use(routes);

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `The requested endpoint ${req.method} ${req.originalUrl} does not exist.`
    }
  });
});

// Centralized error handling
app.use(errorHandler);

module.exports = app;
