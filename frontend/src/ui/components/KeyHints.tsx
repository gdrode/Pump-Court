/** [key, label, optional click handler] */
export type Hint = [string, string, (() => void)?];

/**
 * Footer listing operator keys. The player is on the floor, so a team member
 * usually drives with the keyboard, but any hint with a handler is also a button.
 */
export function KeyHints({ hints }: { hints: Hint[] }) {
  return (
    <footer className="keys">
      {hints.map(([k, label, onClick]) =>
        onClick ? (
          <button key={k} type="button" className="keys__btn" onClick={onClick}>
            <kbd>{k}</kbd> {label}
          </button>
        ) : (
          <span key={k}>
            <kbd>{k}</kbd> {label}
          </span>
        ),
      )}
    </footer>
  );
}
