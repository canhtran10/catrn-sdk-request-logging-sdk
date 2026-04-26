🚀 🎯 GOALS
Application must not be slowed down (non-blocking logging)
Logs retained for debugging (≥ 7–30 days)
Track:
user flow
external API calls
UI should be visual like DevTools (trace + timeline)
🧠 1. STANDARD FLOW
[NestJS + Logging SDK]
   ↓
Bull Queue (Redis)
   ↓
Worker
   ├── PostgreSQL (lightweight metadata)
   └── Azure Blob (heavy payload)
   ↓
Backend (generate SAS URL)
   ↓
UI (fetch Blob directly)
⚙️ 2. OVERALL ARCHITECTURE
2.1 Logging Library
Build as a separate NPM package
Integrate with NestJS
Exports:
LoggingModule.forRoot()
LoggingService
LoggingInterceptor
LoggingMiddleware
2.2 Config (.env)
(Dedicated log PostgreSQL — use a *different* database from the main app DB; worker + log viewer + retention, not the SDK.)
LOG_DB_HOST=
LOG_DB_PORT=
LOG_DB_USER=
LOG_DB_PASS=
LOG_DB_NAME=

REDIS_URL=

BLOB_ACCOUNT=
BLOB_CONTAINER=
🔥 3. SDK (NodeJS + TypeScript)
✔ Auto logging
request:
full body but truncate + mask sensitive data
response:
only log when status ≠ 200/201/202
external API:
always log status + duration
log full payload if error
✔ Trace (REQUIRED)
traceId
spanId
parentSpanId
propagate via headers:
x-trace-id
x-span-id
✔ Async (CRITICAL)

❌ DO NOT write directly to DB
✔ push logs into queue

✔ Sampling (dynamic)
if (error) → 100%
if (duration > 2000ms) → 100%
else → 10–20%
⚡ 4. QUEUE (Bull + Redis)

Use:

Bull
Azure Cache for Redis
✔ Responsibilities:
async log processing
retry (3 attempts)
batch logs (100–500 items)
prevent DB spikes
🗄️ 5. POSTGRESQL (SEPARATE DB)

✔ Use a separate database (not the main DB)

Store lightweight metadata:
{
  "traceId": "...",
  "userId": "...",
  "path": "...",
  "method": "GET",
  "status": 200,
  "duration": 120,
  "created_at": "...",
  "payloadPath": "logs/...json.gz"
}
✔ Indexes:
(userId, created_at)
created_at
status
✔ Retention:
keep 7–30 days
delete in batches:
DELETE ... LIMIT 1000
☁️ 6. BLOB (PAYLOAD STORAGE)

Use:

Azure Blob Storage
✔ When to store:
request (truncated)
error responses
external API errors
✔ Format:
JSONL
gzip
✔ Rules:

❌ DO NOT append to files
❌ DO NOT create one file per log
✔ write logs in batches

✔ Partitioning (IMPORTANT):
logs/{service}/{env}/{yyyy}/{mm}/{dd}/{hh}/{mm}-{part}.json.gz
Example:
logs/umenu/prod/2026/04/23/14/10-1.json.gz
✔ Upload:
use stream + gzip
do NOT keep full payload in memory
✔ Flush strategy:
every 5–10 minutes
OR when file size > 5MB
⚙️ 7. WORKER
Responsibilities:
batch logs from queue
insert metadata → PostgreSQL
upload payload → Blob
⚡ 8. UI (LOG VIEWER)
✔ Routes:
/log-activities
/log-activities/:traceId
/log-activities?userId=&from=&to=&status=
✔ Layout:
left (2/3): timeline / trace map
right (1/3): details
✔ Filters:
userId
time range (≤ 15 days)
method
status
✔ Data loading:
UI → Backend → get SAS URL
   → UI fetch Blob directly
   → filter in memory
✔ Logic:
load logs in 5–10 minute chunks
filter on frontend
🔐 9. SECURITY
Blob must be private
use SAS URL (expire 1–5 minutes)
backend generates SAS URL
⚠️ 10. MUST AVOID

❌ synchronous DB logging
❌ one Blob file per log
❌ appending logs all day into one file
❌ not truncating request body
❌ no sampling
❌ using main DB

🚀 11. PERFORMANCE GUARD

✔ dynamic sampling
✔ batch everything:

Redis
DB inserts
Blob uploads

✔ small files:

5–10 minutes per file (~1–5MB)

✔ never block request thread

🧹 12. CLEANUP
PostgreSQL
cron job for batch deletion
Blob
use lifecycle rules (auto delete)
🎯 13. SUMMARY
PostgreSQL → fast querying
Blob → deep inspection
Redis + Bull → spike protection
UI → direct Blob access via SAS

👉 If implemented correctly:

very fast debugging
QA can trace issues independently
developers don’t need to read raw logs anymore

If you want, I can next:

generate a ready-to-use LoggingModule for NestJS
or build a full worker using Bull + Azure Blob Storage for direct integration into your system.