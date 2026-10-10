import type { Referee } from "../api/types";

/** Everything the dragon says, in one place so anyone can rewrite the jokes. */

const pick = <T,>(xs: T[], seed: number) => xs[Math.abs(Math.floor(seed)) % xs.length];

const NO_REP_TIP: Record<Referee, string> = {
  depth: "Go lower!",
  lockout: "Lock those arms out!",
  plank: "Keep your body straight!",
};

export const host = {
  home: "Welcome to Pump Court! Three referees, one mat. Only clean reps count.",
  who: (multi: boolean) => (multi ? "The more the merrier! Up to four of you." : "What do I call you?"),
  nextUp: (name: string) => `${name}, you're up! Get on the mat.`,
  winner: (name: string | null) => (name ? `${name} wins! What a battle!` : "It's a tie! Rematch?"),
  ready: (prompt: string | undefined, allOk: boolean) =>
    allOk ? "Looking good. Get ready!" : (prompt ?? "Get on the mat, side-on to the camera."),

  // during a round
  go: "Go go go!",
  rep: (n: number) => pick(["That's a rep!", "Rep!", "Good rep!", "Clean one!"], n),
  noRep: (ref: Referee) => `No rep! ${NO_REP_TIP[ref]}`,
  newBest: "New best! Keep pushing!",
  keepGoing: (seed: number) => pick(["Come on, keep going!", "Don't stop now!", "You have more in you!", "Push, push, push!"], seed),
  pace: (seed: number) => pick(["Nice pace!", "Keep it up!", "You're doing great!"], seed),
  lastSeconds: "Last five seconds!",

  // after
  results: (reps: number, rank: number | null) => {
    if (rank === 1) return "A new record! Everyone look at this!";
    if (rank !== null && rank <= 3) return `Top three! You're #${rank} on the board.`;
    if (reps === 0) return "Zero clean reps. The referees are strict!";
    return pick(["Solid round!", "Not bad at all!", "The referees approve!"], reps);
  },
  idle: (leader: string | null, reps: number | null) =>
    leader ? `Can anyone beat ${leader}'s ${reps}?` : "Step up and be the first on the board!",
  posted: (name: string, reps: number, rank: number | null) => `${name} just posted ${reps}${rank ? `, that's #${rank}` : ""}!`,
};
