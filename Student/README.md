# Learning Partner Hub

Track daily attendance for your learning partners, import from JSON or screenshots, draft report feedback, and get warnings for extended absences.

## Quick start (local)

```bash
cd Student
npm install
npm run dev
```

## Cloud setup (Supabase + Vercel)

See **[DEPLOY.md](./DEPLOY.md)** for full step-by-step instructions:

1. Create a Supabase project and run `supabase/schema.sql`
2. Copy `.env.example` → `.env` and add your Supabase keys
3. Sign up / sign in in the app header
4. Deploy to Vercel with the same env vars

## Usage

See **[GUIDE.md](./GUIDE.md)** for JSON format and daily workflow.

## Stack

- React + Vite
- Supabase (PostgreSQL, auth, RLS)
- Vercel (hosting)
