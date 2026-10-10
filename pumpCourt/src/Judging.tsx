// Judging UI: the three referee lights over the camera, the counters and
// controls, and the summary after a session. All the rules live in judge.ts.
import { DIFFICULTY, LIGHT_LABEL, LIGHTS, type Difficulty, type Light, type LightState, type RepResult, type SessionSummary } from './judge'

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

interface PanelProps {
  judging: boolean
  canStart: boolean
  difficulty: Difficulty
  onDifficulty(d: Difficulty): void
  onStart(): void
  onStop(): void
  good: number
  perfect: number
  attempted: number
  lastFaults: string[] | null
  waitingReason: string | null
  /** While judging: whether the player is in position. Null when not judging. */
  inPosition: boolean | null
}

export function JudgePanel(p: PanelProps) {
  return (
    <aside className="judge-panel">
      <div className="counters">
        <div className="counter main">
          <span className="counter-n">{p.good}</span>
          <span className="counter-l">Push-ups</span>
        </div>
        <div className="counter">
          <span className="counter-n">{p.perfect}</span>
          <span className="counter-l">Perfect</span>
        </div>
        <div className="counter">
          <span className="counter-n">{p.attempted - p.good}</span>
          <span className="counter-l">No rep</span>
        </div>
      </div>

      {p.judging
        ? <button className="big stop" onClick={p.onStop}>■ Stop judging</button>
        : <button className="big start" onClick={p.onStart} disabled={!p.canStart}>▶ Start judging</button>}
      {p.inPosition != null && (
        <p className={`position ${p.inPosition ? 'ready' : ''}`} role="status">
          {p.inPosition ? '● Ready. Go!' : `○ ${p.waitingReason ?? 'Get into position'}`}
        </p>
      )}
      {p.inPosition == null && p.waitingReason && <p className="hint">{p.waitingReason}</p>}

      <fieldset className="difficulty" disabled={p.judging}>
        <legend>Difficulty</legend>
        <div className="segmented">
          {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
            <label key={d} className={p.difficulty === d ? 'on' : ''}>
              <input type="radio" name="difficulty" value={d} checked={p.difficulty === d} onChange={() => p.onDifficulty(d)} />
              {DIFFICULTY[d].label}
            </label>
          ))}
        </div>
        <p className="hint">{DIFFICULTY[p.difficulty].blurb}</p>
      </fieldset>

      {p.judging && p.lastFaults && p.lastFaults.length > 0 && (
        <ul className="faults">
          {p.lastFaults.map((f) => <li key={f}>{f}</li>)}
        </ul>
      )}
    </aside>
  )
}

const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v * 100)}%`)

export function SessionReport({ summary, results, difficulty, onClose }: {
  summary: SessionSummary
  results: RepResult[]
  difficulty: Difficulty
  onClose(): void
}) {
  return (
    <section className="card report">
      <header className="report-head">
        <h2>Session results · {DIFFICULTY[difficulty].label}</h2>
        <button className="small" onClick={onClose}>Dismiss</button>
      </header>
      <div className="metrics">
        <Metric label="Accuracy" value={pct(summary.accuracy)} note={`${summary.counted} of ${summary.attempted} counted`} />
        <Metric label="Perfect push-ups" value={String(summary.perfect)} note={summary.attempted ? `${pct(summary.perfect / summary.attempted)} of attempts` : ''} />
        <Metric label="Push-ups attempted" value={String(summary.attempted)} note={`${(summary.durationMs / 1000).toFixed(0)} s session`} />
      </div>
      {summary.attempted > 0 && (
        <>
          <h3>Lights given</h3>
          <div className="light-rates">
            {LIGHTS.map((l) => (
              <div key={l} className="rate">
                <span>{LIGHT_LABEL[l]}</span>
                <div className="rate-bar"><div style={{ width: pct(summary.lightRates[l]) }} /></div>
                <b>{pct(summary.lightRates[l])}</b>
              </div>
            ))}
          </div>
          <h3>Every rep</h3>
          <div className="table-scroll">
            <table className="reps">
              <thead>
                <tr><th>Rep</th><th>Lights</th><th>Result</th><th>Why</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.rep}>
                    <td>{r.rep}</td>
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
        </>
      )}
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
