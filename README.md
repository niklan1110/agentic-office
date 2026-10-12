# Agent Office

Build a team of Claude Code agents from skill collections, launch it into your project, and watch the team work in a 3D office.

- **Build a team in the browser.** Start each agent from a role (developer, reviewer, QA, designer…) or from blank. Name it, pick its character, and give it skills from any collection, grouped by area, each with a short description.
- **Launch it into your project.** Each agent becomes a real Claude Code subagent in `.claude/agents/`, with its skills preloaded. Every Claude Code session in the project has the team: VS Code, the terminal, or the desktop app.
- **Watch it work.** With the plugin installed, the office shows each agent at its desk as it works: thinking, using tools, passing messages, finishing. Type a task in the office and your Claude Code session starts on it.

Everything runs on your machine. The server only accepts local connections, and nothing leaves your computer.

## Quick start

You need Node 20 or newer and Claude Code.

**1. Start the office in your project:**

```bash
cd your-project
npx agent-office --skills ~/path/to/a/skill-collection
```

The browser opens on a welcome page. The skill list includes the collection you passed with `--skills`, your personal skills in `~/.claude/skills`, and any skills already in the project.

**2. Build and launch your team** on the page: Welcome → Your agents → Launch.

**3. Install the plugin once,** for the live office and tasks typed there. Run this in a terminal; it also covers the VS Code extension:

```bash
claude plugin marketplace add niklan1110/agent-office
claude plugin install agent-office@agent-office
```

Open Claude Code in the project. The office shows `Claude session connected` within a few seconds. Nothing to configure: the plugin finds the office of its project by itself.

**4. Give the team work:**
- **In the office:** type a task at the top and press **Call meeting**.
- **In any Claude Code session:** "Have ada build the sign-up form, then qa test it."

## When something does not connect

```bash
npx agent-office doctor
```

`doctor` checks four things: the server, the plugin install and its version, old plugins that compete with it, and your skill sources. For each problem it says the fix.

Inside Claude Code, run `/office` to see what the session sees: the project, the server it found, the versions, when it last made contact, and what to do next. While connected, the status line reads `office: connected`.

In the office, click the connection chip under the title. It lists every session that has checked in, with its project and plugin version.

| Symptom | What it means |
|---|---|
| "no Claude session connected" | No session of this project is running with the plugin. Open one; it connects within seconds. |
| `/office` says *no server* | The office isn't running for this project. Run `npx agent-office` in the project folder. |
| `/office` says *other project* | The plugin's `officeUrl` option forces another project's office. Clear it. |
| A version note | The plugin and the server differ. Run `claude plugin update agent-office` and restart the session. |

## Options

```text
agent-office [start] [--project <dir>] [--skills <dir>]... [--port <n>] [--strict-port] [--no-open]
agent-office doctor  [--project <dir>] [--skills <dir>]...
```

| Option | Default | |
|---|---|---|
| `--project` | current folder | The project the team is launched into. |
| `--skills` | none | A folder of skills, one folder per skill, each with a `SKILL.md`. Repeat it for more. `AGENT_OFFICE_SKILLS` works too, as a list separated by `:` (`;` on Windows). |
| `--port` | 7777 | The first port to try. If it is taken, the next free one is used and recorded for the plugin. |
| `--strict-port` | off | Fail instead of moving to another port. |
| `--no-open` | off | Don't open the browser. |

Starting a second office for the same project points you to the one already running.

**Plugin options** (`/plugin` → agent-office → configure):

| Option | Default | |
|---|---|---|
| `officeUrl` | empty | Leave it empty. The plugin finds the office of its project. |
| `showTask`, `showMessages` | on | Send the first 200 characters of prompts and messages, for the meeting and speech bubbles. |
| `registerTeam` | on | Add a team launched mid-session to that session right away. |
| `acceptTasks` | on | Run tasks typed in the office in this session. |

## What launching writes

All of it goes under the project's `.claude/`:

- **`.claude/agents/<name>.md`:** one subagent per agent, with its description, skills, model and instructions. Launching again updates these files. An agent you removed has its file deleted. A file the office did not write is never touched.
- **`.claude/skills/<skill>/`:** a copy of each assigned skill from a collection. Skills already there, and your personal skills, are left alone.
- **`.claude/office-team.json`:** the team, which the setup page loads next time.
- **`.claude/agent-office/server.json`:** where the running office is, for the plugin. It is removed when the office stops.

Claude Code reads agent files when a session starts. Sessions that were already open get the agents through the plugin, or when you start a new session. Skills are picked up mid-session.

## Skill areas

Skills are grouped into areas: Planning & workflow, Web & frontend, Design & UX, Backend & APIs, Data & ML, Languages, Mobile & desktop apps, Testing & QA, Code quality & review, Security & compliance, DevOps & infrastructure, AI agents & LLMs, Docs & writing, Research & analysis, Marketing & content, Video & media, Business operations.

Rules on each skill's name and description in [`server/groups.mjs`](server/groups.mjs) pick the area. A skill can also name its area in its frontmatter, for example `group: design`.

## Development

```bash
npm test                   # server, task delivery, launch and page-logic tests (node:test)
claude plugin test plugin  # the plugin's tests
claude plugin validate plugin
npm start -- --skills <dir>
```

[`docs/spec.md`](docs/spec.md) has the design: the API, how sessions find the office, and how tasks are delivered. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to work on it. The 3D office follows the design handoff in [`docs/design/`](docs/design/).

## License

MIT, see [LICENSE](LICENSE). It includes three.js (MIT) and the Geist fonts (SIL OFL 1.1); see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Skills are not included: each collection you point it at keeps its own license.
