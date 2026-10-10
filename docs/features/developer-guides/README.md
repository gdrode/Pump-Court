# Feature 08: Developer Guides & Engineering Toolchains

> **Target Audience**: Software Engineers, Contributors, and AI Coding Agents  
> **Key Commands**: `cargo tauri dev`, `cargo test`, `npm test`  
> **Related Documents**: [Rust Backend Guide](rust-backend-guide.md), [Tracker Integration](tracker-integration.md), [Architecture](../../ARCHITECTURE.md)  
> **Maintenance Status**: Active / Developer Onboarding  

---

## 1. System Requirements & Toolchain Prerequisites

To build, run, and test Pump-Court locally:

1. **Rust Toolchain**: Rust 1.75+ via [rustup](https://rustup.rs).
2. **Node.js**: Node.js 18+ and npm.
3. **Tauri CLI**: `cargo install tauri-cli --version "^2" --locked`.
4. **Linux-Specific Prerequisites** (Windows and macOS require no additional packages):
   ```bash
   sudo apt update && sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev librsvg2-dev build-essential libssl-dev
   ```

---

## 2. Quickstart Development Workflow

### Step 1: Install Frontend Dependencies
```bash
cd frontend && npm install && cd ..
```

### Step 2a: Build and Launch the App (One Command)
```bash
./scripts/launch.sh          # macOS / Linux
scripts\launch.cmd           # Windows (double-click works too)
```
- Builds the frontend, compiles the Rust backend in release mode with the frontend baked in, then opens the app.
- Runs `npm install` first when `frontend/node_modules` is missing, or when `frontend/package-lock.json` is newer than the last install (`frontend/node_modules/.package-lock.json`). This picks up packages added by a pull or patch.
- First build: 5–15 minutes. Later builds: about a minute.
- `--no-run` (`-NoRun` on Windows) builds without launching.
- **macOS / Linux**: `launch.sh` must be executable. If you get "Permission denied", run `chmod +x scripts/launch.sh`. Commit the bit with `git update-index --chmod=+x scripts/launch.sh` (needed when committing from Windows).

### Step 2b: Launch Tauri Desktop Development Environment (Hot Reload)
From the repository root:
```bash
cd backend
cargo tauri dev
```
*This command compiles the Rust backend, starts the Vite React dev server with Hot Module Replacement (HMR), and launches the native desktop window.*

---

## 3. Running Test Suites

### 3.1 Rust Backend Unit Tests
Executes tests covering referee calculations, rep segmentation, ready check calibration, database migrations, name validation, and session state transitions:
```bash
cd backend
cargo test
```

### 3.2 Vision Prototype Tests
Executes unit tests (213) covering geometry, angles, posture gate, referee, rep logging and the phone pairing relay:
```bash
cd pumpCourt
npm test
```

### 3.2b Run the Vision Prototype
```bash
cd pumpCourt
npm run dev        # https://localhost:5173 on the network (phones need HTTPS)
npm run dev:local  # http only on this laptop; use in previews that refuse the self-signed certificate
```
See [Browser Prototype Pairing](../phone-camera/browser-prototype-pairing.md) and [Browser Prototype Judge](../referee-engine/browser-prototype-judge.md).

### 3.3 Frontend Typecheck & Production Bundle
```bash
cd frontend
npm run build
```
*(Validates TypeScript types and generates production assets under `frontend/dist/`)*.
