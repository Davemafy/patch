# Patch demo runbook

Target: 80–100 seconds. Show the product, not the architecture.

## Before recording

1. Confirm the live `*.convex.site` app loads in a private browser window.
2. Confirm `GROQ_API_KEY`, `FIRECRAWL_API_KEY`, `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`, `AGENTMAIL_WEBHOOK_SECRET`, and `DEMO_RESET_TOKEN` are set on the live Convex deployment.
3. In AgentMail, subscribe a webhook to `message.received` at:

   `https://<deployment>.convex.site/agentmail/webhook`

4. If `DEMO_RESET_TOKEN` is configured, reset old demo data:

   `npx convex run repairs:resetDemo '{"token":"<DEMO_RESET_TOKEN>"}'`

5. Have access to one real recipient mailbox you are allowed to use for the recording, or choose a discovered business you genuinely intend to contact. Do not seed a controlled/fake reply into the real demo and present it as a contractor response.

## Recording sequence

### 0–10s — the problem

Open Patch. Say: “My bedroom doorknob broke. I don’t want to call around.”

Press **Tell Patch what broke**.

### 10–25s — report it

Use:

- Problem: `My bedroom doorknob is broken. The handle turns but the door won’t open properly.`
- Area: your real local area.

Submit.

### 25–40s — real web evidence

Let the live Firecrawl search finish. Show two or three people/businesses and briefly open one **See source** link.

Say: “Patch only uses the website to establish that they do this kind of work.”

Choose the contacts with public email addresses and press **Ask for price and time**.

### 40–55s — real outbound email

Switch to AgentMail (or the recipient mailbox) and show the ordinary message that was actually sent.

### 55–70s — real inbound reply

From the recipient side, reply naturally, for example:

`Yes, I can come today around 2 PM. Callout is ₦12,000.`

Do not paste anything into Patch.

### 70–85s — the magic moment

Return to Patch. The Convex subscription should update automatically.

Show:

- `today around 2 PM`
- `₦12,000`
- **Read original reply**

Call out that the price/time came from the email, not the website.

### 85–95s — choose

Press **Choose <name>**.

End on the confirmation screen.

## If something fails during recording

- Firecrawl: use **Try the search again**. Do not pretend seeded candidates are live results.
- AgentMail outbound: inspect the candidate’s public email and Convex logs; Patch prevents a second send after an outreach record exists.
- AgentMail inbound: confirm the webhook URL is `/agentmail/webhook`, the event subscription is `message.received`, and the production webhook secret matches Convex.
- GPT-OSS extraction through Groq: the original reply is still stored and visible even when extraction fails. That is the safe failure mode.

## Truth line for the demo

“A website tells Patch who appears to handle the repair. Only their actual reply can tell Patch whether they’ll take it, when they can come, or what they’ll charge.”
