# Handoff: Agent Office (3D voxel agent characters)

## Overview
A live 3D "office" that shows every running AI agent as a small blocky character. Each agent has a role (manager, developer, reviewer…), a status (working, thinking, idle, error, done) and a desk. When the user gives a task, the manager calls everyone into a conference room, briefs them, and they walk back to their desks to work. Idle agents wander off to grab water, coffee, snacks, printouts or books and bring them back to their desk.

Visual style reference: `reference/style-reference.avif` (matte, chamfered block figurine, flat black rectangle eyes, no mouth).

## About the Design Files
The files in this bundle are **design references built in HTML + three.js**. They are working prototypes showing intended look and behavior, not production code to ship as-is. Recreate them in the target app's environment (e.g. React + React Three Fiber, plain three.js, Unity…) using its established patterns. If no environment exists yet, **React + @react-three/fiber + @react-three/drei** is the recommended choice; the prototype's geometry and animation code ports almost 1:1.

The prototype code in `agents.js` is clean enough to lift directly as a starting point for the character module.

## Fidelity
**High-fidelity.** Character shapes, dimensions, colors, animations, status glyphs, office layout, UI chrome and copy are final. Recreate faithfully.

## Files
| File | What it is |
| --- | --- |
| `Agent Office v3.html` | Main screen: office scene, UI overlay, meeting flow, errand AI, status simulation |
| `Character Viewer.html` | Character sheet: per-role 3D viewer, spec card, motion preview, GLB/OBJ export |
| `agents.js` | **Core module.** Role definitions, character builder, animation function, status indicator |
| `office-v3.js` | Office v3 layout: rooms, furniture, per-role desks, navigation graph, spots, carried items |
| `office-props.js` | Shared prop builders (plants, chairs, glass walls, windows, bookshelves, palette `C`) |
| `three-d-stage.js` | Viewer web component used by the character sheet (lighting, orbit, GLB/OBJ export) |
| `reference/style-reference.avif` | Original style reference image |

To run locally: serve the folder over HTTP (`npx serve .`) and open `Agent Office v3.html`. three.js 0.184.0 loads from unpkg via an import map.

---

## Characters (`agents.js` → `ROLES`)

### Shared construction rules
- Units: **1 unit = 1 cm** (export scales by 0.01 to meters). Y-up, front faces +Z.
- Every part is a box with a **0.09 chamfer** (`softBox`: rounded-rect ExtrudeGeometry with bevel; bevel = min(0.09, minDim × 0.14), 2 bevel segments). Eyes are plain sharp boxes 0.06 deep, protruding 0.02 from the front face.
- Materials: body `MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 })`, one per role; eyes `#161616`, roughness 0.4.
- Rig hierarchy (names matter, they become GLB node names):
  ```
  agent_<id>
  ├─ leg_1..leg_4   (groups pivot at hip y = legH; duo legs = 2)
  └─ upper          (group at y = legH; bobs/squashes)
     ├─ body [, body_1]   (body blocks)
     ├─ <extras>          (crest, antenna, tiers, bars, brim…)
     ├─ eyes              (group; scale.y for blink, position for look)
     │  └─ eye_L / eye_R  or  visor
     ├─ arm_L             (group pivot at shoulder x = -W/2)
     └─ arm_R             (group pivot at x = +W/2)
  ```
- Arm types: `step` = main block (len+0.15 × h × armDepth) plus an under-step block (len×0.55+0.15 × h×0.55); `hand` = main block plus a raised hand block (0.7 × 1.3) at the tip; `stub` = main block only. Arm depth = min(D×0.6, 1.8).
- Legs: `quad` = 4 legs, width 0.62, depth min(D×0.55, 2), at x = ±(W/2−0.55) and ±(W/2−1.35); `duo` = 2 legs, width 1.5, depth D×0.7, at x = ±(W/2−1.2). Leg height = legH + 0.1 (overlaps body).
- Eyes: center y = H × eyes.y (from body bottom), centers ±gap/2 apart.

### Role table
| id | Name | Paint | Body W×H×D | legH | Legs | Eyes w×h, gap, y | Arm (type, y, len, h) | Signature extras | Work motion |
|---|---|---|---|---|---|---|---|---|---|
| manager | Manager / Orchestrator | `#D97757` | 6 × 5.6 × 3 | 1.3 | quad | .55×1.1, 3, .6 | step, 1.6, 1.2, 1 | crest 2×.9×2 on top | point |
| developer | Software developer | `#4F7CAC` | 6 × 4.5 × 3 | 1.3 | quad | .55×1.1, 3, .6 | step, 1.2, 1.2, 1 | none (base silhouette) | type |
| reviewer | Code reviewer | `#B5483B` | 7.2 × 3.6 × 3 | 1.2 | quad | 1.1×.42, 3.3, .6 (squint) | step, .9, 1.1, .9 | none, wide & low | scan |
| qa | QA / tester | `#E0B04A` | 5 × 5 × 4.2 | 1.0 | quad | .7×.7, 2.4, .62 | step, 1.4, 1.1, 1 | none, deep cube | type |
| researcher | Researcher | `#8C6BB1` | 4.4 × 6.2 × 3 | 1.4 | quad | .5×1.2, 2, .66 | step, 2, 1.1, .9 | antenna stem .4×1.4×.4 at x .9 + tip cube 1 | scan |
| designer | Designer | `#E07A9A` | 6.4 × 3.8 × 3.2 | 1.3 | quad | .55×1.1, 3.2, .55 | step, 1, 1.2, 1 | tier 4.6×1×2.6, tier 2.8×.8×2 (ziggurat) | type |
| devops | DevOps / deploy | `#3E9C9C` | 6.6 × 4 × 3.2 | 1.4 | duo | .55×1, 3.2, .6 | hand, 1.1, 1.8, .8 | long arms with raised hands | type |
| writer | Writer / docs | `#D8C8A8` | 5.4 × 5.4 × 2.4 | 1.3 | quad | .5×1, 2.6, .55 | step, 1.4, 1.1, .9 | 1.3 top-right notch (dog-ear) | type |
| analyst | Data analyst | `#8DB04A` | 6 × 4.2 × 3 | 1.3 | quad | .55×1.1, 3, .6 | step, 1.1, 1.2, 1 | bars 1.2 wide × .6/1.2/1.9 tall at x −1.7/0/1.7, depth 1.6 | type |
| security | Security auditor | `#6E7B8C` | 6 × 5 × 3.6 | 1.2 | quad | single visor 4×.6, .62 | stub, 1.2, .8, 1.5 | brim 6.4×.45×.8 at top front (y −.45, z 1.6) | scan |

Extras are positioned relative to the body top center (`y` measured up from body top; optional `z`).

### Animations (`animateAgent(agent, t, motion)`)
Reset all transforms every frame, then apply. `p = t + agent.phase` (random phase per agent).
- **static**: rest pose.
- **idle**: upper.y += sin(2p)×0.06; upper.scale.y = 1 + sin(2p)×0.012; eyes glance ±0.22 x when sin(0.45p) > 0.85.
- **work / type**: k = sin(16p); arm_L.rot.z = .1 + max(0,k)×.22; arm_R.rot.z = −(.1 + max(0,−k)×.22); upper.rot.x = .07 (lean); eyes y −0.15.
- **work / point** (manager): arm_R.rot.z = .95 + sin(3p)×.12; upper.rot.y = −.12; small bob.
- **work / scan**: upper.rot.y = sin(1.4p)×.32; eyes x follow ×.22.
- **walk**: w = 7p; legs alternate rot.x = ±sin(w)×.45 (even/odd index); upper.y += |sin w|×.18; slight z sway; arms swing.
- **think**: idle breathing + upper.rot.z = sin(1.1p)×.07; eyes up +.28 and drift.
- **error**: shake burst for 0.45s every 2.4s (upper.x = sin(70q)×.14); eyes squint scale.y .45; arms droop ±.28.
- **done**: hop every 2.6s; 0.6s arc, root.y = sin(π·q/0.6)×1.1, arms up ±.6; then a 0.15s landing squash (scale.y −6%).
- **Blink** (all non-static): eyes.scale.y = 0.1 for 0.13s, every 2.5–6s.

### Status system
| Status | Color | Floating glyph (above head, top + 2.6, billboarded, bobbing ±0.15) |
|---|---|---|
| working | `#4C8DF6` | 0.95 cube spinning (rot.y 2.2/s, rot.x 1.3/s) |
| thinking | `#E5A93B` | 3 cubes 0.5, x −.8/0/.8, bouncing in sequence |
| idle | `#9C9A94` | pause glyph, two bars .42×1.2 |
| error | `#E0483E` | "!" bar .5×1.2 + dot .5, pulsing scale 1→1.12 |
| done | `#3FAE6A` | voxel check mark, 5 cubes .5 at grid (−2,0)(−1,−1)(0,0)(1,1)(2,2)×0.42, gentle yaw |

Glyph material: color = emissive = status color, emissiveIntensity 0.3. Status → animation mapping: working→work, thinking→think, idle→idle (plus errands, below), error→error, done→done.

---

## Screen 1: Agent Office (`Agent Office v3.html`)

### Scene
- Renderer: antialias, PCFSoft shadows, pixel ratio ≤ 2. Background and fog `#EFE6DA` (fog 200→380).
- Camera: Perspective fov 30; target (−5, 0, −4); offset (24, 70, 92), scaled by max(0.8, (1.7/aspect)^0.85) for narrow viewports. On widths > 900px the camera uses `setViewOffset` to shift the scene left by 296px so it isn't hidden behind the panel. OrbitControls with damping, maxPolarAngle 1.3, distance 25–300.
- Lights: Hemisphere (`#FFF1DD` sky, `#B49A80` ground, 1.0); key Directional `#FFE2BF` 1.9 at (55, 95, 70), 4096 shadow map, frustum ±75; fill Directional `#FFF4E2` 0.45 from (−10, 40, −90). Warm PointLights: manager lamp `#FFC27A` 45, conference `#FFD3A0` 30, lounge floor lamp `#FFB868` 110, reading nook `#FFC27A` 40.
- Diorama cutaway: only the back and left walls (wall `#EBDFCB`, baseboard/crown `#7E6A55`, height 13).

### Floor plan (world units; x right, z toward camera)
Footprint x −50.5…40, z −32.5…24.
- **Back strip, z −32.5…−13:**
  - Manager's office x −50.5…−30 (wood floor `#B3A089`, glass walls, door gap at x −36…−32): exec desk, monitor, nameplate, trophy, lamp, 2 guest chairs, bookshelf, filing cabinet, plant.
  - **Conference room** x −30…4 (floor `#A9A898`, glass walls, door x −15…−10): wall screen 13.6×7 at z −32 whose slides fade in during the meeting, credenza with water pitcher and glasses, speakerphone, plants.
  - Kitchen x 4…26 (checker floor `#E8DCC6`/`#CDBDA1`): fridge with magnets, sage counter with coffee machine, fruit bowl, sink, mug rack, wall shelves with jars, mugs and plants, water cooler, high table with 2 stools, recycling bins.
  - Lounge x 26…40 (plank floor): sofa with pillows and throw, coffee table, floor lamp, rug, vending machine.
- **Bullpen, z −13…24 (carpet `#C2B5A2`/`#BBAD99`):**
  - Desk columns x = −36, −23, −10, 3, 16.
  - Row A agents at z −3.5: developer, reviewer, qa, researcher, designer. Row B agents at z 10.5: devops, writer, analyst, security.
  - Desks sit at agent z + 4.3, in front of the agent and facing the camera.
  - Copier at (16, 13.4) with boxes. Front strip z ≈ 21: credenza with lamp, low bookshelf, snack table, plants. Reading nook armchair at (34.5, −2), tall bookshelf at x 38.8.
- Corridors (agents only walk on these): back corridor z −9.5 (x −46…33) and middle corridor z 6.6 (x −46…35), joined at x −46 and x 25.5.

### Desk (shared base, `deskFor`)
Top 9.5×0.5×4 `#CFA87C` at y 2.3–2.8 (`T = 2.8` is the desk surface), two dark legs on the left, drawer pedestal 2.6×2.3×3.6 `#9A948C` on the right. Item drop slots at local (−4, 1.2), (−3.05, 1.4), (−2.1, 1.15).

Per-role desk props (signature "character"):
- **Developer**: main monitor with 4 stickers, vertical second monitor, rainbow-keycap keyboard, rubber duck, green cup.
- **Reviewer**: paper stack with red marks, red-handled stamp, inbox tray, red pen.
- **QA**: monitor with red/green stickers, 3 test phones on stands (lit screens), bug in a jar, clipboard with green checks.
- **Researcher**: tilted book stacks (3 piles), open book, small globe.
- **Designer**: wide pink-tinted monitor, drawing tablet with stylus, fanned color swatches, pencil cup.
- **DevOps**: mini server rack with blinking green/blue/amber LEDs, yellow hard hat, blue cable.
- **Writer**: typewriter (sage body, paper sheet), notebook stack, pencil cup, desk lamp, crumpled paper on the desk and the floor.
- **Analyst**: two monitors, calculator, bar-chart printout.
- **Security**: 3 green-tinted monitors (one stacked on top), padlock, access badge.

### UI overlay (HTML on top of the canvas)
Fonts: **Geist** (400/500/600) for UI, **Geist Mono** (400/500) for labels. Ink `#1F1E1C`, muted `#6B6862` / `#75726B` / `#8A867E`, accent `#D97757` (hover `#C4633F`).
- **Title** (top-left 16px): "Agent Office" 18/600, −0.01em letter-spacing. Summary line in Geist Mono 12px `#6B6862`, e.g. "10 running · 4 working · 2 on break · 1 blocked". The summary hides below 1100px.
- **Top-right controls** (one row, gap 8, no wrap):
  - **Task form** (white 88% fill, 1px `rgba(0,0,0,.07)` border, radius 10, 3px padding): input 13px, placeholder "Give the team a task…", width 220px (130px below 1100px). Button "Call meeting" with `#D97757` fill, white 12/500 text, radius 7, padding 9×12; disabled `#CFCBC3` while a meeting runs.
  - **Segmented control** "Live / Static": white 80% fill, radius 10, 3px padding; the active option is `#1F1E1C` with white text.
  - **Simulate toggle**: pill switch 26×15; on state `#D97757`.
- **Right panel**: fixed right 16, top 74, bottom 16, width 280, white 88% fill + blur(10), radius 14.
  - Header: "AGENTS 10" (Geist Mono 11px uppercase, +0.06em) and a link "Character sheet ↗".
  - **Task card** (`#F3EEE6`, radius 10, padding 12): "CURRENT TASK" label, then the task text 13px, or the empty copy "None yet. Type a task above and the manager will call everyone into the conference room." While a task runs, the label switches to the phase with a colored dot: "Gathering in the conference room" (amber), "Manager is briefing the team" (amber), "Heading back to desks" (blue), "In progress" (blue).
  - **Agent rows**: 22px color chip (radius 5, inset bottom shadow), name 13/500, live activity line 11.5px (e.g. "Getting a glass of water", "Bringing a coffee back", "In the meeting"), and a status dot plus label on the right. The selected row (`#F3F1EC`) expands to show 5 status buttons, a description and an "Open in character sheet →" link.
- **Name tags** above each agent: Geist Mono 11/500, white 86% fill, radius 6, padding 5×8; selected tag is inverted (dark fill, white text). Tags are hidden for agents seated in the meeting.
- **Manager speech bubble**: `#1F1E1C`, white 13/500 text, radius 10, max-width 240, a "MANAGER" eyebrow in `#E9B49B`, and a caret pointing down.
- **Legend** bottom-left with the 5 status dots. Hint text: "Click an agent to set its status · drag to orbit · scroll to zoom".
- Selection ring: 4 thin dark bars (10×8 outline) on the floor under the selected agent.
- Below 900px the panel and hint hide; below 760px the bar stacks vertically.

### Interactions & behavior
- **Click an agent** (raycast, pointer moved < 5px) to select it and expand its row; click empty space to deselect.
- **Status buttons** set status. Simulate (on by default) changes one random agent's status every 3.4s, weighted toward working and idle. It pauses during meetings and in Static.
- **Static** freezes everything in the rest pose.
- **Navigation**: each agent's location is a named *spot* (`SPOTS` in `office-v3.js`). A spot has an entry node on the corridor graph plus a short local path. Routes run spot → corridor (Dijkstra over `NODES`/`EDGES`) → spot. Walk speed is 7.5 units/s. Agents face their direction of travel (angle lerp, k = 1 − e^(−9·dt)) and turn to the spot's rotation on arrival.
- **Errands**: an agent that is idle at its desk waits 1–11s, then picks a free spot (spots are reserved one agent at a time). Weighted choice: cooler 3, coffee 3, fridge 1, vending 1, sofa L/R 1 each, copier 1.2, bookshelf 1. The agent walks there, waits (2.4–7s, playing the spot's animation), picks up the item, walks home and drops it in the next desk slot (3 slots, oldest replaced).
  - Items carried in the right hand: water glass, coffee mug, soda can, snack bar, printouts, book.
  - Activity copy: "Making coffee", "Getting a glass of water", "Raiding the fridge", "At the vending machine", "Resting on the sofa", "Printing at the copier", "Browsing the bookshelf", "Bringing a coffee back", "Heading back to desk", "At desk".
- **Meeting flow** (state machine `phase`: none → gather → brief → disperse → none):
  1. *Submit task* (empty input picks a sample task). Current trips are interrupted: an agent that is walking finishes its leg first.
  2. *gather*: the manager goes to the stage (−13, −27) facing the team. Others leave after a 1.6–3.2s stagger for their seats: front row at z −21 (x −26, −19.5, −13, −6.5, 0) and back row at z −16.5 (x −22.75, −16.25, −9.75, −3.25), all facing the manager. Once the manager arrives, the bubble reads "Everyone, conference room please." The screen brightens slightly.
  3. *brief* (starts when everyone has arrived, or after a 45s timeout): the bubble shows the task text; the slides fade in; the manager is set to working and everyone else to thinking. Lasts 9s.
  4. *disperse*: agents leave in a stagger (0.2s + 0.3s × index; manager after 2s), walk to their desks, drop anything they were carrying and switch to **working** ("Working on the task"; manager: "Tracking progress").
  5. Back to *none* once everyone is seated.

### State (per agent)
`status`, `at` (current spot id), `queue` (steps: `{go}`, `{wait, anim}`, `{pick}`, `{drop}`, `{fn}`), `cur` (active step), `route` + `s` (distance along route), `carry` (held item), `activity` (display string), `idleT` (errand timer), `arrived`. Global: `phase`, `task`, `phaseT`, `selected`, `paused`, `simulate`, `reserved` (spot → agent index).

In the real app, `status` and `task` should come from your agent runtime instead of the simulator. Recommended mapping: running tool call → working; LLM streaming/planning → thinking; waiting for input → idle; failed → error; finished → done. Trigger `callMeeting(task)` when a new top-level task is dispatched to the team.

---

## Screen 2: Character sheet (`Character Viewer.html`)
- Layout: CSS grid `340px | 1fr`, full viewport height. Left aside `#F6F5F1` with a 1px right border. Right side holds the 3D stage (background `#ECEAE5`, studio lighting, orbit, ground shadow).
- Aside contents:
  - Header: "Agent characters" 18/600; mono subline "10 roles · 1 unit = 1 cm · matte paint + black eyes"; link "← Back to office".
  - 5-column grid of role buttons (square, radius 9, color chip + name); the active one gets a 1px ink inset ring.
  - Spec card: name 26/600, role, then a `dl` with Paint (hex swatch), Overall size, Body, Legs, Eyes, Signature, Work loop.
  - Motion preview segmented control: Static / Idle / Working / Walking.
  - "Shared rules" block.
- Hash routing: `#developer`, `#manager`, etc.
- Export: GLB and OBJ+MTL of the current pose, file name `agent-<id>`, scaled to meters (×0.01). Status glyphs are scene-only and never exported.

---

## Design tokens
**UI:** bg `#EFE6DA` (office) / `#ECEAE5` (viewer); ink `#1F1E1C`; muted `#6B6862`, `#75726B`, `#8A867E`; accent `#D97757`, hover `#C4633F`; panel fill `rgba(255,255,255,.88)`; hairline `rgba(0,0,0,.07)`; selected row `#F3F1EC`; task card `#F3EEE6`. Radii: 6 (tags), 7 (inner buttons), 9–10 (controls, cards), 14 (panel). Spacing: 16 outer margin, 8 control gap.
**Status:** working `#4C8DF6`, thinking `#E5A93B`, idle `#9C9A94`, error `#E0483E`, done `#3FAE6A`.
**Office palette** (`C` in office-props.js): wall `#EBDFCB`, baseboard `#7E6A55`, wood `#B48A60` / dark `#7A5434` / light `#CFA87C`, metal `#8E8A84`, dark `#2E2C2B`, paper `#F5F1E8`, cream `#F2EADB`, leaves `#5F8A4E` `#4C7A43` `#78A05A`, pot `#C27A4E`, sofa `#4D6B73` / `#43606A`, sage cabinets `#8FA08A`, rug `#B9714F` / `#DDB38B`, cardboard `#C69C6D`, frames `#5E4A3A`. Screens: emissive `#CFE0F0` at 0.35. Lamps: emissive `#FFD9A0`.
**Typography:** Geist 400/500/600; Geist Mono 400/500 (Google Fonts).

## Assets
All geometry is procedural (no model files or textures besides small canvas-generated floor tiles). `reference/style-reference.avif` is the user-supplied style reference. Fonts come from Google Fonts.

## Suggested implementation order
1. Port `agents.js` as-is into a `Character` component (R3F: build meshes from the same ROLES data; drive `animateAgent` in `useFrame`).
2. Status glyph component.
3. Office layout from `office-v3.js` (consider exporting it once as a GLB from the prototype, or keep it procedural).
4. Navigation graph and errand state machine.
5. Meeting state machine wired to real task dispatch.
6. UI overlay, then hook statuses up to the live agent runtime.
