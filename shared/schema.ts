import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "crypto";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  hostId: text("host_id").notNull(),
  roomCode: text("room_code"), // 可选的房间代码，作为密码使用，无需唯一性
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  username: text("username").notNull(),
  roomId: text("room_id"),
  isHost: integer("is_host", { mode: "boolean" }).default(false),
  joinedAt: integer("joined_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  content: text("content").notNull(),
  userId: text("user_id").notNull(),
  roomId: text("room_id").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const videos = sqliteTable("videos", {
  id: text("id").primaryKey().$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  magnetUri: text("magnet_uri").notNull(), // P2P磁力链接
  infoHash: text("info_hash").notNull(), // torrent哈希值
  size: text("size"), // 文件大小
  roomId: text("room_id").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  uploadedAt: integer("uploaded_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Insert schemas
export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  createdAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  joinedAt: true,
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  timestamp: true,
});

export const insertVideoSchema = createInsertSchema(videos).omit({
  id: true,
  uploadedAt: true,
});

// Types
export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Video = typeof videos.$inferSelect;
export type InsertVideo = z.infer<typeof insertVideoSchema>;

// WebSocket message types
export const wsMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join_room"),
    data: z.object({
      roomId: z.string(),
      username: z.string(),
    }),
  }),
  z.object({
    type: z.literal("leave_room"),
    data: z.object({
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("chat_message"),
    data: z.object({
      content: z.string(),
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("video_sync"),
    data: z.object({
      action: z.enum(["play", "pause", "seek"]),
      currentTime: z.number(),
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("video_share"),
    data: z.object({
      name: z.string(),
      magnetUri: z.string(),
      infoHash: z.string(),
      size: z.string(),
      roomId: z.string(),
    }),
  }),
  // Backward-compat alias to support older clients
  z.object({
    type: z.literal("video_upload"),
    data: z.object({
      name: z.string(),
      magnetUri: z.string(),
      infoHash: z.string(),
      size: z.string(),
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("video_select"),
    data: z.object({
      videoId: z.string(),
      magnetUri: z.string(),
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("video_delete"),
    data: z.object({
      videoId: z.string(),
      roomId: z.string(),
    }),
  }),
  z.object({
    type: z.literal("user_progress"),
    data: z.object({
      currentTime: z.number(),
      isPlaying: z.boolean(),
      roomId: z.string(),
    }),
  }),
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
