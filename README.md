# Multi-Tenant Asynchronous Messaging & Webhook Ingestion Platform

A high-performance, production-ready RESTful backend built with **Node.js**, **Express**, **MongoDB (Mongoose)**, and **Zod**. It is designed to handle high-throughput multi-tenant messaging, reliable out-of-order webhook delivery ingestion, idempotency, keyset pagination, and flexible database deployment (embedded, local standalone, or cloud MongoDB Atlas).

---

## 📑 Table of Contents
1. [Overview & Core Architecture](#overview--core-architecture)
2. [Database Architecture: Local vs. Cloud MongoDB Atlas](#database-architecture-local-vs-cloud-mongodb-atlas)
3. [API Endpoints Reference](#api-endpoints-reference)
   - [Health Check](#1-health-check)
   - [Send / Enqueue Message](#2-send--enqueue-message)
   - [List Conversation Messages (Keyset Pagination)](#3-list-conversation-messages-keyset-pagination)
   - [Get Message by ID](#4-get-message-by-id)
   - [Provider Webhook Ingestion](#5-provider-webhook-ingestion)
4. [Webhook Ingestion & State Machine Guarantees](#webhook-ingestion--state-machine-guarantees)
5. [Multi-Tenancy & Security Isolation](#multi-tenancy--security-isolation)
6. [Environment Variables & Configuration](#environment-variables--configuration)
7. [Getting Started & Local Execution](#getting-started--local-execution)
8. [Testing & Simulation](#testing--simulation)

---

## Overview & Core Architecture

The platform provides a resilient messaging ingestion and tracking pipeline:

- **Strict Multi-Tenant Isolation**: Messages are partitioned per tenant (`tenantId`). Endpoints enforce isolation through HTTP headers (`x-tenant-id`) and database query scoping.
- **Keyset / Cursor Pagination**: Efficient, consistent pagination over large conversation datasets using `(createdAt, _id)` compound indexes, avoiding costly `skip()` offsets.
- **Idempotent Webhook Processing**: External delivery updates are deduplicated via unique `eventId` records to ensure exactly-once state processing.
- **Out-of-Order Resilience**: Forward-only state machine progression (`QUEUED -> SENT -> DELIVERED -> READ`) prevents stale or delayed webhooks from regressing message status while backfilling audit timestamps.
- **Observability**: Distributed correlation IDs (`x-correlation-id`), structured request logging, and granular `/health` monitoring.

---

## Database Architecture: Local vs. Cloud MongoDB Atlas

The system is engineered with a **hybrid, zero-friction database configuration** in `src/config/database.js`. You can use **either** local embedded storage, a local MongoDB instance, or a remote cloud database such as **MongoDB Atlas**.

### 1. Default Mode: Embedded Persistent Local MongoDB Engine
* **How it works**: By default, `MONGODB_URI` in `.env` is set to `embedded` (or left blank).
* **Engine**: The server automatically spins up an embedded MongoDB engine using `mongodb-memory-server` configured with the **WiredTiger** storage engine pointing to `./data/db`.
* **Zero Dependencies**: You **do not** need to install MongoDB locally or configure any cloud cluster to run the application or tests.
* **Persistent**: Unlike pure in-memory databases, files are written directly to `./data/db`, so all messages and webhook events **persist across server restarts**.

### 2. Standalone Local MongoDB
If you run MongoDB locally (e.g., via Docker or Homebrew `brew services start mongodb-community`), you can point the app directly to it:
```env
MONGODB_URI=mongodb://localhost:27017/messaging_platform
```

### 3. Cloud Database: MongoDB Atlas
If you want to use MongoDB in the cloud, you can connect directly to **MongoDB Atlas**:
1. Create a cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database user and whitelist your IP address in Network Access.
3. Copy your connection URI and configure it in `.env`:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.abcde.mongodb.net/messaging_platform?retryWrites=true&w=majority
```
### 4. Reproducible Schema Setup & Migrations
The database schema and compound indexes are fully reproducible:
- **Automatic Initialization**: On server start, Mongoose models verify and build all indexes automatically.
- **Explicit Schema Initialization Script**: You can execute the reproducible schema setup command at any time:
  ```bash
  npm run db:init
  ```
  This creates collections (`messages`, `webhookevents`) and compiles compound multi-tenant indexes:
  - `{ tenantId: 1, conversationId: 1, createdAt: 1, _id: 1 }`
  - `{ tenantId: 1, messageId: 1 }`
  - `{ eventId: 1 }` (unique)
  - `{ messageId: 1, receivedAt: -1 }`

### 5. Persistence Compliance ("In-memory-only storage does not satisfy...")
The assignment specification states:
> *"Use PostgreSQL, SQLite, or another persistent database. Include migrations or reproducible schema setup. In-memory-only storage does not satisfy the persistence requirement."*

Our configuration satisfies this requirement on two distinct levels:
1. **Embedded Disk Storage (Zero-Setup)**: When using `MONGODB_URI=embedded`, the app configures MongoDB's **WiredTiger engine** writing to physical disk at `./data/db`. A dedicated automated test (`tests/persistence.test.js`) verifies that messages survive full server and database restarts.
2. **Production External Database (Local MongoDB or MongoDB Atlas)**: Setting `MONGODB_URI` connects to a standalone MongoDB daemon or MongoDB Atlas cloud cluster.

---

## API Endpoints Reference

All application endpoints are prefixed with `/api/v1` (with the `/health` endpoint also accessible directly at the root).

### Summary Table

| Method | Endpoint | Description | Auth / Isolation Header |
|---|---|---|---|
| `GET` | `/health` or `/api/v1/health` | Service & database health status | None |
| `POST` | `/api/v1/messages` | Create & enqueue a new message | `x-tenant-id` (optional or matching payload) |
| `GET` | `/api/v1/conversations/:conversationId/messages` | List conversation messages with cursor pagination | `x-tenant-id` (**Required**) |
| `GET` | `/api/v1/messages/:messageId` | Fetch message by ID | `x-tenant-id` (optional validation) |
| `POST` | `/api/v1/webhooks/provider` | Ingest external provider status updates | None (Provider webhook signature / payload) |

---

### 1. Health Check
Checks the real-time operational status of the server and database connectivity.

- **URL**: `GET /health` or `GET /api/v1/health`
- **Response**: `200 OK` (or `503 Service Unavailable` if the database is disconnected)

#### Example Response
```json
{
  "status": "healthy",
  "timestamp": "2026-10-24T07:15:00.000Z",
  "uptimeSeconds": 128,
  "environment": "development",
  "database": {
    "status": "connected",
    "name": "messaging_platform"
  },
  "queue": {
    "pendingJobs": 0,
    "processedJobs": 5,
    "workerActive": false
  }
}
```

---

### 2. Send / Enqueue Message
Creates a new message record with the initial status `QUEUED`.

- **URL**: `POST /api/v1/messages`
- **Headers**:
  - `Content-Type: application/json`
  - `x-tenant-id`: `<string>` *(optional; if supplied, must match body `tenantId`)*
- **Request Body**:
  ```json
  {
    "tenantId": "tenant-alpha",
    "conversationId": "conv-101",
    "to": "+14155552671",
    "text": "Your order #8912 has shipped!"
  }
  ```
- **Response**: `201 Created`
  ```json
  {
    "success": true,
    "data": {
      "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
      "tenantId": "tenant-alpha",
      "conversationId": "conv-101",
      "to": "+14155552671",
      "text": "Your order #8912 has shipped!",
      "status": "QUEUED",
      "queuedAt": "2026-10-24T07:15:30.000Z",
      "sentAt": null,
      "deliveredAt": null,
      "readAt": null,
      "failedAt": null,
      "lastEventOccurredAt": null,
      "createdAt": "2026-10-24T07:15:30.000Z",
      "updatedAt": "2026-10-24T07:15:30.000Z"
    }
  }
  ```

---

### 3. List Conversation Messages (Keyset Pagination)
Retrieves chronological messages within a conversation scoped to the requesting tenant.

- **URL**: `GET /api/v1/conversations/:conversationId/messages`
- **Headers**:
  - `x-tenant-id`: `tenant-alpha` (**Required**)
- **Query Parameters**:
  - `limit`: *(optional, integer between 1 and 100, default `20`)*
  - `cursor`: *(optional, opaque base64 string returned from the previous page)*
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": [
      {
        "messageId": "msg_001",
        "tenantId": "tenant-alpha",
        "conversationId": "conv-101",
        "to": "+14155552671",
        "text": "Hello world",
        "status": "DELIVERED",
        "queuedAt": "2026-10-24T07:00:00.000Z",
        "sentAt": "2026-10-24T07:00:02.000Z",
        "deliveredAt": "2026-10-24T07:00:05.000Z",
        "readAt": null,
        "failedAt": null,
        "createdAt": "2026-10-24T07:00:00.000Z",
        "updatedAt": "2026-10-24T07:00:05.000Z"
      }
    ],
    "pagination": {
      "limit": 20,
      "hasMore": true,
      "nextCursor": "ZXlKaGJHY2lPaUpTVXpVeE5pSXNJbX..."
    }
  }
  ```

---

### 4. Get Message by ID
Retrieves the complete state and lifecycle timestamps of a single message.

- **URL**: `GET /api/v1/messages/:messageId`
- **Headers**:
  - `x-tenant-id`: `<string>` *(optional; if provided, enforces tenant boundary)*
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "data": {
      "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
      "tenantId": "tenant-alpha",
      "conversationId": "conv-101",
      "to": "+14155552671",
      "text": "Your order #8912 has shipped!",
      "status": "READ",
      "queuedAt": "2026-10-24T07:15:30.000Z",
      "sentAt": "2026-10-24T07:15:32.000Z",
      "deliveredAt": "2026-10-24T07:15:35.000Z",
      "readAt": "2026-10-24T07:15:40.000Z",
      "failedAt": null,
      "lastEventOccurredAt": "2026-10-24T07:15:40.000Z",
      "createdAt": "2026-10-24T07:15:30.000Z",
      "updatedAt": "2026-10-24T07:15:40.000Z"
    }
  }
  ```

---

### 5. Provider Webhook Ingestion
Ingests asynchronous delivery receipts from external downstream providers (e.g., SMS/WhatsApp gateways).

- **URL**: `POST /api/v1/webhooks/provider`
- **Request Body**:
  ```json
  {
    "eventId": "evt_abc123456",
    "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
    "status": "DELIVERED",
    "occurredAt": "2026-10-24T07:15:35.000Z"
  }
  ```

#### Scenario A: Successful Forward Transition
```json
{
  "success": true,
  "eventId": "evt_abc123456",
  "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
  "message": "Status transitioned from SENT to DELIVERED",
  "applied": true,
  "data": {
    "currentStatus": "DELIVERED",
    "previousStatus": "SENT"
  }
}
```

#### Scenario B: Duplicate Event (Idempotent replay)
```json
{
  "success": true,
  "duplicate": true,
  "eventId": "evt_abc123456",
  "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
  "message": "Duplicate event acknowledged idempotently; no changes applied"
}
```

#### Scenario C: Out-of-Order / Delayed Event
If a message is already `DELIVERED`, but an out-of-order `SENT` webhook arrives:
```json
{
  "success": true,
  "eventId": "evt_delayed_001",
  "messageId": "msg_f3a1d9b8-1234-4a5b-9c8d-0e1f2a3b4c5d",
  "message": "Out-of-order event acknowledged without regressing message status from DELIVERED",
  "applied": false,
  "data": {
    "currentStatus": "DELIVERED",
    "ignoredStatus": "SENT"
  }
}
```

#### Scenario D: Unknown Message ID
If the webhook refers to a non-existent message ID, the event is saved to the `webhookevents` audit collection for reconciliation and returns a `404`:
```json
{
  "success": false,
  "error": {
    "code": "MESSAGE_NOT_FOUND",
    "message": "Message with ID 'msg_unknown' does not exist. Event recorded for audit reconciliation."
  },
  "eventId": "evt_missing_999"
}
```

---

## Webhook Ingestion & State Machine Guarantees

The status transitions follow a strict precedence hierarchy:

```
QUEUED (0) ──► SENT (1) ──► DELIVERED (2) ──► READ (3)
    │              │
    ▼              ▼
  FAILED (4)     FAILED (4)   [Terminal State]
```

1. **State Rank**: Each status is assigned a strictly increasing integer rank:
   - `QUEUED = 0`
   - `SENT = 1`
   - `DELIVERED = 2`
   - `READ = 3`
   - `FAILED = 4` (Allowed only from `QUEUED` or `SENT`)
2. **Atomic Concurrency Protection**:
   Database updates use conditional atomic filters:
   `statusRank: { $lt: incomingRank }`
   This ensures race conditions from concurrent webhook requests cannot cause status rollbacks.
3. **Audit Trail**: Every incoming webhook is recorded in the `WebhookEvent` collection with its processing outcome (`APPLIED`, `DUPLICATE`, `IGNORED_OUT_OF_ORDER`, or `UNMATCHED_MESSAGE`).

---

## Multi-Tenancy & Security Isolation

- **Tenant Identifier**: Every message belongs strictly to a `tenantId`.
- **Compound Indexing**: All message queries are indexed by `{ tenantId: 1, conversationId: 1, createdAt: 1, _id: 1 }`, guaranteeing tenant isolation at the database layer.
- **Header Verification**:
  - The `GET /conversations/:conversationId/messages` endpoint requires the `x-tenant-id` header.
  - The `POST /messages` endpoint validates that any provided `x-tenant-id` header matches the payload `tenantId`, blocking cross-tenant spoofing.

---

## Environment Variables & Configuration

Create a `.env` file in the root directory (based on `.env.example`):

```env
# Server Port
PORT=3000

# Environment Mode
NODE_ENV=development

# Database Connection
# Set to 'embedded' for zero-dependency local disk-backed storage (./data/db)
# Or provide a standalone local URI: mongodb://localhost:27017/messaging_platform
# Or provide a MongoDB Atlas cloud URI: mongodb+srv://<user>:<password>@cluster.mongodb.net/messaging_platform
MONGODB_URI=embedded

# Local embedded data directory
DB_STORAGE_PATH=./data/db

# Background worker simulation for local dispatch testing (optional)
ENABLE_WORKER_SIMULATION=false

# Log level (debug, info, warn, error)
LOG_LEVEL=info
```

---

## Getting Started & Local Execution

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 2. Install Dependencies
```bash
npm install
```

### 3. Start the Server
- **Development (with hot-reload)**:
  ```bash
  npm run dev
  ```
- **Production start**:
  ```bash
  npm start
  ```

Once started, the server listens on `http://localhost:3000`.

---

## Testing & Simulation

### 1. Automated Test Suite
The project includes a comprehensive Jest test suite covering:
- Message creation & validation (`tests/message.test.js`)
- Multi-tenant boundary isolation (`tests/isolation.test.js`)
- Webhook state machine, idempotency & out-of-order handling (`tests/webhook.test.js`)
- Disk persistence across server restarts (`tests/persistence.test.js`)
- Health check monitoring (`tests/health.test.js`)

Run all tests:
```bash
npm test
```

### 2. Live Webhook Simulator Script
To see the full end-to-end lifecycle, idempotency checks, and out-of-order webhook rejection in real-time against a running server:
```bash
npm run simulate:webhook
```
This script will execute:
1. Health check verification.
2. Message creation (`QUEUED`).
3. Forward webhook updates (`SENT -> DELIVERED -> READ`).
4. Duplicate event replay (validating idempotency).
5. Out-of-order webhook replay (validating status protection).
6. Non-existent message ID webhook handling (verifying audit trail and 404 response).
