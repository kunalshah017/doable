import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique(),
});

export const put = mutation({
  args: {
    sessionId: v.string(),
    sessionToken: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    const value = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.patch(existing._id, value);
      return existing._id;
    }
    return await ctx.db.insert("sessions", value);
  },
});

export const remove = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_session_id", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});