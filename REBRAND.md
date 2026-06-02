# Rebranding: Learning Partner Hub

The app display name is **Learning Partner Hub**. User-facing copy uses **learning partner** instead of “student”. Database tables and code identifiers still use `students` for compatibility.

## One-shot terminal rebrand (Windows)

1. **Stop** `npm run dev` and close editors using the `Student/` folder (Cursor locks the folder on Windows).
2. From PowerShell at the repo root:

```powershell
cd "C:\Github Repositories\Student-Absence-Tracker"
.\scripts\rebrand.ps1
```

The script renames `Student` → `LearningPartnerHub`, prompts you to rename the repo on GitHub, then updates `git remote`.

## Manual steps (if the script cannot move the folder)

### GitHub repository name

1. https://github.com/espiritumark/Student-Absence-Tracker/settings  
2. **General → Repository name** → `Learning-Partner-Hub` → **Rename**

```powershell
git remote set-url origin https://github.com/espiritumark/Learning-Partner-Hub.git
git remote -v
```

### App folder

```powershell
cd "C:\Github Repositories\Student-Absence-Tracker"
git mv Student LearningPartnerHub
```

If you see *Permission denied*, something still has `Student/` open — stop the dev server and retry, or close Cursor and run the command in an external terminal.

### Local clone folder (optional)

```powershell
cd "C:\Github Repositories"
Rename-Item -LiteralPath "Student-Absence-Tracker" -NewName "Learning-Partner-Hub"
```

Re-open the project from the new path in Cursor.

### Vercel

- **Root Directory**: `LearningPartnerHub`  
- Redeploy after the folder rename is pushed.

## Change branding in one place

Edit `LearningPartnerHub/src/constants/branding.js` for `APP_NAME`, tagline, and learning-partner labels.
