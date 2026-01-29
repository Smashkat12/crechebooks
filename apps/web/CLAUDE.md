# CrecheBooks Web (Next.js 15)

See root `CLAUDE.md` for full project configuration, claude-flow v3 setup, and domain rules.

## Web-Specific Notes
- Next.js 15 with App Router (`src/app/`)
- React 19, TypeScript, Tailwind CSS, shadcn/ui
- State: TanStack Query (server) + Zustand (client)
- Auth: next-auth with JWT from API
- API base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:3000`)
- Dev server: `pnpm dev:web` (port 3001)
