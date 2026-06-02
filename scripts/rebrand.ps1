# Learning Partner Hub — folder & git remote rebrand
# Run from repo root. Close Cursor terminals running `npm run dev` and any editors locking Student/ first.

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$OldAppDir = 'Student'
$NewAppDir = 'LearningPartnerHub'
$NewRepoName = 'Learning-Partner-Hub'
$GitHubUser = 'espiritumark'

Write-Host "Repo root: $RepoRoot" -ForegroundColor Cyan

if (Test-Path $NewAppDir) {
  Write-Host "App folder '$NewAppDir' already exists — skipping app rename." -ForegroundColor Yellow
} elseif (-not (Test-Path $OldAppDir)) {
  Write-Error "Expected folder '$OldAppDir' not found."
} else {
  Write-Host "Renaming $OldAppDir -> $NewAppDir ..." -ForegroundColor Cyan
  try {
    git mv $OldAppDir $NewAppDir
    Write-Host "Renamed with git mv." -ForegroundColor Green
  } catch {
    Write-Host "git mv failed ($($_.Exception.Message)). Trying Move-Item ..." -ForegroundColor Yellow
    Move-Item -LiteralPath $OldAppDir -Destination $NewAppDir
    git add -A
    Write-Host "Renamed with Move-Item and staged." -ForegroundColor Green
  }
}

$NewRemote = "https://github.com/$GitHubUser/$NewRepoName.git"
$CurrentRemote = (git remote get-url origin 2>$null)
if ($CurrentRemote -ne $NewRemote) {
  Write-Host ""
  Write-Host "Before updating origin, rename the repo on GitHub:" -ForegroundColor Yellow
  Write-Host "  https://github.com/$GitHubUser/Student-Absence-Tracker/settings" -ForegroundColor Yellow
  Write-Host "  Settings -> General -> Repository name -> $NewRepoName" -ForegroundColor Yellow
  $confirm = Read-Host "Have you renamed the repo on GitHub? (y/N)"
  if ($confirm -eq 'y' -or $confirm -eq 'Y') {
    git remote set-url origin $NewRemote
    Write-Host "origin -> $NewRemote" -ForegroundColor Green
    git remote -v
  } else {
    Write-Host "Skipped remote update. When ready, run:" -ForegroundColor Yellow
    Write-Host "  git remote set-url origin $NewRemote" -ForegroundColor Yellow
  }
} else {
  Write-Host "origin already set to $NewRemote" -ForegroundColor Green
}

Write-Host ""
Write-Host "Optional: rename the local clone folder (close Cursor first):" -ForegroundColor Cyan
Write-Host "  cd `"$((Split-Path -Parent $RepoRoot))`"" -ForegroundColor Gray
Write-Host "  Rename-Item -LiteralPath `"$(Split-Path -Leaf $RepoRoot)`" -NewName `"$NewRepoName`"" -ForegroundColor Gray
Write-Host ""
Write-Host "Vercel: set Root Directory to $NewAppDir and redeploy." -ForegroundColor Cyan
Write-Host "Done." -ForegroundColor Green
