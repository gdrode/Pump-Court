# Frontend structure: swapping in a new design

> 💡 **Notice for AI Agents and Developers**: This guide has been incorporated into the comprehensive documentation suite. See the full feature documentation in [`docs/features/frontend-ui/`](features/frontend-ui/README.md), including [State & Hooks](features/frontend-ui/state-and-hooks.md), [Crowd Display Synchronization](features/frontend-ui/crowd-display-sync.md), and [Styling & Design Tokens](features/frontend-ui/styling-and-tokens.md).

The frontend is split so that the **look** can be replaced without touching
the **game logic**. The current screens are a working placeholder UI.

```
frontend/src/
├── api/        Contract with the Rust backend.          Don't redesign — keep.
│   ├── backend.ts   every invoke()/listen() call
│   └── types.ts     TypeScript mirrors of the Rust structs
├── logic/      All state, backend calls and flow.       Keep; reuse from any UI.
│   ├── useGameFlow.ts   which screen is showing + actions to move between them
│   ├── useRound.ts      a live round: timer, count, lights, ready check, cancel
│   ├── useNameEntry.ts  names, team flag, validation, submit
│   ├── results.ts       results summary (latest turn, duel winner, next player)
│   ├── useLeaderboard.ts  tabs, rows, delete, backup
│   ├── useCrowd.ts      crowd screen: live round, boards or recent results
│   ├── useCrowdControl.ts  operator: what the crowd screen shows
│   ├── usePhoneLink.ts  phone camera QR code and connection status
│   ├── useSettings.ts   camera picker, referee thresholds
│   ├── useKeys.ts       keyboard shortcuts helper
│   └── events.ts        backend event subscriptions (useTick, useBackendEvent)
├── config/
│   └── modes.ts    Menu modes, titles, blurbs, key bindings, tab names.  Edit freely.
├── ui/         The design. Replace freely.
│   ├── screens/    one component per screen
│   ├── components/ PoseView (video + skeleton), RefereeLights, ReadyChecklist, LeaderboardTable,
│   │               RecentTable, CrowdViewPicker, PhoneLinkPanel
│   └── sounds.ts   placeholder beeps
├── theme/
│   ├── tokens.css  every colour, font, radius and key size
│   └── styles.css  layout, using only the tokens
└── App.tsx     Maps each flow state to a screen component.
```

**Rule of thumb:** files in `ui/` and `theme/` only *display* things and call
the functions the hooks give them. They never call the backend directly.

## Three levels of change

1. **Restyle:** edit `theme/tokens.css` (colours, fonts, light sizes, big
   number sizes). The skeleton colours on the video come from here too.
   For layout changes, edit `theme/styles.css`.
2. **Redesign a screen:** rewrite a file in `ui/screens/`. Keep its props,
   call the same hook, and lay out the data however you like. For example, a
   new round screen is:

   ```tsx
   const round = useRound({ mode, player, isTeam, onFinished, onCancel });
   // round.cleanReps, round.remainingMs, round.lastRep, round.readyItems,
   // round.countdownSeconds, round.trackingLost, round.tick, round.cancel()
   ```
3. **Replace the whole UI:** build your components however you want (any
   CSS approach or component library), then point the imports in `App.tsx` at
   them. `useGameFlow()` tells you which screen to show and gives you the
   actions (`pickMode`, `start`, `finishRound`, `nextTurn`, `playAgain`,
   `home`, `leaderboard`, `settings`, `openCrowd`).

## What each screen gets

| Screen | Hook | Main data | Actions |
| --- | --- | --- | --- |
| Home | `MENU_MODES` from config | modes, keys | `onPick`, `onLeaderboard`, `onSettings`, `onCrowd` |
| Name entry | `useNameEntry` | `names`, `isTeam`, `error` | `setName`, `setIsTeam`, `submit` |
| Round | `useRound` | `phase`, `readyItems`, `countdownSeconds`, `cleanReps`, `attempts`, `remainingMs`, `idleRemainingMs`, `lastRep`, `trackingLost`, `tick` | `cancel`; optional `onRep`, `onCountdown`, `onGo` callbacks for sound and animation |
| Results | `summarizeResults` | `latest`, `all`, `nextPlayer`, `duelWinner` | `onNext`, `onAgain`, `onLeaderboard`, `onHome` |
| Leaderboard | `useLeaderboard` | `category`, `rows`, `includeTeam`, `message` | `setCategory`, `setIncludeTeam`, `remove`, `exportBackup` |
| Crowd | `useCrowd` | `live`, `round` (incl. `modeLabel`), `view`, `page` (a board or recent), `rows`, `leader`, `recent`, `playerCount` | `setView` (keys 1–3, R, A) |
| Crowd control (operator) | `useCrowdControl` | `view` | `setView`, `isActive`, `openWindow` |
| Settings | `useSettings` | `sources`, `config`, `message` | `pickSource`, `setConfigField`, `applyConfig` |
| Phone camera panel | `usePhoneLink` | `link` (`url`, `code`, `qrSvg`), `status` (`connected`, `fps`, size), `error` | `newCode` |

`lastRep.lights` is always `[depth, lockout, plank]`, each with `pass`,
`measured` and `needed`; `lastRep.reasons` has ready-made text like
"Depth: 104°, needed 90°".

## Tips

* `PoseView` draws the camera preview and skeleton on a canvas. Reuse it
  even if you redesign everything around it.
* `useKeys({ Enter: ..., Escape: ... })` gives a screen its keyboard
  shortcuts and stops the key typing into the next screen's input.
* Add a new mode label or change a key in `config/modes.ts`, not in a screen.
* The crowd window is the same app loaded at `#/crowd` (see `App.tsx`).
* Crowd pages (the three boards and Recent) are listed in `CROWD_PAGES` in
  `config/modes.ts`; add a page there and render it in the crowd screen.
* `CrowdView` is stored in the backend and broadcast to every window, so the
  operator's buttons and the crowd window's keys always agree.
