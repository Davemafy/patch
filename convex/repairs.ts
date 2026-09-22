import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const candidateInput = v.object({
  name: v.string(),
  website: v.string(),
  email: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  serviceEvidence: v.string(),
  sourceUrl: v.string(),
  sourceTitle: v.optional(v.string()),
});

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});

export const createRepair = mutation({
  args: {
    description: v.string(),
    area: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const description = clean(args.description);
    const area = clean(args.area);
    if (description.length < 8) throw new Error("Tell us a little more about what broke.");
    if (description.length > 1200) throw new Error("Keep the repair description under 1,200 characters.");
    if (area.length < 2) throw new Error("Add your area so Patch knows where to look.");
    if (area.length > 120) throw new Error("Keep the area under 120 characters.");

    const now = Date.now();
    const repairId = await ctx.db.insert("repairs", {
      description,
      area,
      photoStorageId: args.photoStorageId,
      status: "reported",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("events", { repairId, kind: "reported", createdAt: now });
    return repairId;
  },
});

export const getRepair = query({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, { repairId }) => {
    const repair = await ctx.db.get(repairId);
    if (!repair) return null;

    const [candidates, outreach, replies] = await Promise.all([
      ctx.db.query("candidates").withIndex("by_repair", (q) => q.eq("repairId", repairId)).collect(),
      ctx.db.query("outreach").withIndex("by_repair", (q) => q.eq("repairId", repairId)).collect(),
      ctx.db.query("replies").withIndex("by_repair", (q) => q.eq("repairId", repairId)).collect(),
    ]);

    const photoUrl = repair.photoStorageId ? await ctx.storage.getUrl(repair.photoStorageId) : null;
    const outreachByCandidate = new Map(outreach.map((item) => [item.candidateId.toString(), item]));
    const replyByCandidate = new Map(replies.map((item) => [item.candidateId.toString(), item]));

    return {
      repair: {
        ...repair,
        photoUrl,
      },
      candidates: candidates.map((candidate) => ({
        ...candidate,
        outreach: outreachByCandidate.get(candidate._id.toString()) ?? null,
        reply: replyByCandidate.get(candidate._id.toString()) ?? null,
        chosen: repair.chosenCandidateId?.toString() === candidate._id.toString(),
      })),
    };
  },
});

export const markLooking = mutation({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, { repairId }) => {
    const repair = await ctx.db.get(repairId);
    if (!repair || repair.status === "chosen") return;
    await ctx.db.patch(repairId, { status: "looking", lastError: undefined, updatedAt: Date.now() });
  },
});

export const saveDiscoveredRepairPeople = mutation({
  args: {
    repairId: v.id("repairs"),
    category: v.string(),
    searchQuery: v.string(),
    candidates: v.array(candidateInput),
  },
  handler: async (ctx, args) => {
    const repair = await ctx.db.get(args.repairId);
    if (!repair) throw new Error("Repair not found.");
    if (repair.status === "chosen") return;

    const now = Date.now();
    for (const candidate of args.candidates.slice(0, 4)) {
      const existing = await ctx.db
        .query("candidates")
        .withIndex("by_repair_source", (q) => q.eq("repairId", args.repairId).eq("sourceUrl", candidate.sourceUrl))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { ...candidate });
      } else {
        await ctx.db.insert("candidates", { repairId: args.repairId, ...candidate, createdAt: now });
      }
    }

    await ctx.db.patch(args.repairId, {
      category: clean(args.category),
      searchQuery: clean(args.searchQuery),
      status: "looking",
      lastError: args.candidates.length ? undefined : "We couldn't find a strong match yet. Try a nearby area or a little more detail.",
      updatedAt: now,
    });
    await ctx.db.insert("events", {
      repairId: args.repairId,
      kind: args.candidates.length ? "people_found" : "no_people_found",
      detail: String(args.candidates.length),
      createdAt: now,
    });
  },
});

export const setRepairError = mutation({
  args: { repairId: v.id("repairs"), message: v.string() },
  handler: async (ctx, { repairId, message }) => {
    const repair = await ctx.db.get(repairId);
    if (!repair || repair.status === "chosen") return;
    await ctx.db.patch(repairId, { lastError: clean(message).slice(0, 240), updatedAt: Date.now() });
  },
});

export const prepareOutreach = mutation({
  args: { candidateId: v.id("candidates") },
  handler: async (ctx, { candidateId }) => {
    const candidate = await ctx.db.get(candidateId);
    if (!candidate) throw new Error("Repair person not found.");
    if (!candidate.email) return { shouldSend: false, reason: "missing_email" as const, outreachId: null };

    const existing = await ctx.db
      .query("outreach")
      .withIndex("by_candidate", (q) => q.eq("candidateId", candidateId))
      .first();
    if (existing) {
      const safeConfigRetry = existing.status === "failed" && /not configured in Convex/.test(existing.error || "");
      if (!safeConfigRetry) return { shouldSend: false, reason: "already_started" as const, outreachId: existing._id };
      await ctx.db.patch(existing._id, { status: "sending", error: undefined });
      const repair = await ctx.db.get(candidate.repairId);
      if (!repair || repair.status === "chosen") return { shouldSend: false, reason: "already_chosen" as const, outreachId: existing._id };
      return { shouldSend: true, reason: null, outreachId: existing._id, candidate, repair };
    }

    const repair = await ctx.db.get(candidate.repairId);
    if (!repair) throw new Error("Repair not found.");
    if (repair.status === "chosen") return { shouldSend: false, reason: "already_chosen" as const, outreachId: null };

    const outreachId = await ctx.db.insert("outreach", {
      repairId: candidate.repairId,
      candidateId,
      recipient: candidate.email,
      status: "sending",
      createdAt: Date.now(),
    });
    return { shouldSend: true, reason: null, outreachId, candidate, repair };
  },
});

export const markOutreachSent = mutation({
  args: {
    outreachId: v.id("outreach"),
    messageId: v.string(),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const outreach = await ctx.db.get(args.outreachId);
    if (!outreach) return;
    const now = Date.now();
    await ctx.db.patch(args.outreachId, {
      status: "sent",
      messageId: args.messageId,
      threadId: args.threadId,
      error: undefined,
      sentAt: now,
    });
    const repair = await ctx.db.get(outreach.repairId);
    if (repair && repair.status !== "chosen" && repair.status !== "options_ready") {
      await ctx.db.patch(outreach.repairId, { status: "waiting", lastError: undefined, updatedAt: now });
    }
    await ctx.db.insert("events", {
      repairId: outreach.repairId,
      kind: "outreach_sent",
      detail: outreach.recipient,
      createdAt: now,
    });
  },
});

export const markOutreachFailed = mutation({
  args: { outreachId: v.id("outreach"), error: v.string() },
  handler: async (ctx, { outreachId, error }) => {
    const outreach = await ctx.db.get(outreachId);
    if (!outreach) return;
    await ctx.db.patch(outreachId, { status: "failed", error: clean(error).slice(0, 240) });
  },
});

export const findOutreachForInbound = query({
  args: {
    threadId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.threadId) {
      const byThread = await ctx.db.query("outreach").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).first();
      if (byThread) return byThread;
    }
    if (args.inReplyTo) {
      const byMessage = await ctx.db.query("outreach").withIndex("by_message", (q) => q.eq("messageId", args.inReplyTo)).first();
      if (byMessage) return byMessage;
    }
    return null;
  },
});

export const recordRepairReply = mutation({
  args: {
    outreachId: v.id("outreach"),
    messageId: v.string(),
    eventId: v.string(),
    rawText: v.string(),
    canTakeJob: v.union(v.boolean(), v.null()),
    arrivalText: v.union(v.string(), v.null()),
    priceAmount: v.union(v.number(), v.null()),
    currency: v.union(v.string(), v.null()),
    note: v.union(v.string(), v.null()),
    extractionStatus: v.union(v.literal("ok"), v.literal("failed")),
    extractionError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const duplicateByEvent = await ctx.db.query("replies").withIndex("by_event", (q) => q.eq("eventId", args.eventId)).first();
    if (duplicateByEvent) return duplicateByEvent._id;
    const duplicateByMessage = await ctx.db.query("replies").withIndex("by_message", (q) => q.eq("messageId", args.messageId)).first();
    if (duplicateByMessage) return duplicateByMessage._id;

    const outreach = await ctx.db.get(args.outreachId);
    if (!outreach) throw new Error("Matching outreach not found.");
    const now = Date.now();
    const replyId = await ctx.db.insert("replies", {
      repairId: outreach.repairId,
      candidateId: outreach.candidateId,
      outreachId: args.outreachId,
      messageId: args.messageId,
      eventId: args.eventId,
      rawText: args.rawText,
      canTakeJob: args.canTakeJob,
      arrivalText: args.arrivalText,
      priceAmount: args.priceAmount,
      currency: args.currency,
      note: args.note,
      extractionStatus: args.extractionStatus,
      extractionError: args.extractionError,
      receivedAt: now,
    });

    const repair = await ctx.db.get(outreach.repairId);
    if (repair && repair.status !== "chosen") {
      await ctx.db.patch(outreach.repairId, { status: "options_ready", lastError: undefined, updatedAt: now });
    }
    await ctx.db.insert("events", { repairId: outreach.repairId, kind: "reply_received", createdAt: now });
    return replyId;
  },
});

export const chooseRepairPerson = mutation({
  args: { repairId: v.id("repairs"), candidateId: v.id("candidates") },
  handler: async (ctx, { repairId, candidateId }) => {
    const [repair, candidate] = await Promise.all([ctx.db.get(repairId), ctx.db.get(candidateId)]);
    if (!repair || !candidate || candidate.repairId.toString() !== repairId.toString()) {
      throw new Error("That repair option is no longer available.");
    }
    const reply = await ctx.db.query("replies").withIndex("by_candidate", (q) => q.eq("candidateId", candidateId)).first();
    if (!reply) throw new Error("Wait for a real reply before choosing someone.");
    if (reply.canTakeJob === false) throw new Error("They said they can't take this job.");

    const now = Date.now();
    await ctx.db.patch(repairId, { chosenCandidateId: candidateId, status: "chosen", updatedAt: now });
    await ctx.db.insert("events", { repairId, kind: "chosen", detail: candidate.name, createdAt: now });
  },
});

export const resetDemo = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const expected = process.env.DEMO_RESET_TOKEN;
    if (!expected || token !== expected) throw new Error("Invalid demo reset token.");

    const [replies, outreach, candidates, events, repairs] = await Promise.all([
      ctx.db.query("replies").collect(),
      ctx.db.query("outreach").collect(),
      ctx.db.query("candidates").collect(),
      ctx.db.query("events").collect(),
      ctx.db.query("repairs").collect(),
    ]);
    for (const row of replies) await ctx.db.delete(row._id);
    for (const row of outreach) await ctx.db.delete(row._id);
    for (const row of candidates) await ctx.db.delete(row._id);
    for (const row of events) await ctx.db.delete(row._id);
    for (const row of repairs) await ctx.db.delete(row._id);
    return { cleared: repairs.length };
  },
});
