# Loan Enterprise CRM

Production-ready CRM foundation for loan companies with lead upload, customer lifecycle management, and AI voice call automation.

## Tech Stack

- Next.js App Router (JavaScript)
- Tailwind CSS + ShadCN-style reusable UI primitives
- PostgreSQL + Prisma ORM
- NextAuth (credentials + JWT session strategy)
- Excel ingestion using `xlsx`
- AI + Voice integrations:
	- OpenAI for script generation and transcript analysis
	- Twilio for outbound calls
	- Deepgram for speech-to-text (optional)
	- ElevenLabs for text-to-speech (optional)

## Core Features

- Admin/Sales login with role-aware session context
- Excel lead import pipeline with header normalization and dedupe by phone
- Customer CRM table with status updates and filtering
- AI-assisted outbound call initiation per customer profile
- Call status webhook handling and transcript intelligence persistence
- Dashboard metrics for operations tracking
- Modular AI provider routing with DB-configured failover
- Admin panel to manage active AI engine and provider priorities at runtime
- Modular telephony provider routing with DB-configured failover
- Admin panel to manage active telephony provider and priorities at runtime

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env
```

3. Set `DATABASE_URL` to a reachable PostgreSQL instance.

4. Initialize database and seed admin:

```bash
npm run db:push
npm run db:seed
```

5. Start development server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

- Core
	- `DATABASE_URL`
	- `NEXTAUTH_SECRET`
	- `NEXTAUTH_URL`
	- `APP_BASE_URL`

- AI
	- `OPENAI_API_KEY`
	- `DIALOGFLOW_PROJECT_ID`
	- `DIALOGFLOW_SERVICE_ACCOUNT_JSON`
	- `DIALOGFLOW_SERVICE_ACCOUNT_BASE64`
	- `DIALOGFLOW_LANGUAGE_CODE`

- Twilio
	- `TWILIO_ACCOUNT_SID`
	- `TWILIO_AUTH_TOKEN`
	- `TWILIO_FROM_NUMBER`
	- `TWILIO_CALLER_ID`
	- `TWILIO_API_KEY_SID`
	- `TWILIO_API_KEY_SECRET`
	- `TWILIO_TWIML_APP_SID`

- Vonage
	- `VONAGE_APPLICATION_ID`
	- `VONAGE_PRIVATE_KEY`
	- `VONAGE_FROM_NUMBER`

- Plivo
	- `PLIVO_AUTH_ID`
	- `PLIVO_AUTH_TOKEN`
	- `PLIVO_FROM_NUMBER`

- Voice utilities
	- `DEEPGRAM_API_KEY` (optional)
	- `ELEVENLABS_API_KEY` (optional)

- Phone formatting
	- `DEFAULT_COUNTRY_CODE` (defaults to `+91`)

## API Surface

- `POST /api/auth/[...nextauth]` auth endpoints
- `POST /api/leads/upload` upload and process Excel leads
- `GET /api/customers` fetch customers with filters
- `PATCH /api/customers/[customerId]` update status/notes
- `POST /api/calls/trigger` trigger AI-assisted outbound call
- `POST /api/calls/status` provider status callback
- `POST /api/calls/transcript` transcript ingest + AI summary
- `POST /api/calls/webhook` TwiML response
- `GET /api/dashboard/metrics` dashboard KPIs
- `GET /api/admin/ai-providers` list AI provider configs (admin only)
- `POST /api/admin/ai-providers` create AI provider config (admin only)
- `PATCH /api/admin/ai-providers/[providerId]` update/activate provider config (admin only)
- `DELETE /api/admin/ai-providers/[providerId]` delete provider config (admin only)
- `POST /api/admin/ai-providers/test-failover` run safe failover dry-run (admin only)
- `GET /api/admin/telephony-providers` list telephony provider configs (admin only)
- `POST /api/admin/telephony-providers` create telephony provider config (admin only)
- `PATCH /api/admin/telephony-providers/[providerId]` update/activate telephony provider config (admin only)
- `DELETE /api/admin/telephony-providers/[providerId]` delete telephony provider config (admin only)
- `POST /api/admin/telephony-providers/test-connection` run single or test-all telephony connectivity checks (admin only)

## Modular AI Provider Architecture

AI tasks are routed through a provider abstraction layer in `src/lib/ai/provider-router.js`.

Core orchestration primitives:

- Standard contract: `src/lib/ai/engine-contract.js`
- Service registry / DI loader: `src/lib/ai/engine-registry.js`
- Provider adapters: `src/lib/ai/adapters/*`

Supported task contracts:

- `CALL_SCRIPT`
- `CALL_SUMMARY`
- `CALL_TURN`

Provider configs are stored in the database (`AiProviderConfig`) with:

- provider type (`OPENAI`, `DIALOGFLOW`, `RASA`, `GENERIC_HTTP`)
- endpoint
- API key
- model
- priority
- `enabled`
- `isActive`
- timeout

Standard engine interface (normalized runtime output):

- `intent`
- `responseText`
- `context`
- `result` (task-specific payload)

Task-specific result contracts:

- `CALL_SCRIPT` -> `{ script }`
- `CALL_SUMMARY` -> `{ summary, intent, nextAction }`
- `CALL_TURN` -> `{ reply, shouldEnd }`

Routing behavior:

- Active provider is attempted first.
- Remaining enabled providers are attempted by ascending priority value.
- On failure, router automatically fails over to next provider.
- If all providers fail, the API returns an actionable error.
- Engines are resolved dynamically through a registry, so no route code changes are needed when switching providers.

## Admin Panel (No-Code Provider Management)

- Path: `/admin/ai-providers`
- Access: `ADMIN` role only
- Actions available:
	- Create provider config
	- Update endpoint/key/model/priority/timeout
	- Enable/disable provider
	- Set active provider instantly
	- Delete provider config
	- Run connectivity checks (single provider or all providers matrix)

## Modular Telephony Provider Architecture

Outbound telephony is routed through a provider abstraction layer in `src/lib/telephony/provider-router.js`.

Core orchestration primitives:

- Standard contract: `src/lib/telephony/telephony-contract.js`
- Service registry / DI loader: `src/lib/telephony/telephony-registry.js`
- Provider adapters: `src/lib/telephony/adapters/*`

Supported provider types:

- `TWILIO`
- `VONAGE`
- `PLIVO`

Provider configs are stored in the database (`TelephonyProviderConfig`) with:

- provider type
- endpoint
- API key / secret payload
- priority
- `enabled`
- `isActive`
- timeout
- metadata (provider-specific credentials)

Standard telephony adapter interface methods:

- `initiateCall`
- `speechToText`
- `textToSpeech`

Routing behavior:

- Active telephony provider is attempted first.
- Remaining enabled providers are attempted by ascending priority value.
- On failure, router automatically fails over to next provider.
- If all providers fail, API returns an actionable telephony routing error.

Call logs persist both AI and telephony provider context for audit and debugging:

- `aiProviderUsed`
- `telephonyProviderUsed`
- `telephonyProviderType`

## Telephony Admin Panel

- Path: `/admin/telephony-providers`
- Access: `ADMIN` role only
- Actions available:
	- Create telephony provider config
	- Update endpoint/key/model/priority/timeout
	- Enable/disable provider
	- Set active provider instantly
	- Delete provider config
	- Test single provider connection
	- Test all providers and review matrix output (status + latency + details)

## Adding a New Telephony Provider

1. Add enum value in `TelephonyProviderType` inside `prisma/schema.prisma`.
2. Create an adapter module under `src/lib/telephony/adapters/` using `createTelephonyAdapter(...)` from `src/lib/telephony/telephony-contract.js`.
3. Implement required methods:
	- `initiateCall`
	- `speechToText`
	- `textToSpeech`
	- `mapStatus`
	- `checkConnection`
4. Register the adapter in `src/lib/telephony/provider-router.js`.
5. Regenerate Prisma client:

```bash
npm run db:generate
```

6. Add provider config in `/admin/telephony-providers` and set priority/active state.
7. Run `Test Connection` and `Test All Providers` from the admin panel.
8. Trigger sample calls and verify consistent `CallLog` updates across provider swaps.

## Adding a New AI Tool

1. Add an enum value in `AiProviderType` inside `prisma/schema.prisma`.
2. Create an adapter module under `src/lib/ai/adapters/` using `createEngineAdapter(...)` from `src/lib/ai/engine-contract.js`.
3. Implement all required tasks (`CALL_SCRIPT`, `CALL_SUMMARY`, `CALL_TURN`) and return task-specific result payloads.
4. Register the adapter in `src/lib/ai/provider-router.js` using the service registry.
5. Regenerate Prisma client:

```bash
npm run db:generate
```

6. Add provider config in `/admin/ai-providers` and set priority/active state.
7. Run lint/build checks.

For HTTP-based providers, this project expects a POST endpoint that accepts:

```json
{
	"task": "CALL_SCRIPT | CALL_SUMMARY | CALL_TURN",
	"payload": { "...": "task specific" },
	"model": "optional-model",
	"metadata": { "optional": true }
}
```

And returns either direct fields or under `result`:

- `CALL_SCRIPT`: `script`
- `CALL_SUMMARY`: `summary`, `intent`, `nextAction`
- `CALL_TURN`: `reply`, `shouldEnd`

## Dialogflow Engine Setup

The `DIALOGFLOW` provider now uses a dedicated adapter at `src/lib/ai/adapters/dialogflow-adapter.js`.

### Required Dialogflow setup

1. Create a Google Cloud project and enable Dialogflow API.
2. Create a Dialogflow agent in that project.
3. Create a service account with Dialogflow access.
4. Download the service account JSON key.

### Credential configuration options

Use one of these methods:

- **Recommended (more secure):** set credentials via environment variables:
	- `DIALOGFLOW_PROJECT_ID="your-project-id"`
	- `DIALOGFLOW_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
	- or `DIALOGFLOW_SERVICE_ACCOUNT_BASE64="<base64-encoded-json>"`
- **Database-configured:** store service account JSON in the provider `apiKey` field and project ID in provider `model` or `metadata.projectId`.

For production, prefer environment-based secrets (or secret manager) instead of storing raw credentials in database text fields.

### Admin panel runtime switch

1. Go to `/admin/ai-providers`.
2. Create/update a provider with type `DIALOGFLOW`.
3. Set `priority` and click `Set Active` to switch runtime engine.
4. Use `Test Failover` to confirm fallback order.

### Swap testing checklist

1. Set `OPENAI` as active and trigger a sample call.
2. Set `DIALOGFLOW` as active and trigger the same call flow.
3. Confirm call result fields remain consistent (`summary`, `intent`, `nextAction`, `reply/script` by task).
4. Run provider connectivity checks from `/admin/ai-providers` and verify active engine behavior.

## Telephony Swap Testing Checklist

1. Configure `TWILIO` as active in `/admin/telephony-providers` and trigger a sample call.
2. Switch active provider to `VONAGE` and trigger the same flow.
3. Switch active provider to `PLIVO` and trigger again.
4. Confirm call handling remains consistent in CRM (`status`, transcript flow, summary fields).
5. Use `Test All Providers` to verify connectivity and credential health in priority order.
6. Intentionally break primary provider credentials and confirm fallback provider is selected in runtime.

## Telephony Observability & Logging

Structured call-flow logs are emitted from:

- `src/lib/telephony/provider-router.js`
- `src/app/api/calls/trigger/route.js`
- `src/app/api/calls/status/route.js`

Log events include:

- `telephony.failover.start`
- `telephony.provider.attempt`
- `telephony.provider.success`
- `telephony.provider.failure`
- `telephony.failover.exhausted`
- `api.calls.trigger.started`
- `api.calls.trigger.completed`
- `api.calls.trigger.failed`
- `api.calls.status.received`
- `api.calls.status.persisted`

Security notes:

- Phone numbers are redacted in logs.
- Provider secrets are never printed in clear text.

## Vonage / Plivo Runtime Validation

To validate adapters end-to-end in this app runtime:

1. Sign in as `ADMIN`.
2. Go to `/admin/telephony-providers`.
3. Create or update `VONAGE` and `PLIVO` configs.
4. Use `Test Connection` for each provider.
5. Use `Test All Providers` for matrix validation (status + latency + details).
6. Switch active provider and trigger sample calls.

Expected behavior:

- Missing credentials return consistent `422` responses from test endpoint with provider-specific messages.
- Runtime switching is immediate (`isActive` + `enabled` + `priority`) with no code change.
- Call trigger and status webhook emit structured logs for traceability.

## Production Notes

- API routes enforce session checks via server-side guard helpers.
- Provider SDK keys are optional; missing keys fall back to mock/no-op behavior for local development.
- For production, configure HTTPS callback URLs and proper telephony webhook signatures.

## Twilio Calling Setup

To enable real calling (instead of mock mode):

- Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` in `.env`.
- Keep phone numbers in E.164 format (`+<countrycode><number>`). If users enter 10-digit local numbers, set `DEFAULT_COUNTRY_CODE` (for example `+91`).
- For webhook status callbacks, set `APP_BASE_URL` to a public **HTTPS** URL (for local dev you can use an ngrok URL). Example:
	- `APP_BASE_URL="https://your-subdomain.ngrok-free.app"`
- Restart the app after updating environment variables.

If `APP_BASE_URL` is local HTTP (like `http://localhost:3000`), outbound calls can still start, but callback status tracking will be disabled.

## Vonage Calling Setup

For `VONAGE` provider:

- `VONAGE_APPLICATION_ID`
- `VONAGE_PRIVATE_KEY` (raw private key string)
- `VONAGE_FROM_NUMBER`

You can place these in env or in provider metadata (`applicationId`, `privateKey`, `fromNumber`).

Vonage Voice app webhook URLs:

- Answer URL (POST): `https://<public-host>/api/vonage/voice/answer`
- Event URL (POST): `https://<public-host>/api/vonage/voice/events`
- Fallback URL (POST): `https://<public-host>/api/vonage/voice/fallback`

For local development, use your HTTPS ngrok host as `<public-host>`.

## Plivo Calling Setup

For `PLIVO` provider:

- `PLIVO_AUTH_ID`
- `PLIVO_AUTH_TOKEN`
- `PLIVO_FROM_NUMBER`

You can place these in env or in provider metadata (`authId`, `authToken`, `fromNumber`).

## Browser Softphone Setup (Twilio Voice JS)

To place calls directly from the CRM browser UI:

- Create a Twilio API Key (Key SID + Secret) and set:
	- `TWILIO_API_KEY_SID`
	- `TWILIO_API_KEY_SECRET`
- Create a TwiML App in Twilio Console (Voice):
	- Voice Request URL: `https://<your-public-host>/api/twilio/voice/outbound`
	- Method: `POST`
	- Set `TWILIO_TWIML_APP_SID` to this app SID
- Set `TWILIO_ACCOUNT_SID`
- Set `TWILIO_CALLER_ID` (or `TWILIO_FROM_NUMBER`) to a Twilio verified caller ID/number
- Keep `APP_BASE_URL` on public HTTPS for real telephony and webhooks

Then open Dashboard, click `Initialize Softphone`, and use `Start Browser Call`.
