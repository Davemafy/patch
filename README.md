# Patch

**Something broke at home? Tell Patch. We’ll get you real prices and times from people who can fix it.**

Patch is a small consumer utility for everyday home repairs. You describe the problem once. Patch finds a few people who publicly say they handle that kind of work, emails them for price and timing, brings their real replies back into one live screen, and lets you choose.

## Core flow

`report → find people → ask for price/time → receive replies → choose`

A website can establish service fit. Only a real reply can establish current availability, price, or timing.

## Stack

- React 19 + TypeScript + Vite
- Convex database, functions, file storage, HTTP actions, and live subscriptions
- `@convex-dev/static-hosting` for the required `*.convex.site` frontend
- Firecrawl v2 search/scrape for public repair-service evidence and contact discovery
- AgentMail for outbound requests and inbound email replies
- OpenAI GPT-OSS 20B served through Groq’s OpenAI-compatible Responses API with strict Structured Outputs for repair search context and conservative reply extraction

## Local setup

```bash
npm install
npx convex dev
```

In a second terminal:

```bash
npm run dev
```

Convex will create the local deployment configuration and `VITE_CONVEX_URL` used by Vite.

## Environment variables

Frontend:

```text
VITE_CONVEX_URL
```

Server-side Convex environment:

```text
GROQ_API_KEY
FIRECRAWL_API_KEY
AGENTMAIL_API_KEY
AGENTMAIL_INBOX_ID
AGENTMAIL_WEBHOOK_SECRET
DEMO_RESET_TOKEN
```

Do not put sponsor keys in `VITE_*` variables. Anything prefixed with `VITE_` is browser-visible.

Set production values with the Convex dashboard or CLI, for example:

```bash
npx convex env set GROQ_API_KEY "..." --prod
npx convex env set FIRECRAWL_API_KEY "..." --prod
npx convex env set AGENTMAIL_API_KEY "..." --prod
npx convex env set AGENTMAIL_INBOX_ID "..." --prod
npx convex env set AGENTMAIL_WEBHOOK_SECRET "..." --prod
npx convex env set DEMO_RESET_TOKEN "..." --prod
```

## AgentMail setup

Create or choose an AgentMail inbox and put its id in `AGENTMAIL_INBOX_ID`.

After the Convex deployment exists, create a webhook subscribed to `message.received` at:

```text
https://<deployment>.convex.site/agentmail/webhook
```

Store the webhook signing secret in `AGENTMAIL_WEBHOOK_SECRET`. Incoming webhooks are Svix-signature verified before Patch accepts them.

## Architecture

### `convex/repairs.ts`

Owns durable repair truth: repair creation, discovery results, outreach idempotency, reply idempotency, selection, photo upload URLs, and demo reset.

### `convex/discovery.ts`

Action that asks OpenAI GPT-OSS 20B through Groq’s Responses API for search context, calls Firecrawl, then stores source-backed candidates in Convex.

### `convex/mail.ts`

Action that sends selected outreach through AgentMail and processes correlated inbound replies. Reply extraction failures still save the original email.

### `convex/integrations/*`

Thin service-specific helpers. Sponsor credentials never enter the browser bundle.

### `convex/http.ts`

Receives the AgentMail `message.received` webhook at `/agentmail/webhook` and verifies the Svix signature.

### React frontend

Uses a live `repairs:getRepair` query. There is no frontend timer pretending that replies arrived; Convex pushes the updated repair after the webhook commits it.

## Production build

```bash
npm run build
```

## Deploy to the hackathon-required host

```bash
npm run deploy
```

`@convex-dev/static-hosting` builds the frontend with the production Convex URL, deploys the backend, uploads `dist/`, and serves the app from:

```text
https://<deployment>.convex.site
```

## Demo reset

```bash
npx convex run --prod repairs:resetDemo '{"token":"<DEMO_RESET_TOKEN>"}'
```

The reset is token-protected and clears Patch’s demo data only. It does not change AgentMail, Firecrawl, or Groq/OpenAI-model configuration.

## Live app

https://aware-porpoise-430.convex.site

## Recording

See [`docs/DEMO.md`](docs/DEMO.md) for the 90-second recording sequence and failure checks.

## Product guardrails

Patch does not include payments, contractor accounts, landlord tooling, a ratings marketplace, automatic booking, an AI diagnosis screen, maps, or in-app chat. Those features would distract from the one loop this submission needs to prove.
