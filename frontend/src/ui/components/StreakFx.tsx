import { useStreakFx } from "../../logic/useStreakFx";

/** Particles in the 1.5x explosion. */
const SPARKS = 16;

/**
 * The streak show, drawn over the screen (or over one Duel camera with
 * `contained`): a glow around the edge that gets heavier per tier, the tier's
 * words, a mini explosion with shaking text at 1.5x (BRUTAL), and "lol..."
 * when the streak breaks, as the glow sinks away. Clicks pass through.
 */
export function StreakFx({ streak, active, contained = false }: { streak: number; active: boolean; contained?: boolean }) {
  const { tier, words } = useStreakFx(streak, active);
  const brutal = words?.kind === "up" && words.tier === 4;
  return (
    <div className={`streak-fx ${contained ? "streak-fx--contained" : ""}`} data-tier={tier} aria-hidden="true">
      <div className="streak-fx__glow" />
      {words && (
        <div key={words.key} className={`streak-fx__words is-${words.kind} is-t${words.tier} ${brutal ? "is-brutal" : ""}`}>
          {brutal && (
            <div className="streak-fx__boom">
              <span className="streak-fx__flash" />
              {Array.from({ length: SPARKS }, (_, i) => (
                <span key={i} className="streak-fx__spark" style={{ "--a": `${(360 / SPARKS) * i}deg`, "--d": `${i % 2 ? 9 : 13}em` } as React.CSSProperties} />
              ))}
            </div>
          )}
          <span className="streak-fx__text">{words.text}</span>
          {words.kind === "up" && <span className="streak-fx__x">{words.multiplier}</span>}
        </div>
      )}
    </div>
  );
}
