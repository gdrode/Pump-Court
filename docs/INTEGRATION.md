# Plugging in the motion tracker

The MediaPipe C++ Pose Landmarker tracker is being built separately. The
backend is written so it plugs in at **one place**: `backend/src/pose/`.
Nothing else (referees, rounds, leaderboard, UI) needs to change.

## The contract

Each frame, the tracker must give the backend a `PoseFrame`
(`backend/src/pose/mod.rs`):

| Field | Meaning |
| --- | --- |
| `timestamp_ms` | ms since the source started; must increase every frame |
| `width`, `height` | image size in pixels (angles are measured in pixels, so this matters) |
| `landmarks` | `Some(vec of 33 Landmark)` for the tracked person, or `None` if nobody was found |
| `preview_jpeg` | optional JPEG bytes of the camera image, drawn behind the skeleton |

A `Landmark` is `{ x, y, z, visibility }`, exactly MediaPipe's
`NormalizedLandmark` (`x`/`y` normalised 0..1, `visibility` 0..1) in
MediaPipe's standard 33-point order. Run the landmarker with `num_poses = 1`
and the `VIDEO` (or `LIVE_STREAM`) running mode. Ask the camera for 60 fps
where possible; the ready check needs at least 24.

The tracker is wrapped in anything that implements:

```rust
pub trait PoseSource: Send {
    /// Block until the next frame is ready.
    fn next_frame(&mut self) -> Result<PoseFrame, String>;
}
```

The engine thread calls `next_frame` in a loop, so the call should block until
a frame is available (a camera read naturally does).

## Steps

1. Add a file such as `backend/src/pose/tracker.rs` with a struct that
   implements `PoseSource`, and `pub mod tracker;` in `pose/mod.rs`.
2. In `pose/mod.rs`, fill in the two `TODO(tracker)` spots:
   * `list_sources()` – add one `SourceInfo` per camera.
   * `open_source()` – return `Box::new(tracker::YourSource::open(...)?)` for
     `SourceSpec::Camera { index }` and `SourceSpec::File { path }`.
3. Link the tracker (see options below) and run `cargo tauri dev`. The camera
   picker (key **S**) will show the cameras; the mock stays available as a
   fallback.

## Linking options

Pick whichever matches how the tracker is built.

**A. C/C++ library (recommended).** Expose a small `extern "C"` API from the
tracker, e.g.

```c
typedef struct Tracker Tracker;
Tracker* tracker_open(const char* model_path, const char* source /* "0" or a file path */);
int      tracker_next(Tracker*, PcFrame* out);   /* 0 = ok */
void     tracker_close(Tracker*);
```

then in Rust declare it in an `extern "C" { ... }` block with matching
`#[repr(C)]` structs, wrap the raw pointer in a struct that implements
`PoseSource` and `Drop` (which calls `tracker_close`). Tell Cargo where the
library is from `backend/build.rs`:

```rust
println!("cargo:rustc-link-search=native=/path/to/tracker/lib");
println!("cargo:rustc-link-lib=dylib=tracker");
```

MediaPipe's C++ build uses Bazel; build the tracker as a shared library
(`cc_binary(name = "libtracker.so", linkshared = 1, ...)`) and ship the
library and the `.task` model file next to the app.

**B. Separate process.** If the tracker stays its own executable, have it
write one JSON line per frame to stdout (or a local socket), and write a
`PoseSource` that spawns it with `std::process::Command` and parses each line
with `serde_json`. Slightly more latency, but no linking at all.

## If the tracker already judges reps

The referees live in `backend/src/judge/`. If the tracker ends up producing
its own angles or rep calls, the `Session` in `backend/src/game/session.rs` is
the place to consume them instead.
