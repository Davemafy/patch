import { anyApi } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

function bytesFromBase64(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function svixSignature(secretValue: string, id: string, timestamp: string, rawBody: string) {
  const encodedSecret = secretValue.startsWith("whsec_") ? secretValue.slice(6) : secretValue;
  const key = await crypto.subtle.importKey(
    "raw",
    bytesFromBase64(encodedSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);
  const digest = await crypto.subtle.sign("HMAC", key, signed);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export const setupWebhookFixture = internalAction({
  args: {},
  handler: async (ctx) => {
    const repairId = await ctx.runMutation(anyApi.repairs.createRepair, {
      description: "Controlled acceptance fixture: bedroom doorknob handle turns but the door won’t open properly.",
      area: "Abuja — controlled fixture only",
    });

    await ctx.runMutation(anyApi.repairs.saveDiscoveredRepairPeople, {
      repairId,
      category: "Controlled webhook fixture",
      searchQuery: "controlled fixture only",
      candidates: [
        {
          name: "Controlled webhook fixture",
          website: "https://docs.agentmail.to",
          email: "fixture@example.test",
          serviceEvidence: "Controlled acceptance fixture — not a real repair provider.",
          sourceUrl: "https://docs.agentmail.to",
          sourceTitle: "Controlled acceptance fixture",
        },
      ],
    });

    const view = await ctx.runQuery(anyApi.repairs.getRepair, { repairId });
    const candidate = view?.candidates?.[0];
    if (!candidate) throw new Error("Controlled fixture candidate was not saved.");

    const prepared = await ctx.runMutation(anyApi.repairs.prepareOutreach, { candidateId: candidate._id });
    if (!prepared?.shouldSend || !prepared.outreachId) {
      throw new Error("Controlled fixture outreach was not prepared.");
    }

    const nonce = Date.now().toString(36);
    await ctx.runMutation(anyApi.repairs.markOutreachSent, {
      outreachId: prepared.outreachId,
      messageId: `<patch-fixture-out-${nonce}@example.test>`,
      threadId: `patch-fixture-thread-${nonce}`,
    });

    return { repairId, candidateId: candidate._id };
  },
});

export const deliverWebhookFixture = internalAction({
  args: {
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
  },
  handler: async (ctx, { repairId, candidateId }) => {
    const [view, webhookSecret] = await Promise.all([
      ctx.runQuery(anyApi.repairs.getRepair, { repairId }),
      Promise.resolve(process.env.AGENTMAIL_WEBHOOK_SECRET),
    ]);
    if (!view) throw new Error("Controlled fixture repair not found.");
    if (!webhookSecret) throw new Error("AGENTMAIL_WEBHOOK_SECRET is not configured in Convex.");

    const configuredInboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!configuredInboxId) throw new Error("AGENTMAIL_INBOX_ID is not configured in Convex.");

    const candidate = view.candidates.find((item: any) => item._id.toString() === candidateId.toString());
    const outreach = candidate?.outreach;
    if (!candidate || !outreach?.threadId || !outreach?.messageId) {
      throw new Error("Controlled fixture outreach is incomplete.");
    }

    const replyText =
      "CONTROLLED ACCEPTANCE TEST — not a real contractor quote. Yes, I can take this test job. " +
      "I can come tomorrow afternoon. Test callout is ₦12,000.";

    const nonce = Date.now().toString(36);
    const eventId = `evt_patch_fixture_${nonce}`;
    const inboundMessageId = `<patch-fixture-in-${nonce}@example.test>`;
    const body = JSON.stringify({
      type: "event",
      event_type: "message.received",
      event_id: eventId,
      message: {
        inbox_id: configuredInboxId,
        thread_id: outreach.threadId,
        message_id: inboundMessageId,
        labels: ["received"],
        timestamp: new Date().toISOString(),
        from: "Controlled Fixture <fixture@example.test>",
        to: [],
        subject: "Re: controlled Patch acceptance",
        preview: replyText,
        text: replyText,
        extracted_text: replyText,
        in_reply_to: outreach.messageId,
        references: [outreach.messageId],
        headers: {},
      },
      thread: {
        inbox_id: configuredInboxId,
        thread_id: outreach.threadId,
        labels: ["received"],
        timestamp: new Date().toISOString(),
        senders: ["fixture@example.test"],
        recipients: [],
        last_message_id: inboundMessageId,
        message_count: 2,
        size: replyText.length,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        received_timestamp: new Date().toISOString(),
        sent_timestamp: new Date().toISOString(),
        subject: "Re: controlled Patch acceptance",
        preview: replyText,
        attachments: [],
      },
    });

    const svixId = `msg_patch_fixture_${nonce}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = await svixSignature(webhookSecret, svixId, timestamp, body);
    const response = await fetch("https://aware-porpoise-430.convex.site/agentmail/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "svix-id": svixId,
        "svix-timestamp": timestamp,
        "svix-signature": `v1,${signature}`,
      },
      body,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Controlled webhook delivery failed (${response.status}): ${responseText}`);
    }
    return { delivered: true, eventId, inboundMessageId };
  },
});
