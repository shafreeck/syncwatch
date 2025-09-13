# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack web application for synchronized video watching and sharing. The app allows users to create or join rooms where they can upload and watch videos together in real-time, with synchronized playback controls and live chat functionality. The application uses a modern React frontend with a Node.js/Express backend and SQLite database storage.

Key features:
- Room creation and joining
- Video file upload and sharing using WebTorrent P2P technology
- Real-time synchronized video playback
- Live chat functionality
- One-click video seeding with progress visualization

## Codebase Structure

```
├── client/              # React frontend application
│   ├── src/
│   │   ├── components/  # Reusable UI components
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utility libraries
├── server/              # Node.js/Express backend
│   ├── index.ts         # Main server entry point
│   ├── routes.ts        # API and WebSocket routes
│   ├── storage.ts       # Data storage layer
│   └── db.ts            # Database configuration
├── shared/              # Shared code between frontend and backend
│   └── schema.ts        # Database schema and WebSocket message types
├── dist/                # Production build output
└── attached_assets/     # Static assets
```

## Architecture

### Frontend
- React with TypeScript
- Vite build system
- Wouter for routing
- TanStack Query for server state management
- WebTorrent for P2P video streaming
- shadcn/ui component library with Tailwind CSS

### Backend
- Express.js server with WebSocket support
- SQLite database with Drizzle ORM
- In-memory storage implementation with database persistence
- RESTful API endpoints
- WebSocket real-time communication

### Database
- SQLite with Drizzle ORM
- Four core tables: rooms, users, messages, videos
- Schema defined in shared/schema.ts

## Common Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Type checking
npm run check

# Database schema migration
npm run db:push
```

## Key Implementation Details

1. **WebTorrent Integration**: The application uses WebTorrent for P2P video sharing. The WebTorrent library is loaded via CDN but also served locally from the server.

2. **WebSocket Communication**: Real-time features use WebSockets with structured message types defined in shared/schema.ts.

3. **Database Design**: Uses SQLite with Drizzle ORM. The database schema includes tables for rooms, users, messages, and videos with relationships.

4. **File Sharing**: Videos are shared using magnet URIs and torrent technology rather than traditional file uploads.

5. **Progressive Enhancement**: Videos play while downloading using WebTorrent's appendTo API.

## Important Files

- `client/src/App.tsx` - Main application component
- `server/index.ts` - Server entry point
- `server/routes.ts` - API and WebSocket route definitions
- `shared/schema.ts` - Database schema and WebSocket message types
- `server/db.ts` - Database configuration and initialization
- `package.json` - Project dependencies and scripts

## Development Environment

- TypeScript for type safety across the stack
- Vite for frontend development with hot module replacement
- Express.js for backend API
- Tailwind CSS for styling
- shadcn/ui for UI components

The application is designed to work in a Replit environment but can run in any Node.js environment with appropriate configuration.