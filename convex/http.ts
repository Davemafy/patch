import { anyApi, httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { components } from "./_generated/api";
import { httpAction } from "./_generated/server";

const http = httpRouter();

function bytesFromBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyAgentMail(rawBody: string, request: Request) {
  const secretValue = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secretValue) throw new Error("AGENTMAIL_WEBHOOK_SECRET is not configured in Convex.");
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return false;

  const numericTimestamp = Number(timestamp);
  if (Number.isFinite(numericTimestamp) && Math.abs(Date.now() / 1000 - numericTimestamp) > 300) return false;

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
  const expected = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const versions = signature
    .split(/\s+/)
    .map((part) => part.split(","))
    .filter(([version]) => version === "v1")
    .map(([, value]) => value)
    .filter(Boolean);
  return versions.some((value) => safeEqual(value, expected));
}

http.route({
  path: "/agentmail/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const rawBody = await request.text();
    try {
      if (!(await verifyAgentMail(rawBody, request))) return new Response("Invalid webhook signature", { status: 401 });
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Webhook verification failed", { status: 503 });
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (payload?.event_type !== "message.received") return new Response("ok", { status: 200 });
    const message = payload?.message || {};
    const rawText = String(message.text || message.extracted_text || message.preview || "").trim();
    const extractText = String(message.extracted_text || message.text || message.preview || "").trim();
    if (!payload?.event_id || !message?.message_id || !rawText) return new Response("Missing message fields", { status: 400 });

    await ctx.scheduler.runAfter(0, anyApi.mail.processInbound, {
      eventId: String(payload.event_id),
      messageId: String(message.message_id),
      threadId: message.thread_id ? String(message.thread_id) : undefined,
      inReplyTo: message.in_reply_to ? String(message.in_reply_to) : undefined,
      rawText,
      extractText,
    });
    return new Response("ok", { status: 200 });
  }),
});

registerStaticRoutes(http, components.staticHosting);

export default http;
