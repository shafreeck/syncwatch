import { type Room, type User, type Message, type Video, type InsertRoom, type InsertUser, type InsertMessage, type InsertVideo } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { rooms, users, messages, videos } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Room operations
  createRoom(room: InsertRoom): Promise<Room>;
  getRoom(id: string): Promise<Room | undefined>;
  getRoomByCode(roomCode: string): Promise<Room | undefined>;
  updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined>;
  deleteRoom(id: string): Promise<boolean>;

  // User operations
  createUser(user: InsertUser): Promise<User>;
  createUserWithId(user: User): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUsersByRoom(roomId: string): Promise<User[]>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Message operations
  createMessage(message: InsertMessage): Promise<Message>;
  getMessagesByRoom(roomId: string): Promise<Message[]>;

  // Video operations
  createVideo(video: InsertVideo): Promise<Video>;
  getVideosByRoom(roomId: string): Promise<Video[]>;
  getVideo(id: string): Promise<Video | undefined>;
  updateVideo(id: string, updates: Partial<Video>): Promise<Video | null>;
  deleteVideo(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private rooms: Map<string, Room>;
  private users: Map<string, User>;
  private messages: Map<string, Message>;
  private videos: Map<string, Video>;

  constructor() {
    this.rooms = new Map();
    this.users = new Map();
    this.messages = new Map();
    this.videos = new Map();
  }

  // Room operations
  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = randomUUID();
    const room: Room = {
      ...insertRoom,
      id,
      roomCode: insertRoom.roomCode || null,
      createdAt: new Date(),
      isActive: true,
    };
    this.rooms.set(id, room);
    return room;
  }

  async getRoom(id: string): Promise<Room | undefined> {
    return this.rooms.get(id);
  }

  async getRoomByCode(roomCode: string): Promise<Room | undefined> {
    return Array.from(this.rooms.values()).find(room => room.roomCode === roomCode);
  }

  async updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined> {
    const room = this.rooms.get(id);
    if (!room) return undefined;
    
    const updatedRoom = { ...room, ...updates };
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  async deleteRoom(id: string): Promise<boolean> {
    return this.rooms.delete(id);
  }

  // User operations
  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      joinedAt: new Date(),
      roomId: insertUser.roomId || null,
      isHost: insertUser.isHost || false,
    };
    this.users.set(id, user);
    return user;
  }

  async createUserWithId(user: User): Promise<User> {
    this.users.set(user.id, user);
    return user;
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUsersByRoom(roomId: string): Promise<User[]> {
    return Array.from(this.users.values()).filter(user => user.roomId === roomId);
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    
    const updatedUser = { ...user, ...updates };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async deleteUser(id: string): Promise<boolean> {
    return this.users.delete(id);
  }

  // Message operations
  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const id = randomUUID();
    const message: Message = {
      ...insertMessage,
      id,
      timestamp: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessagesByRoom(roomId: string): Promise<Message[]> {
    return Array.from(this.messages.values())
      .filter(message => message.roomId === roomId)
      .sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0));
  }

  // Video operations
  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const id = randomUUID();
    const video: Video = {
      ...insertVideo,
      id,
      uploadedAt: new Date(),
      size: insertVideo.size || null,
      magnetUri: insertVideo.magnetUri,
      infoHash: insertVideo.infoHash,
      status: insertVideo.status || "ready",
      processingStep: insertVideo.processingStep || null,
    };
    this.videos.set(id, video);
    return video;
  }

  async getVideosByRoom(roomId: string): Promise<Video[]> {
    return Array.from(this.videos.values())
      .filter(video => video.roomId === roomId)
      .sort((a, b) => (b.uploadedAt?.getTime() || 0) - (a.uploadedAt?.getTime() || 0));
  }

  async getVideo(id: string): Promise<Video | undefined> {
    return this.videos.get(id);
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video | null> {
    const video = this.videos.get(id);
    if (!video) return null;
    
    const updatedVideo = { ...video, ...updates };
    this.videos.set(id, updatedVideo);
    return updatedVideo;
  }

  async deleteVideo(id: string): Promise<boolean> {
    return this.videos.delete(id);
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async createUserWithId(user: User): Promise<User> {
    // Use upsert logic: try to update first, if no rows affected, insert
    try {
      const [updatedUser] = await db
        .update(users)
        .set({
          username: user.username,
          roomId: user.roomId,
          isHost: user.isHost,
          joinedAt: user.joinedAt
        })
        .where(eq(users.id, user.id))
        .returning();
      
      if (updatedUser) {
        console.log(`🔄 Updated existing user: ${user.id}`);
        return updatedUser;
      }
    } catch (error) {
      console.log(`⚠️ Update failed, trying insert: ${error}`);
    }
    
    // If update didn't work, try insert
    try {
      const [createdUser] = await db
        .insert(users)
        .values(user)
        .returning();
      console.log(`✅ Created new user: ${user.id}`);
      return createdUser;
    } catch (error) {
      console.error(`❌ Both update and insert failed for user ${user.id}:`, error);
      throw error;
    }
  }

  async getUsersByRoom(roomId: string): Promise<User[]> {
    return await db.select().from(users).where(eq(users.roomId, roomId));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db
      .delete(users)
      .where(eq(users.id, id))
      .returning({ id: users.id });
    return result.length > 0;
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const [room] = await db
      .insert(rooms)
      .values(insertRoom)
      .returning();
    return room;
  }

  async getRoom(id: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, id));
    return room || undefined;
  }

  async getRoomByCode(roomCode: string): Promise<Room | undefined> {
    const [room] = await db.select().from(rooms).where(eq(rooms.roomCode, roomCode));
    return room || undefined;
  }

  async updateRoom(id: string, updates: Partial<Room>): Promise<Room | undefined> {
    const [room] = await db
      .update(rooms)
      .set(updates)
      .where(eq(rooms.id, id))
      .returning();
    return room || undefined;
  }

  async deleteRoom(id: string): Promise<boolean> {
    const result = await db
      .delete(rooms)
      .where(eq(rooms.id, id))
      .returning({ id: rooms.id });
    return result.length > 0;
  }

  async createMessage(insertMessage: InsertMessage): Promise<Message> {
    const [message] = await db
      .insert(messages)
      .values(insertMessage)
      .returning();
    return message;
  }

  async getMessagesByRoom(roomId: string): Promise<Message[]> {
    return await db.select().from(messages).where(eq(messages.roomId, roomId));
  }

  async createVideo(insertVideo: InsertVideo): Promise<Video> {
    const [video] = await db
      .insert(videos)
      .values(insertVideo)
      .returning();
    return video;
  }

  async getVideosByRoom(roomId: string): Promise<Video[]> {
    return await db.select().from(videos).where(eq(videos.roomId, roomId));
  }

  async getVideo(id: string): Promise<Video | undefined> {
    const [video] = await db.select().from(videos).where(eq(videos.id, id));
    return video || undefined;
  }

  async updateVideo(id: string, updates: Partial<Video>): Promise<Video | null> {
    try {
      const [updatedVideo] = await db
        .update(videos)
        .set(updates)
        .where(eq(videos.id, id))
        .returning();
      return updatedVideo || null;
    } catch (error) {
      console.error("Error updating video:", error);
      return null;
    }
  }

  async deleteVideo(id: string): Promise<boolean> {
    const result = await db
      .delete(videos)
      .where(eq(videos.id, id))
      .returning({ id: videos.id });
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
