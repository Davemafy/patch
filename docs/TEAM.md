# Patch team contract

Five chats, one product, one merge authority.

## Branches

- `main` — lead / integrator
- `lane/core-convex` — Chat 2
- `lane/mail-openai` — Chat 3
- `lane/firecrawl` — Chat 4
- `lane/frontend` — Chat 5

Every lane starts from the same bootstrap commit. Do not redesign the product in a lane.

## File ownership

### Lead / integrator

Owns cross-lane contracts and final merge:

- `README.md`
- `docs/**`
- `hackathon.md`
- `.env.example`
- `package.json`
- `src/domain/patch.ts`
- final integration fixes anywhere when merging

### Chat 2 — Core / Convex

Owns:

- `convex/schema.ts`
- `convex/repairs.ts`
- `convex/demo.ts`
- generated Convex files as required

Expected public operations:

- `createRepair`
- `getRepair`
- `saveDiscoveredRepairPeople`
- `markOutreachSent`
- `recordRepairReply`
- `chooseRepairPerson`
- `resetDemo`

Core rules:

- duplicate inbound replies do not create duplicate records
- the same outreach is not recorded twice
- an older reply cannot undo a user's chosen person

### Chat 3 — AgentMail + OpenAI

Owns:

- `convex/integrations/agentmail.ts`
- `convex/integrations/openai.ts`
- `convex/http.ts` for the AgentMail webhook

Responsibilities:

- send the repair request
- receive a normal reply
- extract only facts present in the reply
- preserve the raw reply
- call the core operation to record it

### Chat 4 — Firecrawl

Owns:

- `convex/integrations/firecrawl.ts`

Returns a small set of:

- name
- website
- email when publicly available
- service evidence
- source URL

Never returns made-up availability, price, “verified” status, or acceptance.

### Chat 5 — Frontend

Owns:

- `src/**` except `src/domain/patch.ts`

The interface should cover:

- report
- looking
- people found
- waiting for replies
- replies/options
- choice
- done

No giant dashboard. No technical vocabulary in user-facing copy.

## Shared naming

Use the types in `src/domain/patch.ts` as the cross-lane vocabulary.

Statuses are frozen to:

`reported → looking → waiting → options_ready → chosen`

## Required handoff from every lane

End work with:

1. What I built
2. Files I changed
3. What works
4. What still does not
5. Setup or environment variables required
6. Branch name and latest commit SHA

Do not hand the lead a prose-only “plan.” Ship code on your branch.
