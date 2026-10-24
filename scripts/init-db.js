/**
 * Reproducible Database Schema & Index Setup Script
 * Connects to the configured persistent database (Embedded WiredTiger, Local, or MongoDB Atlas),
 * provisions collections, and synchronizes compound indexes for high-throughput multi-tenancy.
 */

const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const { Message } = require('../src/models/message.model');
const { WebhookEvent } = require('../src/models/webhookEvent.model');

async function initDatabaseSchema() {
  console.log('\n============================================================');
  console.log('📦 REPRODUCIBLE DATABASE SCHEMA & INDEX SETUP');
  console.log('============================================================\n');

  try {
    const connection = await connectDatabase();
    console.log(`Connected to MongoDB (${connection.embedded ? 'Persistent Local WiredTiger Engine' : 'External / Atlas Cluster'}): ${connection.uri}\n`);

    // 1. Ensure Collections Exist
    console.log('1️⃣ Ensuring collections exist...');
    await Message.createCollection();
    await WebhookEvent.createCollection();
    console.log('   - Collection `messages` initialized');
    console.log('   - Collection `webhookevents` initialized\n');

    // 2. Synchronize and Build Indexes
    console.log('2️⃣ Synchronizing compound indexes...');
    await Message.syncIndexes();
    await WebhookEvent.syncIndexes();
    console.log('   - Indexes for `messages` synced');
    console.log('   - Indexes for `webhookevents` synced\n');

    // 3. Inspect Created Indexes
    console.log('3️⃣ Verifying active indexes:');
    const messageIndexes = await Message.collection.indexes();
    console.log('\n   Active indexes on `messages`:');
    messageIndexes.forEach(idx => console.log(`     • ${idx.name}: ${JSON.stringify(idx.key)}`));

    const webhookIndexes = await WebhookEvent.collection.indexes();
    console.log('\n   Active indexes on `webhookevents`:');
    webhookIndexes.forEach(idx => console.log(`     • ${idx.name}: ${JSON.stringify(idx.key)}`));

    console.log('\n============================================================');
    console.log('✅ DATABASE SCHEMA SETUP COMPLETED SUCCESSFULLY');
    console.log('============================================================\n');

    await disconnectDatabase();
    process.exit(0);
  } catch (error) {
    console.error('❌ Database schema setup failed:', error.message);
    await disconnectDatabase();
    process.exit(1);
  }
}

if (require.main === module) {
  initDatabaseSchema();
}

module.exports = { initDatabaseSchema };
