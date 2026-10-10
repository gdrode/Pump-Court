// Setup: single player or co-op, the game mode, and a camera for each player.
import { MODES, type Mode, type Players } from './game'
import type { SourceKey } from './useLane'

export interface CameraOption {
  key: SourceKey
  label: string
}

interface Props {
  players: Players
  onPlayers(p: Players): void
  mode: Mode
  onMode(m: Mode): void
  sources: (SourceKey | null)[]
  onSource(player: number, key: SourceKey | null): void
  options: CameraOption[]
  onAddCamera(player: number): void
  onDisconnect(player: number): void
  /** The player's camera is a paired phone (so it can be disconnected). */
  isPhone(player: number): boolean
  /** Why Start is disabled, or null when ready to go. */
  blocker: string | null
  onStart(): void
}

export function Setup(p: Props) {
  return (
    <section className="card setup">
      <div className="setup-step">
        <h2>1 · Players</h2>
        <div className="choice-row">
          <Choice on={p.players === 1} onClick={() => p.onPlayers(1)} title="Single player" note="One camera" />
          <Choice on={p.players === 2} onClick={() => p.onPlayers(2)} title="Co-op" note="Two players, two cameras" />
        </div>
      </div>

      <div className="setup-step">
        <h2>2 · Game mode</h2>
        <div className="choice-row">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <Choice key={m} on={p.mode === m} onClick={() => p.onMode(m)} title={MODES[m].label} note={MODES[m].blurb} />
          ))}
        </div>
      </div>

      <div className="setup-step">
        <h2>3 · Camera{p.players > 1 ? 's' : ''}</h2>
        <div className="camera-pickers">
          {Array.from({ length: p.players }, (_, i) => (
            <div key={i} className="camera-picker">
              <label className="num">
                Player {i + 1}
                <select value={p.sources[i] ?? ''} onChange={(e) => p.onSource(i, (e.target.value || null) as SourceKey | null)}>
                  <option value="">{i === 0 ? 'Default camera' : 'Choose a camera…'}</option>
                  {p.options.map((o) => (
                    <option key={o.key} value={o.key} disabled={p.sources.some((s, j) => j !== i && j < p.players && s === o.key)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => p.onAddCamera(i)}>+ Add camera</button>
              {p.isPhone(i) && <button className="small" onClick={() => p.onDisconnect(i)}>Disconnect phone</button>}
            </div>
          ))}
        </div>
      </div>

      <div className="setup-go">
        <button className="big start" disabled={!!p.blocker} onClick={p.onStart}>▶ Start {MODES[p.mode].label}</button>
        <p className="hint">{p.blocker ?? 'The countdown starts once every player is in the push-up position. Judged on Hard.'}</p>
      </div>
    </section>
  )
}

function Choice({ on, onClick, title, note }: { on: boolean; onClick(): void; title: string; note: string }) {
  return (
    <button className={`choice ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>
      <b>{title}</b>
      <span>{note}</span>
    </button>
  )
}
