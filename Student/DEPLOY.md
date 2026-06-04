# Deploy to Supabase + Vercel

This guide gets **Learning Partner Hub** running online with a real database.

## Overview

- **Supabase** — PostgreSQL database + user accounts
- **Vercel** — hosts the React app (free tier)

---

## Step 1: Create a Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign up (free).
2. Click **New project**.
3. Choose an organization, name, database password, and region.
4. Wait for the project to finish provisioning.

---

## Step 2: Run the database schema

1. In Supabase, open **SQL Editor**.
2. Click **New query**.
3. Copy the entire contents of `supabase/schema.sql` from this repo.
4. Paste and click **Run**.

You should see success messages for tables and RLS policies.

---

## Step 3: Enable email auth (recommended)

1. In Supabase, go to **Authentication → Providers**.
2. Ensure **Email** is enabled.
3. For quick testing, you can disable **Confirm email** under **Authentication → Settings** (optional).

---

## Step 4: Get your API keys

1. In Supabase, go to **Project Settings → API**.
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## Step 5: Local development with Supabase

1. In the `LearningPartnerHub` folder, copy the example env file:

   ```bash
   cp .env.example .env
   ```

2. Paste your Supabase URL and anon key into `.env`.

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the app, click **Create account**, sign up, then **Sign in**.
5. You should see **Cloud sync enabled** in the header.

If you had local browser data before signing in, use **Upload local data** to migrate it to Supabase.

---

## Step 6: Deploy to Vercel

### Option A: Vercel website (easiest)

1. Push this project to **GitHub** (if not already).
2. Go to [https://vercel.com](https://vercel.com) and sign up.
3. Click **Add New → Project** and import your GitHub repo.
4. Set **Root Directory** to `LearningPartnerHub` (if the repo root is the parent folder).
5. Under **Environment Variables**, add:

   | Name | Value |
   |------|--------|
   | `VITE_SUPABASE_URL` | your Supabase project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `VISION_CLOUD_API_KEY` | your [OpenRouter API key](https://openrouter.ai/settings/keys) (free — enables **Cloud API** screenshot scan) |

   OpenRouter defaults (no need to set unless you override): Nemotron VL free at `https://openrouter.ai/api/v1`.

6. Click **Deploy**.

### Option B: Vercel CLI

```bash
cd LearningPartnerHub
npm i -g vercel
vercel
```

When prompted, add the same environment variables in the Vercel dashboard under **Project → Settings → Environment Variables**.

---

## Step 7: Allow your Vercel URL in Supabase (if needed)

If auth redirects fail after deploy:

1. Supabase → **Authentication → URL Configuration**
2. Add your Vercel URL to **Site URL** and **Redirect URLs**, e.g.:
   - `https://your-app.vercel.app`

---

## How cloud sync works

| Signed in + env vars set | Behavior |
|--------------------------|----------|
| Yes | Data saved to Supabase (per user account) |
| No | Data saved in browser `localStorage` only |

Each user only sees their own classes and attendance (Row Level Security).

---

## Screenshot import (vision AI)

The **Screenshot** tab uses a vision language model to read class details, Learning Partner names, and present/absent checkboxes into the same JSON format as manual import.

### This Device (free, local — best accuracy on your PC)

1. Install [Ollama](https://ollama.com) and run `ollama pull qwen2.5vl:7b`
2. Add to `.env` (local dev only — not for Vercel users):

   ```
   VITE_VISION_LLM_API_KEY=ollama
   VITE_VISION_LLM_BASE_URL=http://localhost:11434/v1
   VITE_VISION_LLM_MODEL=qwen2.5vl:7b
   ```

Ollama only runs on **your computer**. Visitors on your Vercel URL cannot use it unless they also run Ollama locally.

### Cloud API (for Vercel — no localhost)

The deployed app uses a **Vercel serverless proxy** (`/api/vision-scan`) so API keys never ship to the browser.

**Recommended (configured in this repo): [OpenRouter](https://openrouter.ai) + [Nemotron Nano 12B 2 VL (free)](https://openrouter.ai/nvidia/nemotron-nano-12b-v2-vl:free)** — $0, built for document/OCR-style screenshots.

**In Vercel → Settings → Environment Variables** (only the key is required):

| Name | Value |
|------|--------|
| `VISION_CLOUD_API_KEY` | from [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys) |

Optional overrides (defaults are already OpenRouter + Nemotron VL free):

| Name | Default |
|------|---------|
| `VISION_CLOUD_PROVIDER` | `openrouter` |
| `VISION_CLOUD_BASE_URL` | `https://openrouter.ai/api/v1` |
| `VISION_CLOUD_MODEL` | `nvidia/nemotron-nano-12b-v2-vl:free` |

Production builds automatically use the secure `/api/vision-scan` proxy (your key never ships to the browser). Redeploy after saving env vars.

**Setup (2 minutes):**

1. Sign up at [OpenRouter](https://openrouter.ai) (free).
2. Create an API key at [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys).
3. Paste it as `VISION_CLOUD_API_KEY` in Vercel → redeploy.
4. In the app: **Record Attendance → Screenshot → Cloud API**.

**Local testing of Cloud API:** run `npx vercel dev` in `LearningPartnerHub` with `VISION_CLOUD_API_KEY` set, or use **This Device** with Ollama for everyday dev.

#### Other providers (optional)

You can override `VISION_CLOUD_BASE_URL` and `VISION_CLOUD_MODEL` for Groq, Gemini, or DashScope — see `.env.example`. PewDiePie’s [Odysseus](https://github.com/pewdiepie-archdaemon/odysseus) is **not** a hosted API (local desktop only).

### Faster screenshot scans

| Approach | Speed |
|----------|--------|
| **JSON tab** + Copilot paste | Fastest (no vision step) |
| **Cloud API** (Groq / OpenRouter) | Often faster than local CPU |
| **Local Ollama + GPU** | Much faster than CPU-only |
| **Smaller model** (`qwen2.5vl:3b`) | Faster, slightly less accurate |
| **Keep Ollama running** + open Screenshot tab first | Avoids cold-start on first scan |

Optional `.env` tuning (see `.env.example`): lower `VITE_VISION_MAX_IMAGE_WIDTH` (e.g. `1120`) for quicker scans on large screenshots.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Running in local mode" | Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to `.env` or Vercel env vars, then rebuild |
| Sign up shows "Network error" | Use the **Project URL** for `VITE_SUPABASE_URL` (e.g. `https://xxx.supabase.co`), not the REST URL ending in `/rest/v1/` |
| Sign up doesn't work | Check Supabase Auth settings; disable email confirmation for testing |
| RLS / permission errors | Re-run `supabase/schema.sql` |
| Blank page after deploy | Check Vercel build logs; ensure root directory is `LearningPartnerHub` |
| Cloud API unavailable on Vercel | Add `VISION_CLOUD_API_KEY` from OpenRouter, then redeploy |
| Cloud scan fails locally | Use **This Device** with Ollama, or run `npx vercel dev` to test the proxy |

---

## Free tier limits (typical)

- **Supabase**: 500 MB database, 50k monthly active users on auth
- **Vercel**: Hobby plan — fine for personal/school use

For production at scale, consider paid tiers and regular backups.
