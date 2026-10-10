# Frontend structure: swapping in a new design

> 💡 **Notice for AI Agents and Developers**: This guide is part of the documentation suite. See the full feature documentation in [`docs/features/frontend-ui/`](features/frontend-ui/README.md), including [State & Hooks](features/frontend-ui/state-and-hooks.md), [Crowd Display](features/frontend-ui/crowd-display-sync.md), and [Styling & Design Tokens](features/frontend-ui/styling-and-tokens.md).

The frontend is split so that the **look** can be replaced without touching
the **game logic**. The current screens are the team's sketchbook design with
the dragon host.

```
frontend/src/
├── api/        Contract with the Rust backend.          Don't redesign — keep.
│   ├── backend.ts   every invoke()/listen() call, isCrowdWindow()
│   └── types.ts     TypeScript mirrors of the Rust structs
├── logic/      All state, backend calls and flow.       Keep; reuse from any UI.
│   ├── tracker/
│   │   ├── TrackerProvider.tsx  camera, rotation, MediaPipe loop, posture; useTracker()
│   │   ├── phoneLink.ts         laptop side of a phone camera (WebRTC or relay)
│   │   └── usePhonePairing.ts   "Add camera" dialog logic: room, QR, tunnel
│   ├── useGameFlow.ts   which screen is showing + actions (post, discard, rematch…)
│   ├── useRound.ts      a live round: runs the referee, sends set_ready/report_rep
│   ├── useNameEntry.ts  one name, or two for a Duel (backend has the final say)
│   ├── results.ts       Duel winner ("most push-ups, perfect breaks ties"), score to beat
│   ├── useLeaderboard.ts  tabs (All time, Sprint, Marathon, Max, Duel), delete, backup
│   ├── useBoardRecord.ts  the mode's record, shown during a round
│   ├── useCrowd.ts      crowd screen: live round or all-time board, new-score highlight
│   ├── useKeys.ts       keyboard shortcuts helper (ignores typing)
│   └── events.ts        backend event subscriptions (useBackendEvent, useSession)
├── config/
│   └── modes.ts    Menu modes, labels, keys, board tabs, REFEREE_RULES.  Edit freely.
├── ui/         The design (the team's sketchbook art). Replace freely.
│   ├── screens/    Home, Players, Round (ready check + countdown + round),
│   │               Results, DuelResult, Leaderboard, Crowd, Settings (the Camera screen)
│   ├── components/ CameraView (live camera + skeleton), AddCameraDialog, Dragon,
│   │               Lights, LeaderboardTable, KeyHints, SketchDefs
│   ├── host.ts     everything the dragon says
│   ├── hostMood.ts what the dragon does during a round (shared by Round and Crowd)
│   └── sounds.ts   mp3s from public/sounds/, synthesised tones until then
├── theme/
│   ├── tokens.css  every colour and the font
│   └── styles.css  layout and animations, using only the tokens
└── App.tsx     Picks the crowd screen or the operator screens.
```

**Rule of thumb:** files in `ui/` and `theme/` only *display* things and call
the functions the hooks give them. They never call the backend directly.

## Three levels of change

1. **Restyle:** edit `theme/tokens.css` (colours, font). For layout, edit
   `theme/styles.css`. The skeleton on the camera is drawn by the tracker
   (`pumpCourt/src/draw.ts`), not by the theme.
2. **Redesign a screen:** rewrite a file in `ui/screens/`. Keep its props,
   call the same hook, and lay out the data however you like. A new round
   screen is:

   ```tsx
   const round = useRound({ mode, player, onFinished });
   // round.phase, round.posture, round.countdownSeconds, round.reps,
   // round.perfect, round.remainingMs, round.failRemainingMs, round.lastRep,
   // round.lastRepAt, round.cancel()
   // and somewhere: <CameraView /> to show the camera and skeleton
   ```
3. **Replace the whole UI:** build your components however you want, then
   point the imports in `App.tsx` at them. Keep `<TrackerProvider>` around the
   operator screens. `useGameFlow()` tells you which screen to show and gives
   you the actions (`pickMode`, `start`, `finishRound`, `post`, `discard`,
   `rematch`, `home`, `leaderboard`, `settings`, `openCrowd`).

## What each screen gets

| Screen | Hook | Main data | Actions |
| --- | --- | --- | --- |
| Home | `MENU_MODES` from config | modes, keys | `onPick`, `onLeaderboard`, `onSettings`, `onCrowd` |
| Players | `useNameEntry` | `names`, `multi`, `active`, `error`, `maxLength` | `setName`, `setActive`, `enter`, `start` |
| Round | `useRound` | `phase`, `posture`, `countdownSeconds`, `reps`, `attempts`, `perfect`, `elapsedMs`, `remainingMs`, `failRemainingMs`, `lastRep`, `lastRepAt` | `cancel`; optional `onRep`, `onCountdown`, `onGo` callbacks for sound and animation |
| Results | `useScorePosts` (logic/scorePost.ts) | `result`, post status (`pending`/`posted`/`declined`…), `rank` once posted | `onNext(posted)`, `onDiscard` |
| Duel result | `duelOutcome` | `ranked`, `winner`, `decidedOnPerfect` | `onRematch`, `onDone` |
| Leaderboard | `useLeaderboard` | `mode` (`null` = all time), `rows`, `message` | `setMode`, `remove`, `exportBackup` |
| Crowd | `useCrowd` | `round` (live, or null), `rows`, `leader`, `playerCount`, `posted` | none (no keys) |
| Camera (Settings) | `useTracker` | `cameras`, `current`, `modelStatus`, `live.posture`, `live.poseFps`, `rotation`, `rotationAuto` | `choose`, `removePhone`, `refreshDevices`, `rotate`, `rotateAuto` |
| Add camera dialog | `useWifiPairing`, `useInternetPairing` | `url`, `qr`, `room`, `status`, `visit`, `lan`, `tunnel` | `setHost` |

`lastRep.lights` is `{ depth, torso, lockout }`, each `true` (white) or
`false` (red). `lastRep.faults` has ready-made text like
"No lockout: didn't get back to the top (elbows 141°, needs 155°)".

## Tips

* `<CameraView />` shows the shared camera video and skeleton. Only one
  `<video>` exists; the view borrows it. Detection only runs while a
  `CameraView` is on screen. `<CameraView rotatable />` adds the
  "90° auto" label, **⟳ Rotate** and **auto** buttons (the Camera screen
  always; the round screen until the clock runs).
* `useKeys({ Enter: ..., Escape: ... })` gives a screen its keyboard
  shortcuts and stops the key typing into the next screen's input.
* Add a mode label or change a key in `config/modes.ts`, not in a screen.
* The crowd window is the same app in a window labelled `crowd`
  (see `App.tsx` and `isCrowdWindow()`). In a plain browser, `#/crowd` does
  the same.
