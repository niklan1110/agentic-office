# Changelog

## 1.0.0-rc.1

### Install
- `npx github:niklan1110/agentic-office` offers to add the plugin; `agentic-office plugin install` does it directly. Both use the newest Claude Code on the computer, including the one inside VS Code.
- A prompt that people paste into Claude Code to set it all up.

### Look and sharing
- Five themes: Warm studio, Late night, Cozy cabin, Glass HQ and Neon arcade.
- A clean view for screenshots: <kbd>H</kbd>, or `?clean` in the link.
- The Offices page lists every office on the computer.
- View on phone: a watch-only link by QR code, on the home Wi-Fi.
- Works on phones: the agent list becomes a bottom sheet, the camera frames tall screens, and drawing is lighter.

### Skills
- Add skills from a GitHub link or a zip to a personal library that every project uses.

The first release as a standalone tool. It was previously the "office" and "office-bridge" prototype in my_selected_skills.

### Connection
- Sessions find the office by themselves: the server records its address in `.claude/agent-office/server.json` and the plugin reads it, so there is no URL to set.
- One office per project. Sessions of other projects are told so, and are never given that project's tasks.
- Tasks are delivered with a lease and a confirmation. A task is retried if no session confirms it, and marked failed with the reason after three tries.
- The plugin checks in when the session starts, so short sessions show up too.
- The port moves to the next free one when it is taken. A second start for the same project points to the office already running.

### Diagnostics
- `agentic-office doctor` checks the server, the plugin install and its version, old plugins, and skill sources.
- `/office` in Claude Code, and an `office:` status line.
- The office's connection chip opens a list of sessions with their project and plugin version.

### Setup
- New agents start from a role, with its usual skills, or from blank.
- A Suggested tab per role; Add and Added buttons; each assigned skill listed with what it does; a preview of what Claude sees.
- Skills come from any number of sources: `--skills` collections, your personal skills, and the project's own.

### Plugin
- Renamed from office-bridge to agent-office.
- It registers only the team you launched. The nine built-in default roles are gone.
