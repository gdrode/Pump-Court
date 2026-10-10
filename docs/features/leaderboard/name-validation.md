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
    "admin", "fuck", "shit", "cunt", "nigg", "fag", "bitch", "dick", "cock", "pussy", "nazi", "hitler", "rape",
    "slut", "whore",
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
   - `normalise(name)` lowercases the name, drops spaces, `.`, `_` and `-`, and undoes common swaps: `0→o`, `1→i`, `3→e`, `4→a`, `5→s`, `$→s`.
   - So `"sh1t"`, `"F.u_c-k"` and `"$lut"` are caught.
   - Substring match against `BLOCKLIST`; rejects with `"Please pick another name"`.
   - Substring matching can also catch real names (e.g. "Dick"). Remove a word from the list if that becomes a problem at the event.

---

## 3. Real-Time Preflight Validation

- While typing, `cleanName` in `frontend/src/logic/useNameEntry.ts` drops characters other than letters, digits, spaces and `. _ -`, and caps the length at 12.
- When the operator presses Start, the frontend rejects empty and duplicate names, then calls `backend.checkName(name)` for each player. The first rejected name gets focus and the error is shown.
- `start_round` validates the name again in the backend.
