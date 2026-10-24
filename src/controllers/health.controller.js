const { checkDatabaseHealth } = require('../config/database');
const queueService = require('../services/queue.service');
const env = require('../config/env');

class HealthController {
  getHealth(req, res) {
    const dbHealth = checkDatabaseHealth();
    const isHealthy = dbHealth.isHealthy;

    const payload = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      environment: env.nodeEnv,
      database: {
        status: dbHealth.status,
        name: dbHealth.databaseName
      },
      queue: queueService.getMetrics()
    };

    return res.status(isHealthy ? 200 : 503).json(payload);
  }
}

module.exports = new HealthController();
