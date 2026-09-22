import { action } from "./_generated/server";
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { sendRepairRequest } from "./integrations/agentmail";
import { extractReplyFacts } from "./integrations/openai";

export const askRepairPeople = action({
  args: { candidateIds: v.array(v.id("candidates")) },
  handler: async (ctx, { candidateIds }) => {
    const uniqueIds = [...new Map(candidateIds.map((id) => [id.toString(), id])).values()].slice(0, 4);
    let sent = 0;
    const failures: string[] = [];

    for (const candidateId of uniqueIds) {
      const prepared = await ctx.runMutation(anyApi.repairs.prepareOutreach, { candidateId });
      if (!prepared?.shouldSend) continue;
      const { outreachId, candidate, repair } = prepared;
      try {
        const result = await sendRepairRequest({
          to: candidate.email,
          repairId: repair._id.toString(),
          description: repair.description,
          area: repair.area,
        });
        await ctx.runMutation(anyApi.repairs.markOutreachSent, {
          outreachId,
          messageId: result.messageId,
          threadId: result.threadId,
        });
        sent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Could not send the message.";
        failures.push(candidate.name);
        await ctx.runMutation(anyApi.repairs.markOutreachFailed, { outreachId, error: message });
      }
    }

    if (sent === 0 && failures.length) throw new Error(`We couldn't reach ${failures.join(", ")}.`);
    return { sent, failures };
  },
});

export const processInbound = action({
  args: {
    eventId: v.string(),
    messageId: v.string(),
    threadId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    rawText: v.string(),
  },
  handler: async (ctx, args) => {
    const outreach = await ctx.runQuery(anyApi.repairs.findOutreachForInbound, {
      threadId: args.threadId,
      inReplyTo: args.inReplyTo,
    });
    if (!outreach) return { ignored: true, reason: "No matching Patch outreach." };

    let extractionStatus: "ok" | "failed" = "ok";
    let extractionError: string | undefined;
    let facts = {
      canTakeJob: null as boolean | null,
      arrivalText: null as string | null,
      priceAmount: null as number | null,
      currency: null as string | null,
      note: null as string | null,
    };
    try {
      facts = await extractReplyFacts(args.rawText);
    } catch (error) {
      extractionStatus = "failed";
      extractionError = error instanceof Error ? error.message : "OpenAI extraction failed.";
    }

    await ctx.runMutation(anyApi.repairs.recordRepairReply, {
      outreachId: outreach._id,
      messageId: args.messageId,
      eventId: args.eventId,
      rawText: args.rawText,
      ...facts,
      extractionStatus,
      extractionError,
    });
    return { ignored: false, extractionStatus };
  },
});
