# Project: LiftLog (Reps)

## Deployment
- **Vercel project**: `liftlog` (https://liftlog-ashy.vercel.app)
- **GitHub repo**: https://github.com/keeper92/liftlog
- Vercel auto-deploys from `main` branch via GitHub integration
- To deploy: commit and push to `main` — do NOT use `vercel --prod` directly
- If using a worktree, push to a branch and open a PR against `main`

## Build
- Node >= 20 required (use `nvm use 20` if needed)
- `npm run build` to verify before pushing
- `npm run dev` for local development

## Tech Stack
- Next.js 16 (App Router, Turbopack)
- Tailwind CSS v4 (configured in globals.css, no tailwind.config file)
- Supabase (auth, database)
- Zustand (state management with localStorage persistence)

## Key Patterns
- Weights stored internally in lbs, displayed in user's unit preference
- Distances stored internally in miles
- Use `toStorageWeight`/`toDisplayWeight` from `src/lib/utils/units.ts`
