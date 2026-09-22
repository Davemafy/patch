import { anyApi } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

function agentMailKey() {
  const key = process.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error("AGENTMAIL_API_KEY is not configured in Convex.");
  return key;
}

async function agentMail(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.agentmail.to/v0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${agentMailKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  let json: any = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`AgentMail acceptance request failed (${response.status}): ${json?.message || json?.error || text || "unknown error"}`);
  }
  return json;
}

export const setupControlled = internalAction({
  args: {},
  handler: async (ctx) => {
    const configuredInboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!configuredInboxId) throw new Error("AGENTMAIL_INBOX_ID is not configured in Convex.");

    const secondary = await agentMail("/inboxes", {
      method: "POST",
      body: JSON.stringify({
        display_name: "Patch Controlled Acceptance",
        client_id: `patch-controlled-${Date.now()}`,
      }),
    });
    if (!secondary?.inbox_id || !secondary?.email) throw new Error("AgentMail did not create the controlled inbox.");

    const repairId = await ctx.runMutation(anyApi.repairs.createRepair, {
      description: "Controlled acceptance test: bedroom doorknob handle turns but the door won’t open properly.",
      area: "Abuja — controlled acceptance test",
    });

    await ctx.runMutation(anyApi.repairs.saveDiscoveredRepairPeople, {
      repairId,
      category: "Controlled AgentMail acceptance",
      searchQuery: "controlled acceptance only",
      candidates: [
        {
          name: "Controlled AgentMail Test Inbox",
          website: "https://docs.agentmail.to",
          email: String(secondary.email),
          serviceEvidence: "Controlled acceptance fixture — not a real repair provider.",
          sourceUrl: "https://docs.agentmail.to",
          sourceTitle: "Controlled acceptance fixture",
        },
      ],
    });

    const view = await ctx.runQuery(anyApi.repairs.getRepair, { repairId });
    const candidate = view?.candidates?.[0];
    if (!candidate) throw new Error("Controlled candidate was not saved.");

    const sent = await ctx.runAction(anyApi.mail.askRepairPeople, { candidateIds: [candidate._id] });
    if (sent?.sent !== 1) throw new Error("Controlled AgentMail request was not sent.");

    return {
      repairId,
      candidateId: candidate._id,
      secondaryInboxId: String(secondary.inbox_id),
    };
  },
});

export const replyControlled = internalAction({
  args: { secondaryInboxId: v.string() },
  handler: async (_ctx, { secondaryInboxId }) => {
    const messages = await agentMail(`/inboxes/${encodeURIComponent(secondaryInboxId)}/messages?limit=20`);
    const received = (messages?.messages || []).find(
      (message: any) => Array.isArray(message?.labels) && message.labels.includes("received"),
    );
    if (!received?.message_id) return { ready: false };

    const text =
      "CONTROLLED ACCEPTANCE TEST — not a real contractor quote. Yes, I can take this test job. " +
      "I can come tomorrow afternoon. Test callout is ₦12,000.";

    await agentMail(
      `/inboxes/${encodeURIComponent(secondaryInboxId)}/messages/${encodeURIComponent(String(received.message_id))}/reply`,
      {
        method: "POST",
        body: JSON.stringify({ text }),
      },
    );
    return { ready: true };
  },
});
