/**
 * Local Webhook Simulator Script
 * Demonstrates the end-to-end lifecycle of messages, forward status transitions,
 * idempotent duplicate event handling, out-of-order event resilience, and unknown message handling.
 */

const http = require('http');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const [host, port] = BASE_URL.replace('http://', '').replace('https://', '').split(':');

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const reqOptions = {
      hostname: host,
      port: port || 3000,
      path: options.path,
      method: options.method,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data ? JSON.parse(data) : null
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runSimulation() {
  console.log('\n============================================================');
  console.log('🚀 MULTI-TENANT MESSAGING PLATFORM - WEBHOOK SIMULATOR');
  console.log('============================================================\n');

  // Step 1: Health Check
  console.log('1️⃣ Checking API Health: GET /health');
  const healthRes = await request({ method: 'GET', path: '/health' });
  console.log(`Status: ${healthRes.statusCode}`, JSON.stringify(healthRes.body, null, 2));

  // Step 2: Create a message
  console.log('\n2️⃣ Creating Message: POST /api/v1/messages');
  const createPayload = {
    tenantId: 'tenant-demo',
    conversationId: 'conv-999',
    to: '+14155552671',
    text: 'Hello from automated simulation!'
  };
  const createRes = await request(
    { method: 'POST', path: '/api/v1/messages', headers: { 'x-tenant-id': 'tenant-demo' } },
    createPayload
  );
  console.log(`Status: ${createRes.statusCode}`, JSON.stringify(createRes.body, null, 2));

  if (!createRes.body || !createRes.body.data) {
    console.error('Failed to create message. Make sure the server is running on port 3000!');
    process.exit(1);
  }

  const messageId = createRes.body.data.messageId;

  // Step 3: Provider sends SENT webhook
  console.log(`\n3️⃣ Simulating Webhook: SENT event for ${messageId}`);
  const sentRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: `evt-sent-${Date.now()}`,
      messageId: messageId,
      status: 'SENT',
      occurredAt: new Date(Date.now() - 30000).toISOString()
    }
  );
  console.log(`Status: ${sentRes.statusCode}`, JSON.stringify(sentRes.body, null, 2));

  // Step 4: Provider sends DELIVERED webhook
  console.log(`\n4️⃣ Simulating Webhook: DELIVERED event for ${messageId}`);
  const deliveredEventId = `evt-del-${Date.now()}`;
  const deliveredRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: deliveredEventId,
      messageId: messageId,
      status: 'DELIVERED',
      occurredAt: new Date(Date.now() - 15000).toISOString()
    }
  );
  console.log(`Status: ${deliveredRes.statusCode}`, JSON.stringify(deliveredRes.body, null, 2));

  // Step 5: Test IDEMPOTENCY by replaying DELIVERED event with same eventId
  console.log(`\n5️⃣ Testing Idempotency: Replaying duplicate DELIVERED event (${deliveredEventId})`);
  const duplicateRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: deliveredEventId,
      messageId: messageId,
      status: 'DELIVERED',
      occurredAt: new Date(Date.now() - 15000).toISOString()
    }
  );
  console.log(`Status: ${duplicateRes.statusCode}`, JSON.stringify(duplicateRes.body, null, 2));
  console.log(`👉 Duplicate detected safely: ${duplicateRes.body?.duplicate === true ? 'YES ✅' : 'NO ❌'}`);

  // Step 6: Test OUT-OF-ORDER event: Attempting to send older SENT event after DELIVERED
  console.log(`\n6️⃣ Testing Out-Of-Order Event: Sending SENT event after message is already DELIVERED`);
  const outOfOrderRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: `evt-delayed-sent-${Date.now()}`,
      messageId: messageId,
      status: 'SENT',
      occurredAt: new Date(Date.now() - 40000).toISOString()
    }
  );
  console.log(`Status: ${outOfOrderRes.statusCode}`, JSON.stringify(outOfOrderRes.body, null, 2));
  console.log(`👉 Status regressed backwards: ${outOfOrderRes.body?.data?.currentStatus === 'SENT' ? 'FAILED ❌' : 'NO (Preserved DELIVERED) ✅'}`);

  // Step 7: Provider sends READ webhook
  console.log(`\n7️⃣ Simulating Webhook: READ event for ${messageId}`);
  const readRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: `evt-read-${Date.now()}`,
      messageId: messageId,
      status: 'READ',
      occurredAt: new Date().toISOString()
    }
  );
  console.log(`Status: ${readRes.statusCode}`, JSON.stringify(readRes.body, null, 2));

  // Step 8: Unknown messageId handling
  console.log('\n8️⃣ Testing Unknown Message ID: Webhook for msg-unknown-999');
  const unknownRes = await request(
    { method: 'POST', path: '/api/v1/webhooks/provider' },
    {
      eventId: `evt-unknown-${Date.now()}`,
      messageId: 'msg-unknown-999',
      status: 'DELIVERED',
      occurredAt: new Date().toISOString()
    }
  );
  console.log(`Status: ${unknownRes.statusCode}`, JSON.stringify(unknownRes.body, null, 2));
  console.log(`👉 Clear 404 returned: ${unknownRes.statusCode === 404 ? 'YES ✅' : 'NO ❌'}`);

  // Step 9: Verify final message status and timestamps
  console.log(`\n9️⃣ Fetching Final Message State: GET /api/v1/messages/${messageId}`);
  const finalMsgRes = await request(
    { method: 'GET', path: `/api/v1/messages/${messageId}`, headers: { 'x-tenant-id': 'tenant-demo' } }
  );
  console.log(`Status: ${finalMsgRes.statusCode}`, JSON.stringify(finalMsgRes.body, null, 2));

  console.log('\n============================================================');
  console.log('🎉 SIMULATION COMPLETED SUCCESSFULLY!');
  console.log('============================================================\n');
}

if (require.main === module) {
  runSimulation().catch(err => {
    console.error('Simulation error:', err.message);
    process.exit(1);
  });
}

module.exports = { runSimulation };
