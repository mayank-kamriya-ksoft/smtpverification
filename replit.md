# CleanSignups - Deep SMTP Email Verification Service

## Overview

CleanSignups is an enterprise-grade email verification service that performs deep SMTP handshake analysis to validate email addresses in real-time. The application provides a web interface for users to verify email addresses through direct SMTP server communication, determining deliverability, catch-all status, inbox capacity, and other critical email validation metrics.

The project is built as a full-stack TypeScript application with a React frontend and Express backend, designed to deploy on both traditional hosting (with Replit/Railway/Fly.io) and serverless platforms (Vercel).

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- **React 18** with TypeScript for the UI layer
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight alternative to React Router)
- **TanStack Query** for server state management and API calls
- **Tailwind CSS v4** with shadcn/ui component library for styling
- **Framer Motion** for animations and transitions
- **React Hook Form** with Zod for form validation

**Design Patterns:**
- Component-based architecture with shadcn/ui components in `client/src/components/ui/`
- Custom verification card component for displaying SMTP results
- Form validation using Zod schemas shared between client and server
- Centralized API client with `@tanstack/react-query` for data fetching
- Path aliases configured for clean imports (`@/`, `@shared/`, `@assets/`)

**Key Features:**
- Single-page application with home page email verification interface
- Real-time step-by-step verification progress UI (DNS resolution, MX lookup, SMTP handshake, verification)
- Responsive design supporting mobile and desktop viewports
- Toast notifications for user feedback
- Custom fonts: Plus Jakarta Sans, Inter, and JetBrains Mono

### Backend Architecture

**Technology Stack:**
- **Express.js** server with TypeScript
- **Node.js native modules** for DNS resolution and TCP socket communication
- **Custom SMTP client** implementation for deep email verification
- **Dual deployment model:** Traditional server (Replit/Railway/Fly.io) and serverless (Vercel)

**SMTP Verification Engine:**
The core verification logic is implemented in `server/smtp-verifier.ts`:

- **Deep SMTP Handshake:** Establishes TCP connections to mail servers and performs full SMTP protocol exchanges
- **MX Record Resolution:** Uses Node's `dns/promises` to resolve and prioritize mail exchange servers
- **Retry Logic:** Implements 3-tier retry mechanism with exponential backoff (1s, 3s, 10s delays)
- **Greylisting Detection:** Identifies temporary delays from email servers
- **Inbox Full Detection:** Scans SMTP responses for quota-related keywords
- **Catch-all Detection:** Tests with random email addresses to identify catch-all domains
- **Status Classification:** Returns one of 7 statuses (valid, invalid, unknown, catch_all, retry_later, blocked, greylisted)

**Verification Flow:**
1. Parse and validate email format
2. Resolve MX records for the domain
3. Connect to highest-priority MX server via TCP socket (port 25)
4. Perform SMTP handshake (HELO/EHLO)
5. Send MAIL FROM command
6. Send RCPT TO command and analyze response
7. Classify result based on SMTP codes and response messages
8. Implement retry logic for transient failures

**API Architecture:**
- **POST /api/verify/smtp:** Primary endpoint for email verification
- Request validation using Zod schemas
- Detailed logging for debugging SMTP conversations
- CORS support for cross-origin requests

**Dual Deployment Strategy:**

1. **Traditional Server Mode** (`server/index.ts`):
   - Full Express server with middleware
   - Serves static frontend files
   - Direct SMTP verification execution
   - Used for Replit, Railway, Fly.io deployments

2. **Serverless Mode** (`api/verify/smtp.ts`):
   - Vercel serverless function
   - 30-second execution limit
   - Proxies requests to external SMTP backend via `SMTP_BACKEND_URL` environment variable
   - Separates compute-intensive SMTP operations from frontend hosting

### Data Storage Solutions

**Current Implementation:**
- **In-memory storage** (`server/storage.ts`) with `MemStorage` class
- User schema defined with Drizzle ORM in `shared/schema.ts`
- PostgreSQL schema ready but not currently utilized in verification flow

**Database Schema (Prepared but Unused):**
```typescript
users table:
  - id: UUID (primary key)
  - username: text (unique)
  - password: text
```

**Design Decision:**
The application currently operates statelessly for email verification. The database infrastructure is provisioned for future features (user accounts, verification history, API keys) but not required for core functionality. This allows the service to scale horizontally without database dependencies.

### External Dependencies

**Core Infrastructure:**
- **Neon Database:** Serverless PostgreSQL provider (configured but optional)
  - Connection via `@neondatabase/serverless` driver
  - DATABASE_URL environment variable
  - Drizzle ORM for schema management

**Email Verification Backend:**
- **SMTP Backend Service:** External service for serverless deployments
  - Configured via `SMTP_BACKEND_URL` environment variable
  - Handles actual SMTP verification when running on Vercel
  - Required because Vercel serverless functions cannot open TCP sockets to port 25

**Development Tools:**
- **Replit-specific plugins:**
  - `@replit/vite-plugin-cartographer` for code mapping
  - `@replit/vite-plugin-dev-banner` for development UI
  - `@replit/vite-plugin-runtime-error-modal` for error overlays
  - Custom `vite-plugin-meta-images` for OpenGraph image URL generation

**Third-Party Services:**
- **Google Fonts:** Inter, Plus Jakarta Sans, JetBrains Mono
- **Lucide React:** Icon library for UI components

**Build and Deployment:**
- **Vercel:** Serverless hosting platform
  - Static frontend serving from `dist/public`
  - Serverless functions in `api/` directory
  - 30-second function timeout
  - Proxy pattern to external SMTP backend

- **esbuild:** Server-side bundling
  - Bundles specific dependencies to reduce cold start times
  - Allowlist includes: drizzle-orm, express, session management, etc.
  - Externalizes remaining dependencies

**Styling and UI:**
- **Tailwind CSS v4** with custom theme configuration
- **shadcn/ui:** Pre-built accessible component library (50+ components)
- **Radix UI:** Headless component primitives
- **class-variance-authority:** Type-safe component variants
- **tw-animate-css:** CSS animations for Tailwind

**Security Considerations:**
- Email validation performed server-side to prevent client manipulation
- SMTP connections use proper timeout handling (15 second default)
- Input sanitization via Zod schemas
- No sensitive SMTP credentials stored (direct socket connections)