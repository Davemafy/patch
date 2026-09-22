# Patch — Convex All Gas Hackathon

## What Patch does

Something broke at home? Tell Patch. It finds a small number of people whose public websites say they handle that kind of repair, asks them for their actual price and time, brings their real email replies back into the app, and lets the user choose.

Patch is deliberately not a contractor directory or an AI diagnosis screen. The useful part is the loop between a normal person with a broken thing and the real people who might fix it.

## Demo journey

`describe the repair → find relevant people → ask for price/time → receive real replies → choose someone`

Primary demo:

> My bedroom doorknob is broken. The handle turns but the door won’t open properly.

The moment I care about is when a repair person replies from ordinary email and the Patch screen changes on its own. No copy/paste back into the app.

## How the sponsor stack is used

### Convex

Convex is the source of truth for repairs, discovered candidates, public evidence, outreach attempts, inbound replies, extracted facts, the final choice, uploaded repair photos, and event history. The React app reads the repair through a live Convex query, so an inbound email reply changes the UI without polling or local fake state.

The backend also owns the duplicate-safety rules:

- one outreach record per candidate prevents repeated button presses from sending the same request twice;
- inbound AgentMail `event_id` and `message_id` are both deduplicated;
- a late reply is stored but never changes a repair that the user already marked chosen.

The frontend is deployed with Convex Static Hosting so the submission lives on the required `*.convex.site` URL.

### Firecrawl

Patch sends Firecrawl a search query derived from the user’s repair description and area. It searches the public web, scrapes a small set of promising pages, extracts public contact emails when present, and keeps the source URL plus a short line of service evidence.

Firecrawl evidence is used only for service fit: “this site says they do door/lock repair.” It is never treated as evidence of live availability or price.

### AgentMail

Patch has a real AgentMail inbox. For selected candidates it sends a plain email asking whether they can take the job, when they could come, and roughly what they would charge. The recipient needs no Patch account.

AgentMail sends `message.received` webhooks to:

`https://<deployment>.convex.site/agentmail/webhook`

The webhook is verified with its Svix signature before the message is processed. Patch correlates the inbound thread to the original outreach and records it once.

### OpenAI

Patch uses OpenAI’s `openai/gpt-oss-20b` model for two narrow interpretation jobs. Inference is served through Groq’s OpenAI-compatible Responses API using `GROQ_API_KEY`; the model itself remains OpenAI GPT-OSS:

1. Turn a consumer repair description into a useful service category/search query for Firecrawl.
2. Extract only facts actually stated in a repair-person reply: whether they can take the job, the arrival wording, price, currency, and any explicit condition.

The raw reply is always preserved. If extraction fails, Patch records the original message and leaves the structured facts empty instead of inventing an answer.

## Truth boundary

Patch intentionally has two evidence layers:

**Public website:** can establish that a person/business exists, what service they publicly advertise, their public contact details, and possibly their stated service area.

**Actual repair-person reply:** can establish current willingness to take this job, timing, price, and explicit conditions.

A website never makes someone “available” in Patch. A model never fills in a missing price or time.

## Reliability work

- duplicate inbound webhooks are idempotent;
- duplicate outreach clicks do not produce duplicate sends;
- late replies cannot overwrite the chosen person;
- OpenAI GPT-OSS extraction failure preserves the raw email;
- Firecrawl failure produces a retryable human state instead of crashing;
- candidates without a public email remain visible as source-backed matches but cannot be selected for email outreach;
- missing server secrets fail with an actionable message;
- active repair state survives browser refresh via a persisted repair id, while the actual repair data stays in Convex.

## Setup

```bash
npm install
npx convex dev
npm run dev
```

Set the following on the Convex deployment:

```text
GROQ_API_KEY
FIRECRAWL_API_KEY
AGENTMAIL_API_KEY
AGENTMAIL_INBOX_ID
AGENTMAIL_WEBHOOK_SECRET
DEMO_RESET_TOKEN
```

For local Vite development, Convex writes `VITE_CONVEX_URL` to `.env.local`.

Create an AgentMail webhook for `message.received` pointing at the deployment’s `/agentmail/webhook` route.

## Deploy

```bash
npm run deploy
```

This builds the Vite frontend, deploys the Convex backend, uploads the static files to Convex Static Hosting, and produces the required `https://<deployment>.convex.site` URL.

## Demo reset

```bash
npx convex run repairs:resetDemo '{"token":"<DEMO_RESET_TOKEN>"}'
```

When `DEMO_RESET_TOKEN` is configured, this clears Patch repair/candidate/outreach/reply/event data while leaving external credentials and webhook configuration intact.

See `docs/DEMO.md` for the exact recording sequence.

## Public app

https://aware-porpoise-430.convex.site

This URL is served directly by Convex Static Hosting and is the recording/submission target.

## Acceptance evidence

The live deployment has been exercised against the real sponsor stack:

- OpenAI GPT-OSS through Groq produced repair search context for the broken-doorknob example.
- Firecrawl returned real source-backed repair-service candidates.
- AgentMail successfully sent a real outreach email to a discovered direct provider.
- The public `/agentmail/webhook` route rejects unsigned requests and accepts correctly signed controlled acceptance events.
- A controlled inbound reply, explicitly labeled as test data, traverses the same webhook → Convex → GPT-OSS extraction → live React subscription path used by real replies.
- The external provider contacted during acceptance had not replied during the test window, so Patch does not claim a real price, time, availability, or willingness from that provider.

## Acceptance evidence

The live deployment has been exercised against the real sponsor stack:

- OpenAI GPT-OSS through Groq produced repair search context for the broken-doorknob example.
- Firecrawl returned real source-backed repair-service candidates.
- AgentMail successfully sent a real outreach email to a discovered direct provider.
- The public `/agentmail/webhook` route rejects unsigned requests and accepts correctly signed controlled acceptance events.
- A controlled inbound reply, explicitly labeled as test data, traverses the same webhook → Convex → GPT-OSS extraction → live React subscription path used by real replies.
- The external provider contacted during acceptance had not replied during the test window, so Patch does not claim a real price, time, availability, or willingness from that provider.

## Known limitations

- Patch currently uses email outreach only; a candidate needs a public email address to be contactable from the app.
- Discovery quality depends on what local repair businesses publish on the public web.
- Patch does not book, pay, message in-app, rate contractors, or diagnose the repair.
