# Perseus Bound artwork

Every image the game uses lives in this folder. `index.js` finds files by **folder + name**, with any
extension (`.svg`, `.png`, `.webp`, `.jpg`, `.gif`). If two files share a name, `.svg` wins, then `.png`.

- **To replace art:** put the new file in the same folder with the same name and delete the old one.
- **To fill an empty slot:** drop a file in with the name listed below.
- Rebuild afterwards (`build.ps1` / `build.sh`). No code changes are needed, and every image is inlined into
  the single-file build.

A slot with no file falls back to something plain (text, a coloured shape, or simple dice pips drawn in code),
so the game always stays playable.

## Current inventory

**Source** says where each file came from. *Print sheets* means it was cut from your own
`Resource_Cutouts.pdf` at 300 dpi.

| Slot | File(s) | Used for | Source | Suggested size |
|---|---|---|---|---|
| Player token | `tokens/player` | Your ship on the map, legend, title screen | Print sheets (blue token) | 256×256, transparent |
| Player token (alt) | `tokens/player-yellow` | Not used yet; kept for a future second player | Print sheets (yellow token) | 256×256, transparent |
| Enemy token | `tokens/enemy` | Enemy vessels | Print sheets (red token) | 256×256, transparent |
| Element cubes | `elements/C`, `O2`, `H2`, `Cu`, `Ti`, `U` | Cargo bay, costs, trades, loot, rules | Print sheets | 128×128, transparent |
| Debt cube | `elements/debt` | Debt track | Print sheets | 128×128, transparent |
| Engine parts | `engine/hydrogen-ionizer`, `exhaust-combustor`, `nuclear-fuel-supply`, `reaction-chamber` | Engine Repairs panel | Print sheets (Engine Repair Status page) | 256×256, transparent |

## Placeholders: need human-made replacements

These files were drawn by Claude as stand-ins. Each has a **small red triangle in its top-right corner** so it
stands out on screen, and a `PLACEHOLDER` comment inside the file, so a search finds all of them. Replacing a
file under the same name removes it from this list.

| Slot | File(s) | Used for |
|---|---|---|
| Ship resource icons | `icons/fuel`, `air`, `food`, `hull`, `power` | Resource tracks, travel costs on the map, coloured outcome text |
| Enemy icon | `icons/enemy` | Outcome text ("Spotted by enemy sentinels…") |
| Planet icons | `icons/unknown`, `hostile`, `friendly` | Outcome text and the friendly-planet panel heading |
| Battle icon | `icons/battle` | Battle panel heading |
| Share icon | `icons/share` | Share button |
| Dice faces | `dice/<kind>-<1…6>`, where kind is `black`, `white`, `d6`, `unknown`, `hostile`, `friendly` (36 files) | Dice tray, planets on the map, reference tables |

## Empty slots (no file; a plain fallback is used)

| Slot | File name(s) | Used for | Fallback now |
|---|---|---|---|
| Page background | `backgrounds/background` | Behind the whole app (cover-scaled) | Solid dark colour |
| Other outcome icons | `icons/good`, `bad`, `neutral`, `C`, `O2`, `H2`, `Cu`, `Ti`, `U` | Optional icons before coloured outcome text | Text only |

To find every remaining placeholder, search the folder for the word `PLACEHOLDER`. In PowerShell:
`Select-String -Path src\assets\*\* -Pattern PLACEHOLDER -List | Select Path`.

Icons display at about 10–18 px, so a simple silhouette in a 64×64 SVG or PNG works best. Dice can be
replaced one kind at a time. For example, replacing only `dice/black-1` … `dice/black-6` swaps the black die
and leaves the other placeholders in place. If a dice file is deleted, plain code-drawn pips are used instead.

## Not artwork

These are plain styling and need no art: the map grid and checkerboard, panel shapes, buttons, the coloured
progress tracks, and the text colours for each resource (set in `src/components/outcomeColors.js` and
`src/game/constants.js`).
