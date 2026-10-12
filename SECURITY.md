# Security

Agent Office runs a small server on your computer. It can start prompts in your Claude Code session (tasks typed in the office) and write into your project's `.claude/` folder (launching a team). So it is built for one person only: you, on your computer.

## Who can reach your office

| Who | Can they reach it? | Why not |
|---|---|---|
| Anyone on the internet | No | The server listens on 127.0.0.1 only, which no other machine can connect to. |
| Other computers on your Wi-Fi or VPN | No | Same: 127.0.0.1 only. The one exception is the phone link below, and only while you have it turned on. |
| A website open in your browser | No | It is refused if it sends from another origin. It cannot send JSON at all without one. A Host header that is not 127.0.0.1 or localhost is refused, which blocks DNS rebinding. Pages cannot be put in another site's frame. |
| Another program, or another user account, on your computer | No, without your key | Every request that reads or changes anything needs the project's key. See below. |
| Your Claude Code sessions in the project | Yes | The plugin reads the key from the project. |
| You, in your browser | Yes | The office opens a link that carries the key once. |

## The office key

- Each project has a secret key in `.claude/agent-office/key`, made the first time the office starts and kept, so your browser stays signed in across restarts. Only your user account can read the file: Windows keeps your profile private, and on macOS and Linux the file is created with mode 600.
- The browser gets the key from the link `npx agentic-office` opens (`/?k=…`). The office swaps it for an HttpOnly, SameSite=Strict cookie and drops it from the address bar.
- Your Claude Code sessions (the agent-office plugin) read the key from the project's `.claude/agent-office/server.json` and send it with every request.
- Without the key, the office's pages show "locked to its owner" and every API call answers 401. Only `/api/hello` answers, and it says nothing but the app's name and version. The app's scripts and styles are public code and are served to anyone local.
- Keep `.claude/agent-office/` out of version control. `agentic-office` itself ignores `.claude/`; add `.claude/agent-office/` to your project's `.gitignore` if you commit `.claude/`.

## View on phone

Off until you turn it on in the office, and off again when the office stops. While it is on, a second door listens on your home network. It asks for its own one-time secret, from the QR code, which becomes an HttpOnly cookie. It serves only the office page and its live data, read-only: no tasks, no team changes, no other projects, nothing written. Anyone you show the QR code can watch the office, including the text of tasks, until you turn it off.

## What else is checked

- **Inputs:** every input is validated. Event fields are clipped, skill names and agent names are restricted, and file paths never leave the app's public folder or the project's `.claude/`.
- **Agent files:** an agent file the office did not write is never overwritten or deleted.
- **Skill zips:** zips from GitHub or uploads are size-limited and unpacked with path checks, so an archive cannot write outside the skill's folder.
- **Task text:** it is kept in the server's memory only, never written to disk.

## What it does not protect against

- **Someone already signed in as you:** a program running as your own user account can read your key, just as it could read the rest of your files.
- **Skills you add:** skills are other people's instructions and scripts. Add skills from sources you trust, the same as any code you run.

## Checking it yourself

```bash
node scripts/attack.mjs http://127.0.0.1:<port> <project folder>
```

This tries each way in from the table above, and says what got through. Run it against a throwaway office, never one a Claude Code session is connected to.

## Reporting a vulnerability

Please report it privately through GitHub's "Report a vulnerability" on the repository, not in a public issue. We aim to answer within a week.
