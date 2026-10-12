# Agent Office 1.0: intent

Confirmed with the project owner on 2026-10-12.

- **Outcome:** a public, open-source Agent Office in its own GitHub repo. Someone finds it, installs it with one command or one prompt to Claude Code, and soon watches their own agent team working in a 3D office that is good enough to screenshot and share.
- **Users:** people who use Claude Code on their own computer (VS Code, the terminal, the desktop app) and enjoy seeing their agents' work.
- **Success:** people actually use it and post their offices (Instagram and elsewhere).
- **Must have:**
  - **One-step install:** `npx agent-office`, or a prompt pasted into Claude Code. It checks for Claude Code, offers to install the plugin, starts the office and opens the welcome page.
  - **Polish:** smooth, responsive and friendly in any browser and on small screens.
  - **Themes:** pre-made office themes.
  - **Add skills:** paste a GitHub link (one skill or a whole repo) or upload a `.zip`, pick the skills, and they go into a personal library used by every project.
  - **Offices page:** every running office in one list, with its project, theme, busy agents and whether a session is connected. One click switches between them.
  - **View on phone:** opt-in, through a QR code with a secret link, on the home Wi-Fi. It only watches the office and its progress; it never launches a team, sends a task or touches Claude Code.
  - **README:** one that looks great on GitHub.
- **Release:** the repo is `github.com/niklan1110/agent-office`, public. Commits are in the owner's name only. Until the package is on npm, the command is `npx github:niklan1110/agent-office`.
- **Constraint:** local only. The user's computer is the only server, and nothing goes through a server on the internet.
- **Out of scope:** Claude Code on the web; a record button; a drag-and-drop office editor; controlling Claude Code from the browser or the phone; browsing a skill marketplace inside the app.
