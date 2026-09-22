export async function sendRepairRequest(args: {
  to: string;
  repairId: string;
  outreachId: string;
  description: string;
  area: string;
}) {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (!apiKey) throw new Error("AGENTMAIL_API_KEY is not configured in Convex.");
  if (!inboxId) throw new Error("AGENTMAIL_INBOX_ID is not configured in Convex.");

  const text = [
    `Hi, someone in ${args.area} needs help with a home repair:`,
    "",
    args.description,
    "",
    "Are you available today or tomorrow?",
    "If so, please reply with when you could come and roughly what you'd charge.",
    "",
    "Thanks — Patch",
  ].join("\n");

  const response = await fetch(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `patch-${args.outreachId}`.replace(/[^A-Za-z0-9._~-]/g, "-"),
    },
    body: JSON.stringify({
      to: args.to,
      subject: `Repair request near ${args.area}`,
      text,
      headers: { "X-Patch-Repair": args.repairId },
    }),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`AgentMail send failed (${response.status}): ${json?.message || json?.error || "unknown error"}`);
  if (!json?.message_id || !json?.thread_id) throw new Error("AgentMail did not return message_id and thread_id.");
  return { messageId: String(json.message_id), threadId: String(json.thread_id) };
}
