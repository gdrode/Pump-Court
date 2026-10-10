# Rust in this project: a first-timer's guide

> 💡 **Notice for AI Agents and Developers**: This guide has been incorporated into the comprehensive documentation suite. See the full feature documentation in [`docs/features/developer-guides/rust-backend-guide.md`](features/developer-guides/rust-backend-guide.md) and [`docs/features/developer-guides/`](features/developer-guides/README.md).

This is a tour of the Rust ideas you'll meet in `backend/`, using the
project's own code as examples.

## Cargo, crates and the folder layout

* **Cargo** is Rust's build tool and package manager (like npm).
* `backend/Cargo.toml` is the `package.json`: name, version, and
  `[dependencies]` (called **crates**). `Cargo.lock` pins exact versions.
* `cargo build` compiles, `cargo test` runs tests, `cargo run` runs.
  `cargo tauri dev` is the Tauri CLI plugged into Cargo.
* Build output goes to `backend/target/` (ignored by git).
* `build.rs` is a **build script**: Rust code Cargo runs *before* compiling
  the app. Tauri uses it to generate code; it is also where native libraries
  get linked.

```
backend/
├── Cargo.toml          dependencies
├── build.rs            runs before compiling
├── tauri.conf.json     window size, app name, where the frontend lives
├── capabilities/       which windows may call which Tauri APIs
└── src/
    ├── main.rs         entry point; just calls lib.rs
    ├── lib.rs          sets up Tauri, registers commands
    ├── commands.rs     functions React can call
    ├── engine.rs       background thread running the live pipeline
    ├── leaderboard.rs  SQLite
    ├── pose/           where landmarks come from (mock now, tracker later)
    ├── judge/          angles, ready check, rep tracker, referees
    └── game/           modes and the round state machine
```

## Modules

Every `.rs` file is a **module**. `lib.rs` declares them with `pub mod judge;`,
and a folder module has a `mod.rs` that declares its children. You import
with `use`: `use crate::judge::JudgeConfig;` (`crate` = this project's root).
`pub` makes something visible outside its module; without it, it's private.

## Variables, mutability, types

```rust
let count = 0;        // immutable by default
let mut count = 0;    // `mut` to allow changes
count += 1;
let angle: f32 = 90.0; // f32 = 32-bit float, u32 = unsigned int, i64 = signed 64-bit
```

## Structs, enums and `impl`

A **struct** groups data (like a TS interface + class):

```rust
pub struct Landmark { pub x: f32, pub y: f32, pub z: f32, pub visibility: f32 }
```

An **enum** is one of several variants, and variants can carry data
(like a TypeScript discriminated union):

```rust
pub enum SourceSpec { Mock, Camera { index: u32 }, File { path: String } }
```

Methods go in an `impl` block. `&self` borrows the value read-only,
`&mut self` lets the method change it:

```rust
impl RepTracker {
    pub fn attempts(&self) -> u32 { self.attempts }
    pub fn update(&mut self, a: &BodyAngles, t_ms: i64) -> Option<RepVerdict> { ... }
}
```

## `match`

`match` is a `switch` the compiler checks for completeness: forget a variant
and it won't compile. See `Session::update` in `game/session.rs`, which
matches on the round phase.

## No null: `Option`; no exceptions: `Result`

* `Option<T>` is either `Some(value)` or `None`. `landmarks: Option<Vec<Landmark>>`
  is `None` when nobody is in frame. You must handle both cases.
* `Result<T, E>` is either `Ok(value)` or `Err(error)`. Functions that can
  fail return it. The `?` operator means "if this is an error, return it
  from my function now". Tauri commands returning `Err(String)` arrive in
  TypeScript as a rejected promise.

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

A **trait** is an interface. `PoseSource` in `pose/mod.rs` is the key one:
anything with a `next_frame` method can feed the game. `Box<dyn PoseSource>`
means "some type that implements PoseSource, decided at run time" — that's
how the mock and the real tracker are interchangeable.

`#[derive(Serialize, Deserialize, Clone, Debug)]` auto-implements common
traits. `Serialize` (from the `serde` crate) is what turns a Rust struct into
JSON for the frontend. `#[serde(rename_all = "camelCase")]` turns
`clean_reps` into `cleanReps` so it looks natural in TypeScript.

## Threads and sharing

The engine runs on its own thread (`std::thread::spawn` in `engine.rs`) so
the camera loop never blocks the UI. Commands talk to it through a
**channel** (`mpsc::Sender` / `Receiver`) — a thread-safe queue.

Data used from several threads is wrapped as `Arc<Mutex<T>>`:
`Arc` = shared ownership across threads, `Mutex` = one thread at a time.
`db.lock().unwrap()` takes the lock; it is released automatically at the end
of the scope.

## How Tauri connects Rust and React

* **Commands** (`commands.rs`): a Rust function marked `#[tauri::command]`
  and listed in `generate_handler![...]` in `lib.rs` can be called from
  TypeScript with `invoke("get_leaderboard", { category, includeTeam, limit })`.
  All of those calls are wrapped in `frontend/src/api/backend.ts`.
* **Events** (`engine.rs`): Rust calls `app.emit("tick", payload)`; React
  subscribes with `listen("tick", ...)`. `tick` arrives every frame, `rep`
  per judged rep, `round-finished` at the buzzer.
* **State**: `app.manage(AppState { ... })` stores shared data, and commands
  receive it as a `State<AppState>` argument.
* The TypeScript types in `frontend/src/api/types.ts` mirror the Rust
  structs. Change one, change the other.

## Tests

Tests sit at the bottom of a file inside `#[cfg(test)] mod tests { ... }`,
each marked `#[test]`. `cargo test` runs them all. Look at
`judge/tracker.rs` for examples, and add a test whenever you tune a rule.

## `unsafe` and FFI

This project doesn't use it, but you may meet it elsewhere: calling C/C++ code is done with an
`extern "C" { ... }` block and requires `unsafe { ... }` around each call,
because the compiler can't check the C++ side. Keep that code small and
wrap it in a safe struct.

## Reading compiler errors

Rust's error messages are long but precise: read the first error, look at
the `-->` file and line, and read the `help:` line — it often contains the
exact fix.
