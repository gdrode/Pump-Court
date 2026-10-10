import { streakMultiplier, streakTier, STREAK } from "@tracker/game";
import { useEffect, useRef, useState } from "react";
import { STREAK_BREAK_WORDS, STREAK_WORDS, STREAK_WORDS_MS } from "../config/modes";

/** The words flashed on screen: a new streak tier, or "lol..." when one breaks. */
export interface StreakWords {
  text: string;
  /** "up": a tier was reached. "break": a streak with a multiplier ended. */
  kind: "up" | "break";
  /** The tier reached, or the tier that was lost. */
  tier: number;
  /** "1.3x" for "up". */
  multiplier: string;
  /** Changes every time, so the animation replays. */
  key: number;
}

/**
 * Streak effects for one player: the tier (0 = none … 4 = 1.5x) for the screen
 * glow, and the words to flash. `streak` = perfect reps in a row. Nothing
 * fires while `active` is false (before the clock, or once the player is done).
 */
export function useStreakFx(streak: number, active: boolean) {
  const tier = active ? streakTier(streak) : 0;
  const prev = useRef(0);
  const [words, setWords] = useState<StreakWords | null>(null);

  useEffect(() => {
    const was = prev.current;
    prev.current = tier;
    if (!active) return setWords(null);
    if (tier > was) {
      const m = streakMultiplier(tier * STREAK.every);
      setWords({ text: STREAK_WORDS[tier], kind: "up", tier, multiplier: `${m}x`, key: performance.now() });
    } else if (tier === 0 && was > 0) {
      setWords({ text: STREAK_BREAK_WORDS, kind: "break", tier: was, multiplier: "", key: performance.now() });
    }
  }, [tier, active]);

  useEffect(() => {
    if (!words) return;
    const t = setTimeout(() => setWords(null), STREAK_WORDS_MS);
    return () => clearTimeout(t);
  }, [words]);

  return { tier, words };
}
