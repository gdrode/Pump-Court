# Builds Pump Court (frontend + Rust backend) into one desktop executable and
# starts it. Windows PowerShell:  .\scripts\launch.ps1   (or double-click launch.cmd)
#
#   .\scripts\launch.ps1           build (only what changed) and launch
#   .\scripts\launch.ps1 -NoRun    build only; prints where the .exe is
param([switch]$NoRun)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { throw "Missing '$cmd'. $hint" }
}
Need cargo "Install Rust from https://rustup.rs"
Need npm "Install Node.js 18+ from https://nodejs.org"

Write-Host "==> Frontend (React + TypeScript)"
Push-Location "$Root\frontend"
try {
  # Install packages when they're missing or package-lock.json changed since the
  # last install (e.g. after a pull or patch that added a package).
  $installed = "node_modules\.package-lock.json"
  if (-not (Test-Path $installed) -or (Get-Item package-lock.json).LastWriteTime -gt (Get-Item $installed).LastWriteTime) {
    npm install; if ($LASTEXITCODE) { throw "npm install failed" }
  }
  npm run build; if ($LASTEXITCODE) { throw "frontend build failed" }
} finally { Pop-Location }

Write-Host "==> Desktop app (Rust + Tauri, release build; the first one takes a few minutes)"
Push-Location "$Root\backend"
try {
  cargo build --release --features custom-protocol; if ($LASTEXITCODE) { throw "cargo build failed" }
} finally { Pop-Location }

$App = "$Root\backend\target\release\pump-court.exe"
Write-Host "==> Built: $App"
if (-not $NoRun) {
  Write-Host "==> Launching Pump Court"
  Start-Process $App
}
