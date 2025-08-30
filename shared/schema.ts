import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, json, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  hostId: varchar("host_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  isActive: boolean("is_active").default(true),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull(),
  roomId: varchar("room_id"),
  isHost: boolean("is_host").default(false),
  joinedAt: timestamp("joined_at").defaultNow(),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  userId: varchar("user_id").notNull(),
  roomId: varchar("room_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const videos = pgTable("videos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  magnetUri: text("magnet_uri").notNull(), // P2P磁力链接
  infoHash: text("info_hash").notNull(), // torrent哈希值
  size: varchar("size"), // 文件大小
  roomId: varchar("room_id").notNull(),
  uploadedBy: varchar("uploaded_by").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
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
]);

export type WSMessage = z.infer<typeof wsMessageSchema>;
