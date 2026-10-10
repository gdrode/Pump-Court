import type { ReadyItem } from "../api/types";

export function ReadyChecklist({ items }: { items: ReadyItem[] }) {
  if (items.length === 0) return <p className="muted">Waiting for the camera…</p>;
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item.id} className={item.pass ? "ok" : "bad"}>
          <span className="tick">{item.pass ? "✓" : "✗"}</span>
          <span>{item.label}</span>
          {item.prompt && <em>{item.prompt}</em>}
        </li>
      ))}
    </ul>
  );
}
