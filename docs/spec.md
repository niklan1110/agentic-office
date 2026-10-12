# Agent Office 1.0: spec

## Objective

An open-source local tool for Claude Code users: build a team of agents from skill collections, launch it into a project, and watch the team work in a 3D office. It works in any project, with any skills, and the connection to Claude Code just works or says exactly why not.

**Users:** developers who use Claude Code (VS Code, terminal, desktop) and want named, skill-equipped subagents without writing agent files by hand.

**Success looks like:**

- From a fresh clone: `npx github:niklan1110/agentic-office` in a project, then a team is launched in under 2 minutes without reading docs.
- A Claude Code session in the project with the plugin installed shows as connected within 3 seconds of the server starting. Nobody types a port or URL.
- When it is not connected, the page and the session both say why, with the one step that fixes it.
- A task typed in the office is delivered to a session or reported as failed, with the reason. It is never silently lost.

## What went wrong in the prototype (my_selected_skills/office + mods/office-bridge)

| Problem | Cause | Fix in 1.0 |
|---|---|---|
| Session never connects | The mod's `officeUrl` (7878) and the server port (7777) were set separately and disagreed | Discovery: the server writes `.claude/agent-office/server.json` in the project; the plugin reads it. No URL to configure. |
| Sessions run old code | Claude Code loaded the mod from another clone of the repo | The plugin reports its version on every heartbeat; the page shows a mismatch and how to update. |
| Tasks went to the wrong project | One server, any session: "whichever asks first takes the task" | Each heartbeat carries the session's project root; tasks only go to sessions of the server's project. |
| Tasks silently lost | A task left the queue before the session accepted it | Lease, then acknowledge: a task is re-queued if not acknowledged in 20 s, and marked failed with the reason after 3 tries. |
| "Is it connected?" was guesswork | The only signal was a timestamp | Sessions list with project, plugin version and last contact on the page; a status line and `/office` diagnostics in Claude Code. |
| Port in use, or two servers for one project | Fixed port | The server takes the next free port and records it; a second server for the same project points you to the first. |
| Skills tied to one repo | The catalog read `../skills` | Skill sources are configurable: `--skills <dir>` (repeatable), `AGENT_OFFICE_SKILLS`, plus the project's and your personal `~/.claude/skills`. |
| Agent creation not obvious | Blank agent, then a long checkbox list | "Add agent" starts from a role (or blank); a Suggested tab per role; Add / Added buttons; a preview of what Claude sees. |

## Commands

```bash
npx github:niklan1110/agentic-office                 # start in the current project (or: agentic-office start)
agentic-office --project ../app    # another project
agentic-office --skills ~/skills   # add a skill collection (repeatable)
agentic-office doctor              # check the server, the discovery file and the plugin install
npm test                         # server and page logic tests
claude plugin test plugin        # plugin tests
```

## Structure

```text
bin/agent-office.mjs      CLI: start, plugin install, doctor, --help, --version
scripts/capture.mjs       README screenshots through headless Chrome
server/                   HTTP server, discovery, sessions and tasks, skill catalog, team launch
public/                   the web app: setup (welcome, agents, launch) and the 3D office
plugin/                   the Claude Code plugin (function hooks)
.claude-plugin/           marketplace manifest, so the repo installs as a plugin marketplace
test/                     node:test suites
docs/                     this spec, architecture, ADRs, design handoff
```

## HTTP API (loopback only)

| Method and path | Who | What |
|---|---|---|
| `GET /api/hello` | anyone local | `{ app, version, project, url }` |
| `POST /api/sessions/heartbeat` | plugin | `{ session, project, plugin, version }` → `{ match, serverVersion, project, task? }` |
| `POST /api/tasks/:id/result` | plugin | `{ ok, reason? }`: the task was submitted, or why not |
| `POST /api/events` | plugin | one office event; header `x-agent-office-project`; 409 when the project differs |
| `GET /api/stream` | page | server-sent events: backlog, events, `team`, `status` |
| `GET /api/status` | page | `{ version, project, sessions[], tasks[] }` |
| `POST /api/tasks` | page | `{ text }` → queued task |
| `GET /api/skills` | page | skill sources, areas, skills |
| `GET /api/team`, `POST /api/launch` | page | the launched team; deploy a team |
| `GET/POST /api/office` | page | the office theme `{ theme }`, saved in `.claude/agent-office/office.json` |
| `POST /api/library/inspect`, `/upload`, `/add`, `/remove` | page | add skills from a GitHub link or a zip to `~/.agent-office/skills` |
| `GET /api/summary`, `GET /api/offices` | page | this office in brief; every office on the computer (from `~/.agent-office/offices/`) |
| `GET/POST /api/phone` | page | watch-only phone sharing: a second listener on the network, behind a secret link, serving only the office page and its live data |

## Boundaries

- **Always:** loopback only; check the Host header and refuse cross-origin POSTs; validate every input; write only under the project's `.claude/`; never overwrite or delete a file the tool did not write.
- **Ask first:** new runtime dependencies (there are none: Node built-ins, vendored three.js); changing the plugin's public options.
- **Never:** send data off the machine; store task text beyond the server's memory; bundle third-party skills in the package.
