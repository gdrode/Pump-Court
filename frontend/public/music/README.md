# Music

Files the game looks for (`frontend/src/config/music.ts`). A missing file is skipped; with none, it's silent.

| File | Plays | Track | Licence / where |
| :--- | :--- | :--- | :--- |
| `toby/field-of-hopes-and-dreams.mp3` | Menu (shuffled) | Toby Fox: Field of Hopes and Dreams (Deltarune) | © Toby Fox. [Bandcamp](https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost) |
| `chibi-ninja.mp3` | Menu | Eric Skiff: Chibi Ninja (Resistor Anthems) | CC BY 4.0. [ericskiff.com/music](https://ericskiff.com/music/) |
| `pixel-peeker-polka-faster.mp3` | Menu | Kevin MacLeod: Pixel Peeker Polka - faster | CC BY 4.0. [incompetech.com](https://incompetech.com/music/royalty-free/music.html) |
| `toby/rude-buster.mp3` | Round (random, looped) | Toby Fox: Rude Buster (Deltarune) | © Toby Fox. [Bandcamp](https://tobyfox.bandcamp.com/album/deltarune-chapter-1-ost) |
| `level-3.m4a` (AAC, converted from the pack's .wav) | Round | Juhani Junkala: Level 3 (Retro Game Music Pack) | CC0. [OpenGameArt](https://opengameart.org/content/5-chiptunes-action) |
| `toby/megalovania.mp3` | Streak (1.2x until it breaks; faster each tier) | Toby Fox: MEGALOVANIA (Undertale) | © Toby Fox. [Bandcamp](https://tobyfox.bandcamp.com/album/undertale-soundtrack) |

- **`toby/` is in `.gitignore`.** Toby Fox lets people use his music, but it isn't openly licensed, so it is copied onto the event laptop by hand and never pushed to the public repo.
- The CC BY tracks are credited on the home screen (`MUSIC_CREDIT_LINE`) and in the gear menu's Music tooltip.
- To change a track: drop the file here and edit `config/music.ts`. mp3 or ogg both work (change the extension there).
