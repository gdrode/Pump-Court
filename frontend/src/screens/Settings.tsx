import { useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { JudgeConfig, SourceInfo, SourceSpec } from "../api/types";

export const SOURCE_KEY = "pumpCourt.source";

export function savedSource(): SourceSpec {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (raw) return JSON.parse(raw) as SourceSpec;
  } catch {
    /* ignore */
  }
  return { kind: "mock" };
}

const FIELDS: { key: keyof JudgeConfig; label: string; step?: number }[] = [
  { key: "depthMaxElbow", label: "Depth: elbow ≤ (°)" },
  { key: "lockoutMinElbow", label: "Lockout: elbow ≥ (°)" },
  { key: "plankMinHip", label: "Plank: hip ≥ (°)" },
  { key: "plankMinKnee", label: "Plank: knee ≥ (°)" },
  { key: "topExitMargin", label: "Leave-top margin (°)" },
  { key: "minAttemptDrop", label: "Ignore dips smaller than (°)" },
  { key: "confirmFrames", label: "Confirm frames" },
  { key: "smoothingAlpha", label: "Smoothing alpha (1 = none)", step: 0.05 },
  { key: "minVisibility", label: "Min landmark visibility", step: 0.05 },
  { key: "trackingLossMs", label: "Void after tracking loss (ms)" },
  { key: "minFps", label: "Min frame rate" },
];

/** Camera picker and referee thresholds. */
export function Settings({ onBack }: { onBack: () => void }) {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [current, setCurrent] = useState(JSON.stringify(savedSource()));
  const [path, setPath] = useState("");
  const [config, setConfig] = useState<JudgeConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    backend.listSources().then(setSources);
    backend.getJudgeConfig().then(setConfig);
  }, []);

  async function pickSource(spec: SourceSpec) {
    try {
      await backend.startSource(spec);
      localStorage.setItem(SOURCE_KEY, JSON.stringify(spec));
      setCurrent(JSON.stringify(spec));
      setMessage(null);
    } catch (e) {
      setMessage(errorText(e));
    }
  }

  return (
    <div className="screen settings">
      <h2>Camera</h2>
      <div className="row wrap">
        {sources.map((s) => (
          <button
            key={s.label}
            className={JSON.stringify(s.spec) === current ? "active" : ""}
            onClick={() => pickSource(s.spec)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="row">
        <input placeholder="Path to a recorded clip" value={path} onChange={(e) => setPath(e.target.value)} />
        <button disabled={!path} onClick={() => pickSource({ kind: "file", path })}>Play clip</button>
      </div>

      <h2>Referee thresholds</h2>
      {config && (
        <div className="config-grid">
          {FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                step={f.step ?? 1}
                value={config[f.key]}
                onChange={(e) => setConfig({ ...config, [f.key]: Number(e.target.value) })}
              />
            </label>
          ))}
        </div>
      )}
      <div className="row">
        <button
          className="primary"
          disabled={!config}
          onClick={() => config && backend.setJudgeConfig(config).then(() => setMessage("Saved — applies from the next round"))}
        >
          Apply thresholds
        </button>
        <button onClick={onBack}>Back</button>
      </div>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}
