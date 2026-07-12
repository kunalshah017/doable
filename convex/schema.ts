import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sessions: defineTable({
    sessionId: v.string(),
    sessionToken: v.string(),
    payload: v.any(),
    updatedAt: v.number(),
  }).index("by_session_id", ["sessionId"]),
  releases: defineTable({
    ledgerHash: v.string(),
    installationId: v.number(),
    repositoryId: v.number(),
    payload: v.any(),
    updatedAt: v.number(),
  }).index("by_release_key", ["ledgerHash", "installationId", "repositoryId"]),
  runEvents: defineTable({
    sessionId: v.string(),
    kind: v.string(),
    payload: v.any(),
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),
});