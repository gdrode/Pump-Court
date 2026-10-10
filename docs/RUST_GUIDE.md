# Rust in this project: a first-timer's guide

> 💡 **Notice for AI Agents and Developers**: This guide is part of the documentation suite. See also [`docs/features/developer-guides/rust-backend-guide.md`](features/developer-guides/rust-backend-guide.md) and [`docs/features/developer-guides/`](features/developer-guides/README.md).

This is a tour of the Rust ideas you'll meet in `backend/`, using the
project's own code as examples. The backend is small: it keeps the round
clock and score, stores results, and serves phone cameras. The camera
tracking and the referee are TypeScript (see [INTEGRATION.md](INTEGRATION.md)).

## Cargo, crates and the folder layout

* **Cargo** is Rust's build tool and package manager (like npm).
* `backend/Cargo.toml` is the `package.json`: name, version, and
  `[dependencies]` (called **crates**). `Cargo.lock` pins exact versions.
* `cargo build` compiles, `cargo test` runs tests, `cargo run` runs.
  `cargo tauri dev` is the Tauri CLI plugged into Cargo.
* Build output goes to `backend/target/` (ignored by git).
* `build.rs` is a **build script**: Rust code Cargo runs *before* compiling
  the app. Here it copies the built phone page (`frontend/dist/phone.html`)
  into the build so the server can embed it, then runs Tauri's own setup.

```
backend/
├── Cargo.toml          dependencies
├── build.rs            runs before compiling; embeds the phone page
├── tauri.conf.json     window size, app name, where the frontend lives
├── capabilities/       which windows ("main", "crowd") may call which Tauri APIs
└── src/
    ├── main.rs         entry point; just calls lib.rs
    ├── lib.rs          sets up Tauri, registers commands, Linux camera permission
    ├── commands.rs     functions React can call
    ├── engine.rs       background thread running the round clock
    ├── leaderboard.rs  SQLite
    ├── game/           modes and the round state machine
    └── phone/          phone cameras: rooms, HTTPS server, addresses, tunnel
```

## Modules

Every `.rs` file is a **module**. `lib.rs` declares them with `pub mod game;`,
and a folder module has a `mod.rs` that declares its children. You import
with `use`: `use crate::game::RoundMode;` (`crate` = this project's root).
`pub` makes something visible outside its module; without it, it's private.

## Variables, mutability, types

```rust
let count = 0;        // immutable by default
let mut count = 0;    // `mut` to allow changes
count += 1;
let ms: i64 = 3_000;  // i64 = signed 64-bit, u32 = unsigned 32-bit, f32 = float
```

## Structs, enums and `impl`

A **struct** groups data (like a TS interface + class):

```rust
pub struct Lights { pub depth: bool, pub torso: bool, pub lockout: bool }
```

An **enum** is one of several variants, and variants can carry data
(like a TypeScript discriminated union):

```rust
pub enum EngineCommand {
    StartRound { mode: RoundMode, player: String },
    CancelRound,
    SetReady(bool),
    ReportRep(RepReport),
}
```

Methods go in an `impl` block. `&self` borrows the value read-only,
`&mut self` lets the method change it:

```rust
impl Session {
    pub fn is_active(&self) -> bool { ... }
    pub fn tick(&mut self, now: i64) -> Option<RoundResult> { ... }
}
```

## `match`

`match` is a `switch` the compiler checks for completeness: forget a variant
and it won't compile. See `Engine::handle` in `engine.rs`, which matches on
`EngineCommand`, and `Session::tick` in `game/session.rs`, which matches on
the round phase.

## No null: `Option`; no exceptions: `Result`

* `Option<T>` is either `Some(value)` or `None`. `remaining_ms: Option<i64>`
  is `None` when no clock is running. You must handle both cases.
* `Result<T, E>` is either `Ok(value)` or `Err(error)`. Functions that can
  fail return it. The `?` operator means "if this is an error, return it
  from my function now". Tauri commands returning `Err(String)` arrive in
  TypeScript as a rejected promise (see `validate_name` in `leaderboard.rs`).

## Ownership and borrowing (the famous part)

Every value has exactly **one owner**. When the owner goes out of scope the
value is freed: no garbage collector, no manual `free`.

* Passing `x` **moves** it (the old variable can't be used any more).
* Passing `&x` **borrows** it read-only; `&mut x` borrows it to modify.
  You may have many `&` borrows *or* one `&mut` borrow at a time, never both.
* `.clone()` makes an explicit copy when you need two owners.

If the compiler complains about "borrowed" or "moved" values, it is
enforcing these rules; it's preventing a bug, not being difficult.

## Traits

A **trait** is an interface. You mostly meet them through `#[derive(...)]`:
`#[derive(Serialize, Deserialize, Clone, Debug)]` auto-implements common
traits. `Serialize` (from the `serde` crate) turns a Rust struct into JSON
for the frontend. `#[serde(rename_all = "camelCase")]` turns `no_reps` into
`noReps` so it looks natural in TypeScript.

`Box<dyn Fn(Value) + Send + Sync>` (in `phone/mod.rs`, `HostLink`) means
"some function, decided at run time, that is safe to call from other
threads". It is how a pairing room sends messages to the app window.

## Threads and sharing

The engine runs on its own thread (`std::thread::Builder` in `engine.rs`) so
the round clock never waits for the UI. Commands talk to it through a
**channel** (`mpsc::Sender` / `Receiver`), a thread-safe queue.

Data used from several threads is wrapped as `Arc<Mutex<T>>`:
`Arc` = shared ownership across threads, `Mutex` = one thread at a time.
`db.lock().unwrap()` takes the lock; it is released automatically at the end
of the scope.

The phone server is **async** (`tokio`, `axum`): one thread can wait on many
network requests at once. `async fn` and `.await` mark the places where it
waits. `open_crowd_window` is an `async` command for a different reason:
on Windows, building a window inside a sync command deadlocks the app.

## How Tauri connects Rust and React

* **Commands** (`commands.rs`): a Rust function marked `#[tauri::command]`
  and listed in `generate_handler![...]` in `lib.rs` can be called from
  TypeScript with `invoke("get_leaderboard", { mode, limit })`.
  All of those calls are wrapped in `frontend/src/api/backend.ts`.
* **Events** (`engine.rs`): Rust calls `app.emit("tick", payload)`; React
  subscribes with `listen("tick", ...)`. `tick` arrives about 10 times a
  second during a round, `rep` per judged rep, `round-finished` at the
  buzzer.
* **Channels** (`phone_open`): a `Channel<T>` argument lets Rust stream
  messages or raw bytes to one caller. The phone relay uses it for JPEG
  frames.
* **State**: `app.manage(AppState { ... })` stores shared data, and commands
  receive it as a `State<AppState>` argument.
* The TypeScript types in `frontend/src/api/types.ts` mirror the Rust
  structs. Change one, change the other.

## Tests

Tests sit at the bottom of a file inside `#[cfg(test)] mod tests { ... }`,
each marked `#[test]`. `cargo test` runs them all. Look at
`game/session.rs` (a whole round played with made-up times) and
`leaderboard.rs` for examples.

## `unsafe` and FFI

This project doesn't use it, but you may meet it elsewhere: calling C/C++ code is done with an
`extern "C" { ... }` block and requires `unsafe { ... }` around each call,
because the compiler can't check the C++ side. Keep that code small and
wrap it in a safe struct.

## Reading compiler errors

Rust's error messages are long but precise: read the first error, look at
the `-->` file and line, and read the `help:` line — it often contains the
exact fix.
