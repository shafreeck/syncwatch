# Overview

This is a full-stack web application for synchronized video watching and sharing. The app allows users to create or join rooms where they can upload and watch videos together in real-time, with synchronized playback controls and live chat functionality. The application uses a modern React frontend with a Node.js/Express backend and in-memory storage for development.

## Recent Changes (August 30, 2025)

- ✅ **Fixed video playback functionality** - Videos now upload and play correctly using blob URLs
- ✅ **Resolved system freezing issues** - Simplified file upload process to prevent crashes
- ✅ **Improved file upload flow** - Added proper feedback notifications and error handling
- ✅ **Enhanced WebSocket communication** - Fixed message routing for video selection and synchronization
- ✅ **Cleaned up debugging code** - Removed temporary debugging interfaces for production readiness
- ✅ **Implemented WebTorrent progressive streaming** - Videos now play while downloading using appendTo API
- ✅ **Added one-click video seeding** - Users can share videos with a single button click
- ✅ **Added seeding progress visualization** - Real-time progress modal with upload stats and peer count

## Current Working Features

- **Room Creation and Joining** - Users can create new rooms or join existing ones
- **Video File Upload** - Support for MP4, WebM, AVI video files up to 2GB
- **Video Playback** - Uploaded videos display in available list and play correctly when selected
- **Real-time Chat** - Live messaging between room participants
- **User Management** - Multiple users can join the same room simultaneously
- **WebSocket Communication** - Real-time updates for all room activities
- **One-Click Video Seeding** - Simple button to start sharing videos with progress visualization
- **Progressive Streaming** - Videos play while downloading using WebTorrent appendTo API

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React with TypeScript**: Single-page application using React 18 with TypeScript for type safety
- **Vite Build System**: Modern build tool for fast development and optimized production builds
- **shadcn/ui Component Library**: Comprehensive UI component system built on Radix UI primitives with Tailwind CSS styling
- **Wouter Routing**: Lightweight client-side routing library for navigation
- **TanStack Query**: Server state management for API calls, caching, and synchronization
- **WebTorrent Integration**: Browser-based torrent client for peer-to-peer video streaming

## Backend Architecture
- **Express.js Server**: RESTful API server with WebSocket support for real-time communication
- **TypeScript**: Full type safety across the backend codebase
- **WebSocket Server**: Real-time bidirectional communication for chat messages and video synchronization
- **In-Memory Storage**: Temporary data storage implementation with interface for future database integration
- **Modular Route System**: Organized API endpoints for rooms, users, messages, and videos

## Database Design
- **PostgreSQL with Drizzle ORM**: Type-safe database operations with schema-first approach
- **Four Core Tables**:
  - `rooms`: Video watching sessions with host management
  - `users`: Participants in rooms with role-based permissions
  - `messages`: Real-time chat messages linked to rooms and users
  - `videos`: Video metadata including torrent information and file details
- **UUID Primary Keys**: Consistent identifier strategy across all entities
- **Timestamp Tracking**: Automatic creation and update time tracking

## Real-Time Communication
- **WebSocket Protocol**: Persistent connections for instant message delivery and video sync
- **Message Schema Validation**: Zod-based runtime validation for all WebSocket messages
- **Room-Based Broadcasting**: Messages scoped to specific rooms with user authentication
- **Video Synchronization**: Real-time playback state sharing including play/pause/seek events

## Styling and UI System
- **Tailwind CSS**: Utility-first CSS framework with custom design tokens
- **CSS Custom Properties**: Dark mode support with semantic color variables
- **Responsive Design**: Mobile-first approach with breakpoint-based layouts
- **Component Composition**: Reusable UI components with consistent styling patterns

# External Dependencies

## Core Framework Dependencies
- **@neondatabase/serverless**: PostgreSQL serverless driver for database connectivity
- **drizzle-orm**: Type-safe ORM for database operations and migrations
- **express**: Web framework for REST API and static file serving
- **ws**: WebSocket library for real-time communication
- **react**: Core React library for frontend rendering
- **@tanstack/react-query**: Server state management and caching

## UI and Styling
- **@radix-ui/***: Comprehensive set of unstyled, accessible UI primitives
- **tailwindcss**: Utility-first CSS framework for styling
- **class-variance-authority**: Type-safe utility for creating component variants
- **clsx**: Utility for conditional CSS class names

## Development and Build Tools
- **vite**: Modern build tool and development server
- **typescript**: Static type checking for JavaScript
- **tsx**: TypeScript execution environment for Node.js
- **esbuild**: Fast JavaScript bundler for production builds

## Validation and Utilities
- **zod**: Runtime type validation and schema definition
- **drizzle-zod**: Integration between Drizzle ORM and Zod validation
- **date-fns**: Modern JavaScript date utility library
- **nanoid**: URL-safe unique string ID generator

## WebTorrent Integration
- **WebTorrent**: Browser-based torrent client loaded dynamically via CDN
- **Peer-to-peer video streaming**: Direct file sharing between users without central server storage
- **Magnet URI support**: Standard torrent link format for video identification