# Patch

**Something broke at home? Tell Patch. We'll get you real prices and times from people who can fix it.**

Patch is a focused home-repair app for everyday people. A person describes what broke, Patch finds people who publicly handle that kind of repair, asks for their actual price and time, brings replies back into one place, and lets the user choose.

## Frozen demo journey

**Tell Patch what broke → find repair people → ask for price/time → receive replies → choose someone.**

That is the product for this hackathon. Scope changes go through the lead/integrator.

## Team lanes

- Lead / integrator: shared contracts, integration, deployment, submission.
- Core / Convex: repair state and live data.
- AgentMail + OpenAI: outbound requests, inbound replies, extraction.
- Firecrawl: public-web discovery and evidence.
- Frontend: consumer experience and copy.

Read `docs/PRODUCT.md` and `docs/TEAM.md` before changing product behavior.

## Guardrails

No payments, maps, contractor accounts, landlord tooling, marketplace profiles, reviews, subscriptions, giant dashboard, or “AI assistant” surface.

Never claim a repair person is available, has quoted a price, or accepted a job until that fact comes from their actual reply.
