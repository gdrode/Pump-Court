import { useEffect } from "react";
import { useStreakFx } from "../../logic/useStreakFx";
import { play } from "../sounds";

/**
 * The streak show, drawn over the screen (or over one Duel camera with
 * `contained`): a glow around the edge that gets heavier per tier, the tier's
 * words, at 1.5x (BRUTAL) a big pixel explosion (public/fx/explosion-brutal.png,
 * CC0) with shaking text and an 8-bit boom, and "lol..." with its sound when
 * the streak breaks, as the glow sinks away. Clicks pass through. `sound`:
 * off on the crowd screen, so only the operator laptop plays it.
 */
export function StreakFx({
  streak,
  active,
  contained = false,
  sound = true,
}: {
  streak: number;
  active: boolean;
  contained?: boolean;
  sound?: boolean;
}) {
  const { tier, words } = useStreakFx(streak, active);
  const brutal = words?.kind === "up" && words.tier === 4;

  useEffect(() => {
    if (!words || !sound) return;
    if (words.kind === "break") play("lol");
    else if (words.tier === 4) play("boom");
  }, [words, sound]);

  return (
    <div className={`streak-fx ${contained ? "streak-fx--contained" : ""}`} data-tier={tier} aria-hidden="true">
      <div className="streak-fx__glow" />
      {words && (
        <div key={words.key} className={`streak-fx__words is-${words.kind} is-t${words.tier} ${brutal ? "is-brutal" : ""}`}>
          {brutal && (
            <>
              <span className="streak-fx__flash" />
              <span className="streak-fx__nuke" />
            </>
          )}
          <span className="streak-fx__text">{words.text}</span>
          {words.kind === "up" && <span className="streak-fx__x">{words.multiplier}</span>}
        </div>
      )}
    </div>
  );
}
