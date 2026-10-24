const app = require('./app');
const env = require('./config/env');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const logger = require('./utils/logger');

let server = null;

async function startServer() {
  try {
    logger.info('Initializing application server...');
    await connectDatabase();

    server = app.listen(env.port, () => {
      logger.info(`Multi-Tenant Messaging Platform API running on port ${env.port}`, {
        port: env.port,
        environment: env.nodeEnv,
        healthEndpoint: `http://localhost:${env.port}/health`,
        apiBase: `http://localhost:${env.port}/api/v1`
      });
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Gracefully shutting down server...`);
      if (server) {
        server.close(async () => {
          logger.info('HTTP server closed.');
          await disconnectDatabase();
          logger.info('Graceful shutdown completed.');
          process.exit(0);
        });
      } else {
        await disconnectDatabase();
        process.exit(0);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (err) {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    await disconnectDatabase();
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
