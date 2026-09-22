import { action } from "./_generated/server";
import { anyApi } from "convex/server";
import { v } from "convex/values";
import { understandRepair } from "./integrations/openai";
import { findRepairPeople as firecrawlFind } from "./integrations/firecrawl";

export const findRepairPeople = action({
  args: { repairId: v.id("repairs") },
  handler: async (ctx, { repairId }) => {
    await ctx.runMutation(anyApi.repairs.markLooking, { repairId });
    const view = await ctx.runQuery(anyApi.repairs.getRepair, { repairId });
    if (!view?.repair) throw new Error("Repair not found.");

    try {
      const { category, searchQuery } = await understandRepair(view.repair.description, view.repair.area);
      const candidates = await firecrawlFind(searchQuery, category);
      await ctx.runMutation(anyApi.repairs.saveDiscoveredRepairPeople, {
        repairId,
        category,
        searchQuery,
        candidates,
      });
      return { count: candidates.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Patch couldn't finish the search.";
      await ctx.runMutation(anyApi.repairs.setRepairError, { repairId, message });
      throw error;
    }
  },
});
