import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  repairs: defineTable({
    description: v.string(),
    area: v.string(),
    photoStorageId: v.optional(v.id("_storage")),
    status: v.union(
      v.literal("reported"),
      v.literal("looking"),
      v.literal("waiting"),
      v.literal("options_ready"),
      v.literal("chosen"),
    ),
    category: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
    chosenCandidateId: v.optional(v.id("candidates")),
    lastError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  candidates: defineTable({
    repairId: v.id("repairs"),
    name: v.string(),
    website: v.string(),
    email: v.optional(v.string()),
    serviceEvidence: v.string(),
    sourceUrl: v.string(),
    sourceTitle: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_repair", ["repairId"])
    .index("by_repair_source", ["repairId", "sourceUrl"]),

  outreach: defineTable({
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
    recipient: v.string(),
    status: v.union(v.literal("sending"), v.literal("sent"), v.literal("failed")),
    messageId: v.optional(v.string()),
    threadId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
  })
    .index("by_repair", ["repairId"])
    .index("by_candidate", ["candidateId"])
    .index("by_thread", ["threadId"])
    .index("by_message", ["messageId"]),

  replies: defineTable({
    repairId: v.id("repairs"),
    candidateId: v.id("candidates"),
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
    receivedAt: v.number(),
  })
    .index("by_repair", ["repairId"])
    .index("by_candidate", ["candidateId"])
    .index("by_message", ["messageId"])
    .index("by_event", ["eventId"]),

  events: defineTable({
    repairId: v.id("repairs"),
    kind: v.string(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_repair", ["repairId"]),
});
