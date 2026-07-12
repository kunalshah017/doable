import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const append = mutation({
  args: {
    sessionId: v.string(),
    kind: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("runEvents", { ...args, createdAt: Date.now() }),
});

export const list = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("runEvents")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(100),
});