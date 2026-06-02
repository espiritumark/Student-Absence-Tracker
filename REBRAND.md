# Rebranding: Learning Partner Hub

The app display name is **Learning Partner Hub**. User-facing copy uses **Learning partner** instead of “student”. Database tables and code identifiers still use `students` for compatibility.

## Rename the GitHub repository

1. On GitHub: **Settings → General → Repository name** → e.g. `Learning-Partner-Hub` → Rename.
2. Update your local remote:
   ```bash
   git remote set-url origin https://github.com/YOUR_USER/Learning-Partner-Hub.git
   ```
3. Update Vercel project name / root directory if needed (still `Student` until you rename the folder below).

## Rename the app folder (optional)

The Vite app lives in `Student/`. To rename to `LearningPartnerHub/`:

1. Close the dev server.
2. Rename the folder at repo root.
3. Update any docs that say `cd Student` (README, DEPLOY.md, GUIDE.md).
4. In Vercel: set **Root Directory** to the new folder name and redeploy.

## Change branding in one place

Edit `Student/src/constants/branding.js` for `APP_NAME`, tagline, and learning-partner labels.
