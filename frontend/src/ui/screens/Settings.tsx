import { CONFIG_FIELDS, useSettings } from "../../logic/useSettings";
import { useKeys } from "../../logic/useKeys";
import { PhoneLinkPanel } from "../components/PhoneLinkPanel";

/** Camera picker and referee thresholds. */
export function Settings({ onBack }: { onBack: () => void }) {
  const settings = useSettings();
  useKeys({ Escape: onBack });

  return (
    <div className="screen settings">
      <h2>Camera</h2>
      <div className="row wrap">
        {settings.sources.map((s) => (
          <button key={s.label} className={settings.isCurrent(s.spec) ? "active" : ""} onClick={() => settings.pickSource(s.spec)}>
            {s.label}
          </button>
        ))}
      </div>

      <h2>Phone camera</h2>
      <PhoneLinkPanel usingPhone={settings.isCurrent({ kind: "phone" })} onUsePhone={() => settings.pickSource({ kind: "phone" })} />

      <h2>Referee thresholds</h2>
      {settings.config && (
        <div className="config-grid">
          {CONFIG_FIELDS.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type="number"
                step={f.step ?? 1}
                value={settings.config![f.key]}
                onChange={(e) => settings.setConfigField(f.key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}
      <div className="row">
        <button className="primary" disabled={!settings.config} onClick={settings.applyConfig}>Apply thresholds</button>
        <button onClick={onBack}>Back (Esc)</button>
      </div>
      {settings.message && <p className="muted">{settings.message}</p>}
    </div>
  );
}
