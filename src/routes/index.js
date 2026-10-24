const { Router } = require('express');
const messageRoutes = require('./message.routes');
const webhookRoutes = require('./webhook.routes');
const healthRoutes = require('./health.routes');

const router = Router();

// Mount API v1 endpoints
router.use('/api/v1', messageRoutes);
router.use('/api/v1', webhookRoutes);

// Health check endpoint (also available directly at /health)
router.use('/', healthRoutes);
router.use('/api/v1', healthRoutes);

module.exports = router;
