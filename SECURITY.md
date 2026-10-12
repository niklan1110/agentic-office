# Security

Agent Office runs a server on your machine that can write into a project's `.claude/` folder and start prompts in your Claude Code session. What it does to keep that safe:

- It listens on 127.0.0.1 only, refuses connections from other addresses, and refuses requests whose Host header is not a loopback name, which blocks DNS rebinding.
- It refuses POSTs that a web page in your browser sends from another origin, so another site cannot queue a task or launch a team.
- It validates every input: event fields are clipped, skill names must exist in a skill source, agent names are restricted, and paths never leave the public folder or the project's `.claude/`.
- It never overwrites or deletes an agent file it did not write.
- Task text stays in the server's memory and is never written to disk.

A task typed in the office runs in your session as your own prompt, with that session's permissions. Only programs on your machine can queue one.

## Reporting a vulnerability

Please report it privately through GitHub's "Report a vulnerability" on the repository, not in a public issue. We aim to answer within a week.
