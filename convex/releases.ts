import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const releaseArgs = {
  ledgerHash: v.string(),
  installationId: v.number(),
  repositoryId: v.number(),
};

export const get = query({
  args: releaseArgs,
  handler: async (ctx, args) =>
    await ctx.db
      .query("releases")
      .withIndex("by_release_key", (q) =>
        q
          .eq("ledgerHash", args.ledgerHash)
          .eq("installationId", args.installationId)
          .eq("repositoryId", args.repositoryId),
      )
      .unique(),
});

export const put = mutation({
  args: { ...releaseArgs, payload: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("releases")
      .withIndex("by_release_key", (q) =>
        q
          .eq("ledgerHash", args.ledgerHash)
          .eq("installationId", args.installationId)
          .eq("repositoryId", args.repositoryId),
      )
      .unique();
    const value = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("releases", value);
  },
});
