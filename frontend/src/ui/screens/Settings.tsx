import { CONFIG_FIELDS, useSettings } from "../../logic/useSettings";
import { useKeys } from "../../logic/useKeys";
import { KeyHints } from "../components/KeyHints";
import { PhoneLinkPanel } from "../components/PhoneLinkPanel";

/** Camera picker, phone QR link and referee thresholds. */
export function Settings({ onBack }: { onBack: () => void }) {
  const settings = useSettings();
  useKeys({ Escape: onBack });

  return (
    <div className="panel sketch settings">
      <p className="eyebrow">Operator</p>
      <h2>Camera</h2>
      <div className="seg" role="group" aria-label="Camera">
        {settings.sources.map((s) => (
          <button
            key={s.label}
            type="button"
            className={`seg__btn sketch ${settings.isCurrent(s.spec) ? "is-on" : ""}`}
            onClick={() => settings.pickSource(s.spec)}
          >
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
      {settings.message && <p className="message">{settings.message}</p>}
      <div className="players__foot">
        <button type="button" className="start-btn sketch" disabled={!settings.config} onClick={settings.applyConfig}>
          Apply thresholds
        </button>
        <KeyHints hints={[["Esc", "Back", onBack]]} />
      </div>
    </div>
  );
}
