# The periodic table, 1600–2026

An animated visualisation of how the periodic table *became* the periodic table. A year
counter runs from 1600 to 2026; elements fade in as they are discovered; and at three
moments the whole layout reorganises itself, with every element sliding to its new
position rather than cutting.

The output is a 1920×1080 / 60fps MP4 (`out/periodic-table.mp4`, ~89 seconds), rendered
frame-by-frame from the same web page you can scrub through during development.

```
npm install
npm start          # http://127.0.0.1:8080/  — interactive, scrubbable
npm run render     # -> out/periodic-table.mp4
```

---

## The four eras

Each era is a pure layout function: given the elements, the current year and a per-element
*presence* value, it returns a rectangle for every element in one shared 1920×1080 stage
space, plus its own furniture (column headers, trays, dashed placeholders). Because all
four speak the same coordinate space, morphing between two eras is a straight lerp of each
element's rectangle — the layouts never need to know about each other.

### 1. Before 1869 — no system (`layoutWeightGrid`)

Known elements flow in a single queue ordered by atomic weight. An element's index in that
queue is the **sum of the presences of every lighter element**, so an arrival with presence
0.4 pushes everything heavier along by 0.4 of a cell: discoveries shoulder their way in
rather than snapping into place.

The grid is laid out serpentine (boustrophedon — row 1 runs left to right, row 2 right to
left) specifically so that the index → position mapping is *continuous*. At the end of a
row the last fraction of the row's index budget is spent moving straight down instead of
sideways, so an element crossing a row boundary drops one row without teleporting across
the frame:

```
r = floor(idx / cols);  u = idx − r·cols
g = min(u, cols−1)          // horizontal travel within the row
v = max(0, u − (cols−1))    // the last fraction: drop to the next row
x = even(r) ? g : (cols−1−g);   y = r + v
```

The column count itself is a smooth function of the *year* (6 columns in 1600 widening to
12 by 1869), interpolated with smoothstep — a function of year alone, so it stays
deterministic and the grid gently widens rather than reflowing in jumps.

### 2. 1869–1912 — Mendeleev's short form (`layoutMendeleev`)

Eleven columns: group 0, groups I–VII, then group VIII as a triad of three sub-columns
(Fe/Co/Ni, Ru/Rh/Pd, Os/Ir/Pt). Rows are Mendeleev's *series* 1–12; series 9 held no known
element and is elided, so the drawn rows read 1–8, 10, 11, 12.

- **A/B subgroups** are offset left and right inside their column — K (IA) sits left of
  centre, Cu (IB) right of it — which is what gives the short form its staggered look.
- **Group 0 does not exist until the nobles arrive.** The column count is blended from 10
  to 11 across 1894, so when argon lands the entire table slides one column right to make
  room for a group nobody predicted.
- **Predictions** are drawn as dashed `?` boxes labelled with Mendeleev's own names —
  eka-boron (Sc), eka-aluminium (Ga), eka-silicon (Ge), eka-manganese (Tc) — and each
  fades out as its element fades in. Eka-manganese survives the entire era; technetium was
  not made until 1937.
- **Rare earths** Ce–Lu sit in a dashed tray below the table, labelled *no place in the
  system*, because that is exactly where Mendeleev's scheme left them. Only La is placed,
  in group III of series 8.
- Th is in group IV and U in group VI, as Mendeleev had them.

### 3. 1913–1944 — Moseley's long form (`layoutMoseley`)

Ordered by atomic number, 18 columns, lanthanides in a row of their own.

- **Ac, Th, Pa, U, Np and Pu sit in groups 3–8 of period 7** — pre-actinide thinking, which
  read them as a continuation of the d-block under Lu/Hf/Ta/W/Re/Os. Americium and curium
  (1944) follow into groups 9 and 10, which is precisely the misfit that forced the next
  reorganisation.
- **Moseley's gaps** — the atomic numbers below 92 with no known element in 1913: 43, 61,
  72, 75, 85 and 87 — are drawn as dashed boxes labelled with the number, and close one by
  one as hafnium (1923), rhenium (1925), technetium (1937), francium (1939), astatine
  (1940) and promethium (1945) arrive.

### 4. 1945–present — Seaborg (`layoutModern`)

The modern 18-column table with two f-block rows beneath it.

Eras 3 and 4 deliberately share *one* geometry function: both budget two f-block rows and
Moseley simply leaves the second empty. Column positions, cell sizes and headers are
therefore identical across the 1945 morph, so the transition is purely the actinides
dropping out of period 7 and into their own row — no column drift, no header wobble.

---

## Motion

**Everything is a function of frame number.** Nothing reads a clock. `stateAtFrame(n)`
returns `{ year, eraA, eraB, blend, … }` and the whole frame follows from that, which is
what makes the headless render reproducible and the scrubber exact.

The timeline is a list of cues (`src/js/timeline.js`). `run` cues advance the year at a
chosen pace; `morph` cues hold the year still for 2.4s while the layout tweens underneath
(0.25s of stillness, then the tween, then 0.25s to settle). Sparse centuries run fast and
crowded decades slow down: 1600–1669 covers 69 years in 3 seconds, 1790–1830 covers 40
years in 9.

Arrival ramps and milestone captions are keyed to the **frame** at which each year is
reached, not to the year itself. That keeps every element's fade-in a constant 0.55s
whatever the local pace, and keeps arrivals running through a morph cue where the year is
frozen — otherwise promethium would sit half-materialised for the whole of the 1945
transition.

Two details that took a couple of passes to get right:

- **Sequential crossfades.** During a morph the two eras' furniture — headers, series
  numbers, tray outlines, the era badge — fades *out then in* rather than blending on top
  of itself. Two sets of column headers at 50% opacity in slightly different places is
  mush.
- **Lift.** The actinides drop straight through the lanthanide row in 1945. A cell whose
  journey is much longer than the frame's *median* journey gets scaled up, given a drop
  shadow and drawn last, so it reads as flying over rather than colliding. Keying it to the
  median means nothing lifts during 1869, when the whole table is reshuffling and no single
  element is exceptional.

---

## Data

`data/elements.csv` — one row per element, 118 rows.

| column | meaning |
| --- | --- |
| `Z` | atomic number |
| `symbol`, `name` | IUPAC symbol and name |
| `atomic_weight` | standard atomic weight (abridged); the sort key for the pre-1869 layout |
| `discovery_year` | the year used by the animation. Negative for prehistoric |
| `year_display` | `ancient` for anything known before 1600, otherwise the year |
| `discoverer` | credited discoverer(s) |
| `source` | `IUPAC`, `RSC` or `HIST` — see below |
| `disputed` | `1` when reputable sources disagree by more than a year or two |
| `alt_year`, `alt_basis` | the competing date and *why* it differs (isolation, publication, rediscovery, a rival claim) |
| `notes` | free text |

`data/milestones.csv` — `year, headline, detail` for the caption bar.

### The dating rule

Discovery dates vary by source, sometimes by decades. This project applies one rule
consistently:

> **First credible recognition of the element as a distinct new substance — not its first
> isolation in pure form, and not the date of publication.**

So helium is 1868 (Janssen and Lockyer's solar spectral line), not 1895 (Ramsay's
terrestrial isolation); fluorine is 1810 (Ampère and Davy arguing that hydrofluoric acid
contains a new element), not 1886 (Moissan finally isolating it); beryllium, magnesium,
strontium and barium are dated to the identification of their earths rather than to Davy's
later electrolysis. Anything recognised before 1600 — the seven metals of antiquity plus
carbon, sulfur, arsenic, antimony, zinc and bismuth — is marked `ancient` and is on screen
when the film starts.

The rule has consequences you can argue with, and that is the point of the `disputed`
column: **34 of the 118 rows are flagged**, each carrying the competing date and the basis
for it, so a different rule can be applied by swapping `discovery_year` for `alt_year`
without touching any code.

Where the rule genuinely does not settle it — the transfermium elements, where Berkeley and
Dubna contested priority for three decades — the date follows IUPAC's assignment of credit,
with the rival claim in `alt_year`.

### Disputed rows

| Z | sym | used | alt | basis for the alternative |
| --- | --- | --- | --- | --- |
| 2 | He | 1868 | 1895 | terrestrial isolation |
| 4 | Be | 1798 | 1828 | isolation of the metal |
| 8 | O | 1771 | 1774 | Scheele prepared it first but Priestley published first |
| 9 | F | 1810 | 1886 | isolation |
| 12 | Mg | 1755 | 1808 | isolation of the metal |
| 13 | Al | 1825 | 1827 | Wöhler's purer metal |
| 14 | Si | 1823 | 1811 | earlier impure preparation |
| 17 | Cl | 1774 | 1810 | Scheele made the gas; Davy showed it was an element |
| 23 | V | 1801 | 1830 | del Río withdrew his own claim; Sefström rediscovered it |
| 30 | Zn | ancient | 1746 | first European isolation |
| 33 | As | 1250 | ancient | compounds used in antiquity |
| 35 | Br | 1826 | 1825 | prepared a year before it was announced |
| 38 | Sr | 1790 | 1808 | isolation of the metal |
| 41 | Nb | 1801 | 1844 | confirmed distinct from tantalum |
| 56 | Ba | 1774 | 1808 | isolation of the metal |
| 61 | Pm | 1945 | 1947 | announcement |
| 63 | Eu | 1901 | 1896 | first indication |
| 67 | Ho | 1878 | 1879 | Cleve's separation |
| 71 | Lu | 1907 | 1906 | Urbain vs. Welsbach priority |
| 74 | W | 1781 | 1783 | the Elhuyar brothers' metal |
| 78 | Pt | 1735 | 1748 | publication |
| 83 | Bi | c.1400 | 1753 | shown distinct from lead |
| 86 | Rn | 1899 | 1900 | radium emanation vs. thorium emanation |
| 89 | Ac | 1899 | 1902 | Giesel's rival claim |
| 91 | Pa | 1913 | 1917 | the long-lived isotope |
| 94 | Pu | 1940 | 1941 | produced Dec 1940, identified Feb 1941 |
| 102 | No | 1966 | 1957 | Stockholm claim |
| 103 | Lr | 1961 | 1971 | Dubna claim |
| 104 | Rf | 1964 | 1969 | Berkeley claim |
| 105 | Db | 1968 | 1970 | Berkeley claim |
| 106 | Sg | 1974 | 1974 | concurrent Dubna claim |
| 113 | Nh | 2004 | 2003 | Dubna–Livermore claim; IUPAC credited RIKEN in 2015 |
| 114 | Fl | 1999 | 1998 | first single event |
| 118 | Og | 2002 | 2006 | publication |

### On the `source` column — please read

The three codes record *which tradition* a row's date follows:

- `IUPAC` — dates that rest on IUPAC's formal assignment of discovery credit (the synthetic
  and transuranic elements, the noble gases).
- `RSC` — dates matching the conventional single year given in standard reference tables of
  the Royal Society of Chemistry type.
- `HIST` — dates where the conventional reference year and the first-recognition rule
  disagree, and this project follows the history-of-chemistry account instead (fluorine,
  helium, chlorine, magnesium, the ancient metals).

**These are provenance categories, not citations.** The table was compiled from general
reference knowledge rather than by querying those bodies, and no row was verified against a
live source while building this. For anything where the exact year matters, check it. The
`disputed`, `alt_year` and `alt_basis` columns exist precisely because a single number in a
cell hides an argument.

---

## Layout of the repo

```
data/elements.csv      118 elements
data/milestones.csv    caption-bar cues
src/index.html         the page: canvas + scrubber + play button
src/js/elements.js     CSV parsing, modern group/period/block, Mendeleev placement table
src/js/layouts.js      the four era layout functions + shared stage geometry
src/js/timeline.js     cue list, frame -> state, arrival frames
src/js/draw.js         per-frame model and all canvas drawing
src/js/main.js         playback, scrubbing, the window.__viz render hook
scripts/serve.js       minimal static server (the page is ES modules + fetch)
render/capture.js      headless capture -> ffmpeg
render/render.sh       one-line wrapper
```

### Interactive controls

`space` play/pause · `←`/`→` step one frame · `shift`+`←`/`→` jump one second · the tick
buttons jump to a milestone or to the start of a morph.

### Rendering

`render/capture.js` starts the static server, opens the page in headless Chromium with
`?render=1` (which hides the controls and pins the canvas at exactly 1920×1080), then for
each frame calls `window.__viz.seek(n)` and screenshots. PNG frames go straight down a pipe
into ffmpeg — nothing is written to disk in between.

```
node render/capture.js --out out/periodic-table.mp4 --fps 60 --crf 17
node render/capture.js --start 3700 --end 3800 --out out/clip.mp4   # just the 1945 morph
node render/capture.js --no-video --png-dir out/frames --start 0 --end 0   # single still
```

Useful environment variables: `CHROMIUM_PATH` and `FFMPEG_PATH`. Note that the ffmpeg
bundled inside Playwright's browser download is a stripped build with only VP8/webm and
**cannot** produce an H.264 MP4 — hence the `ffmpeg-static` dev dependency, which the
script prefers automatically.

Capture runs at roughly 10 frames/second, so a full 5322-frame render takes about nine
minutes.
