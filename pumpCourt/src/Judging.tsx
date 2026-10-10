// Game UI: each player's stage (video, skeleton, three lights, counters), the
// clock and 3-2-1, and the results. All the rules live in judge.ts and game.ts.
import type { ReactNode, RefObject } from 'react'
import { clock, FINISH_TEXT, formatClock, goodReps, MODES, type GameState, type PlayerState } from './game'
import { LIGHT_LABEL, LIGHTS, summarise, type Light, type LightState, type RepResult, type SessionSummary } from './judge'

export function Lights({ states, flash }: { states: Record<Light, LightState>; flash: number }) {
  return (
    <div className="lights" role="status" aria-live="polite">
      {LIGHTS.map((l) => (
        <div key={l} className="light-wrap">
          {/* key on flash restarts the pop animation for every rep */}
          <div key={flash} className={`light ${states[l]}`} aria-label={`${LIGHT_LABEL[l]}: ${states[l] === 'off' ? 'waiting' : states[l] === 'white' ? 'good' : 'no'}`} />
          <span>{LIGHT_LABEL[l]}</span>
        </div>
      ))}
    </div>
  )
}

interface StageProps {
  label: string
  videoRef: RefObject<HTMLVideoElement | null>
  canvasRef: RefObject<HTMLCanvasElement | null>
  /** Rotated picture, shown instead of the video when `rotated`. */
  frameRef: RefObject<HTMLCanvasElement | null>
  rotated: boolean
  /** Width / height of the picture, so the stage takes its shape (landscape or portrait). */
  aspect: number
  /** Optional control shown on the stage (e.g. the rotate button during setup). */
  control?: ReactNode
  lights: Record<Light, LightState>
  flash: number
  /** Shown over the video: posture prompts, countdown, finish reason. */
  banner: ReactNode
  bannerKind: 'info' | 'ready' | 'big' | 'done' | 'warn' | null
  player: PlayerState | null
  noCamera: string | null
  winner?: boolean
}

/** One player's camera with the lights and their score. */
export function PlayerStage(p: StageProps) {
  const good = p.player ? goodReps(p.player) : 0
  const perfect = p.player ? p.player.results.filter((r) => r.perfect).length : 0
  const noRep = p.player ? p.player.results.length - good : 0
  return (
    <section className={`player ${p.winner ? 'winner' : ''}`}>
      <div className="stage" style={{ aspectRatio: String(p.aspect) }}>
        <video ref={p.videoRef} autoPlay playsInline muted hidden={p.rotated} />
        <canvas ref={p.frameRef} className="frame" hidden={!p.rotated} />
        <canvas ref={p.canvasRef} />
        {p.control}
        <Lights states={p.lights} flash={p.flash} />
        <span className="player-tag">{p.label}{p.winner ? ' 🏆' : ''}</span>
        {p.noCamera && <div className="no-camera">{p.noCamera}</div>}
        {p.banner && <div className={`banner ${p.bannerKind ?? 'info'}`}>{p.banner}</div>}
      </div>
      {p.player && <div className="score-row">
        <div className="score main"><b>{good}</b><span>Push-ups</span></div>
        <div className="score"><b>{perfect}</b><span>Perfect</span></div>
        <div className="score"><b>{noRep}</b><span>No rep</span></div>
      </div>}
    </section>
  )
}

/** Mode, clock and Stop, above the stages. */
export function GameBar({ game, now, onStop, onBack }: { game: GameState; now: number; onStop(): void; onBack(): void }) {
  const m = MODES[game.mode]
  const timed = m.durationMs != null
  const ms = clock(game, now)
  const low = timed && game.phase === 'running' && ms <= 5000
  return (
    <div className="game-bar">
      <span className="game-mode">{m.label}{game.players.length > 1 ? ' · Co-op' : ''} · Hard</span>
      <span className={`game-clock ${low ? 'low' : ''}`} aria-live="off">{formatClock(ms, timed)}</span>
      {game.phase === 'finished'
        ? <button onClick={onBack}>Change setup</button>
        : <button className="stop" onClick={onStop}>■ Stop</button>}
    </div>
  )
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

/** End-of-round results: one card per player, the winner in co-op, and play again. */
export function Results({ game, winner, onAgain, onBack }: { game: GameState; winner: number | null; onAgain(): void; onBack(): void }) {
  const dur = (game.endT ?? 0) - (game.startT ?? game.endT ?? 0)
  const team = game.players.reduce((n, p) => n + goodReps(p), 0)
  return (
    <section className="card results">
      <header className="report-head">
        <h2>{MODES[game.mode].label} results{game.players.length > 1 ? ` · team total ${team}` : ''}</h2>
        <div className="row">
          <button className="start" onClick={onAgain}>↻ Play again</button>
          <button onClick={onBack}>Change setup</button>
        </div>
      </header>
      {game.players.length > 1 && (
        <p className="winner-line">{winner == null ? 'It’s a tie!' : `Player ${winner + 1} wins!`}</p>
      )}
      <div className="results-grid">
        {game.players.map((p, i) => (
          <PlayerReport key={i} title={`Player ${i + 1}`} player={p} summary={summarise(p.results, dur)} />
        ))}
      </div>
    </section>
  )
}

function PlayerReport({ title, player, summary }: { title: string; player: PlayerState; summary: SessionSummary }) {
  return (
    <div className="player-report">
      <h3>{title} · {player.finished ? FINISH_TEXT[player.finished] : ''}</h3>
      <div className="metrics">
        <Metric label="Push-ups" value={String(summary.counted)} note={`${summary.attempted} attempted`} />
        <Metric label="Perfect" value={String(summary.perfect)} note={summary.attempted ? `${pct(summary.perfect / summary.attempted)} of attempts` : ''} />
        <Metric label="Accuracy" value={pct(summary.accuracy)} note={`${summary.counted} of ${summary.attempted} counted`} />
      </div>
      {summary.attempted > 0 && <RepDetails summary={summary} results={player.results} />}
    </div>
  )
}

function RepDetails({ summary, results }: { summary: SessionSummary; results: RepResult[] }) {
  return (
    <>
      <div className="light-rates">
        {LIGHTS.map((l) => (
          <div key={l} className="rate">
            <span>{LIGHT_LABEL[l]}</span>
            <div className="rate-bar"><div style={{ width: pct(summary.lightRates[l]) }} /></div>
            <b>{pct(summary.lightRates[l])}</b>
          </div>
        ))}
      </div>
      <details>
        <summary>Every rep</summary>
        <div className="table-scroll">
          <table className="reps">
            <thead>
              <tr><th>Rep</th><th>Lights</th><th>Result</th><th>Why</th></tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td className="mini-lights">
                    {LIGHTS.map((l) => <span key={l} className={r.lights[l] ? 'white' : 'red'} title={LIGHT_LABEL[l]} />)}
                  </td>
                  <td className={r.counted ? 'ok' : 'low'}>{r.perfect ? '★ Perfect' : r.counted ? '✓ Counted' : '✗ No rep'}</td>
                  <td>{r.faults.join(' · ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

/** A replayed log's score (Diagnostics → Judge this log). */
export function SessionReport({ summary, results, title, onClose }: { summary: SessionSummary; results: RepResult[]; title: string; onClose(): void }) {
  return (
    <section className="card report">
      <header className="report-head">
        <h2>{title}</h2>
        <button className="small" onClick={onClose}>Dismiss</button>
      </header>
      <div className="metrics">
        <Metric label="Accuracy" value={pct(summary.accuracy)} note={`${summary.counted} of ${summary.attempted} counted`} />
        <Metric label="Perfect push-ups" value={String(summary.perfect)} note="" />
        <Metric label="Push-ups attempted" value={String(summary.attempted)} note={`${(summary.durationMs / 1000).toFixed(0)} s`} />
      </div>
      {summary.attempted > 0 && <RepDetails summary={summary} results={results} />}
    </section>
  )
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric">
      <span className="metric-l">{label}</span>
      <span className="metric-v">{value}</span>
      <span className="metric-n">{note}</span>
    </div>
  )
}

