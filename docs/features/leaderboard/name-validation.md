# Player Name Validation

> **Module**: `backend/src/leaderboard.rs`, `frontend/src/logic/useNameEntry.ts`  
> **Key Function**: `validate_name(raw: &str) -> Result<String, String>`  
> **Related Documents**: [Leaderboard Overview](README.md), [Operator Runbook](../venue-operations/operator-runbook.md)  
> **Maintenance Status**: Active / Venue Safety  

---

## 1. Summary

Names are shown big on the crowd screen and kept on the board all day. The backend checks every name: it must be 1–12 characters and must not contain a blocked word. The same check runs before the round (`check_name`) and when the round starts (`start_round`), so the rules are the same everywhere.

```rust
pub const MAX_NAME_LEN: usize = 12;

const BLOCKLIST: &[&str] = &[
    "admin", "fuck", "shit", "cunt", "nigg", "fag", "bitch", "dick", "cock", "pussy", "nazi", "hitler", "rape",
    "slut", "whore",
];
```

---

## 2. What `validate_name` does

1. **Tidy spaces**: `raw.split_whitespace().collect::<Vec<_>>().join(" ")`. `"   Jo   Lee "` becomes `"Jo Lee"`.
2. **Not empty**: otherwise `"Enter a name"`.
3. **12 characters at most**, counting characters, not bytes (`name.chars().count()`). Otherwise `"Names are 12 characters at most"`.
4. **Blocklist**:
   - `normalise(name)` lower-cases the name, drops spaces, `.`, `_` and `-`, and undoes common swaps: `0→o`, `1→i`, `3→e`, `4→a`, `5→s`, `$→s`.
   - So `"sh1t"`, `"F.u_c-k"` and `"$lut"` are caught.
   - Any blocked word *inside* the name rejects it: `"Please pick another name"`.
   - This also catches some real names (e.g. "Dick Lee"). Remove a word from the list if that becomes a problem at the event.
5. Returns the tidied name, which is what gets stored.

---

## 3. In the frontend

- While typing, `cleanName` (`useNameEntry.ts`) keeps only letters, digits, spaces and `. _ -`, collapses spaces, and caps the length at 12 (`NAME_MAX` in `config/modes.ts`).
- On **Start** (or Enter on the last field), `useNameEntry` rejects an empty name, and in a Duel two names that are the same ignoring case ("The two players need different names"). Then it calls `backend.checkName` for each name. The first rejected name gets focus and its error is shown.
- `start_round` checks the name again in the backend.

Upper/lower case is kept as typed. The board treats "Ana" and "ana" as the same player (see [Scoring & Ranking](scoring-and-ranking.md)).
