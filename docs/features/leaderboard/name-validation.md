# Player Name Validation & Content Moderation

> **Module**: `backend/src/leaderboard.rs`  
> **Key Function**: `validate_name(raw: &str) -> Result<String, String>`  
> **Related Documents**: [Leaderboard Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Security & Venue Safety  

---

## 1. Overview & Constraints

Player names are projected in 72pt typography onto large crowd displays and recorded into permanent tournament archives. The name validation subsystem enforces strict constraints to prevent layout breakage, SQL injections, and offensive crowd incidents.

```rust
pub const MAX_NAME_LEN: usize = 12;

const BLOCKLIST: &[&str] = &[
    "admin", "fuck", "shit", "cunt", "nigg", "fag", "rape", "nazi"
];
```

---

## 2. Validation Pipeline

The `validate_name` function executes the following sequence:

1. **Whitespace Trimming & Collapsing**:
   - `raw.split_whitespace().collect::<Vec<_>>().join(" ")`
   - Strips leading, trailing, and internal multiple spaces (e.g., `"   Alex   G   "` becomes `"Alex G"`).
2. **Empty String Check**:
   - Rejects empty submissions with `"Enter a name"`.
3. **Character Length Cap**:
   - Counts Unicode scalar values (`name.chars().count()`).
   - Caps names at **12 characters**. If exceeded: `"Names are 12 characters at most"`.
   - Ensures names render cleanly across mobile and stadium resolutions without clipping or wrapping.
4. **Keyword Blocklist Check**:
   - Lowercases string and performs substring matches against `BLOCKLIST`.
   - Rejects matches with user-friendly error: `"Please pick another name"`.

---

## 3. Real-Time Preflight Validation

Before round entry, `frontend/src/logic/useNameEntry.ts` calls `backend.checkName(name)` on every keystroke/blur, displaying validation errors to the operator before the match begins.
