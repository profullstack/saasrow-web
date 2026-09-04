# SaaSRow - Software Directory

A modern React SPA for discovering and sharing software, built with Vite and Supabase.

## Architecture

- **Frontend**: Vite + React 19 + TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Backend**: Supabase Edge Functions
- **Database**: Supabase PostgreSQL

## Features

- Software directory with search and filtering
- Community posts and discussions
- Software submission system
- Newsletter subscriptions
- Responsive design with Tailwind CSS

## Getting Started

Install dependencies:

```bash
npm install
```

Run development server:

```bash
npm run dev
```

The application will be available at [http://localhost:5173](http://localhost:5173)

Build for production:

```bash
npm run build
```

Preview production build:

```bash
npm run preview
```

## Pages

- `/` - Home page with search and software listing
- `/featured` - Pricing plans and FAQ
- `/detailed` - Detailed software view with screenshots and reviews
- `/submit` - Submit your software
- `/community` - Community posts and discussions

## Public API, MCP server and CLI

The directory is readable without a key at `/api/v1` and over MCP at
`/api/mcp`. With an account (an email address verified by a one-time code)
you can create and manage free listings and API keys through the same API,
the MCP write tools, or the CLI in `cli/` (`npx @profullstack/saasrow login`).
See `docs/distribution.md` for the design and the deploy steps.

## Edge Functions

The application uses Supabase Edge Functions for all API operations:

- `community` - GET/POST/PATCH community posts
- `newsletter` - POST email subscriptions
- `submissions` - POST software submissions

All edge functions are deployed and active in Supabase.

## Environment Variables

The following environment variables are configured automatically:

- `VITE_SUPABASE_URL` - Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Supabase anonymous key

## Database Tables

- `community_posts` - Community discussions
- `newsletter_subscriptions` - Email subscriptions
- `software_submissions` - Software submissions

## Tech Stack

- **React 19** - Latest React with concurrent features
- **Vite 6** - Fast build tool and dev server
- **TypeScript 5** - Type safety
- **Tailwind CSS 3** - Utility-first CSS
- **React Router 6** - Client-side routing
- **Supabase** - Backend as a Service
- **Vitest** - Unit testing framework

## Testing

Run tests:

```bash
npm test
```

Run tests with UI:

```bash
npm run test:ui
```

Generate coverage report:

```bash
npm run test:coverage
```
