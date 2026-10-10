import { useEffect, useState } from "react";
import { backend, errorText } from "../api/backend";
import type { JudgeConfig, SourceInfo, SourceSpec } from "../api/types";

const SOURCE_KEY = "pumpCourt.source";

/** The camera picked last time (remembered in this browser profile). */
export function savedSource(): SourceSpec {
  try {
    const raw = localStorage.getItem(SOURCE_KEY);
    if (raw) return JSON.parse(raw) as SourceSpec;
  } catch {
    /* ignore */
  }
  return { kind: "mock" };
}

/** Labels for the editable referee thresholds, in display order. */
export const CONFIG_FIELDS: { key: keyof JudgeConfig; label: string; step?: number }[] = [
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
export function useSettings() {
  const [sources, setSources] = useState<SourceInfo[]>([]);
  const [current, setCurrent] = useState<SourceSpec>(savedSource());
  const [config, setConfig] = useState<JudgeConfig | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    backend.listSources().then(setSources);
    backend.getJudgeConfig().then(setConfig);
  }, []);

  return {
    sources,
    isCurrent: (spec: SourceSpec) => JSON.stringify(spec) === JSON.stringify(current),
    pickSource: async (spec: SourceSpec) => {
      try {
        await backend.startSource(spec);
        localStorage.setItem(SOURCE_KEY, JSON.stringify(spec));
        setCurrent(spec);
        setMessage(null);
      } catch (e) {
        setMessage(errorText(e));
      }
    },
    config,
    setConfigField: (key: keyof JudgeConfig, value: number) => setConfig((c) => (c ? { ...c, [key]: value } : c)),
    applyConfig: async () => {
      if (!config) return;
      await backend.setJudgeConfig(config);
      setMessage("Saved — applies from the next round");
    },
    message,
  };
}
