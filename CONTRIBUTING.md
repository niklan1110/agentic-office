# Contributing

Thanks for helping. Agent Office is small on purpose: Node built-ins on the server, plain ES modules in the browser, three.js vendored, and no build step.

## Set up

```bash
git clone https://github.com/niklan1110/agentic-office && cd agentic-office
npm test
npm start -- --project ../some-project --skills ../some-skill-collection
```

For the plugin, load it into a session straight from the folder:

```bash
claude --plugin-dir ./plugin          # in the project you started the office for
claude plugin validate plugin
claude plugin test plugin
```

Use a current Claude Code to validate the plugin. Older CLIs reject the manifest before they get to the checks that matter. One rule they enforce: a function that is handed `$` must be declared at the top of `plugin/hooks/register.ts`.

## Screenshots

The README images come from a running office with a team, through headless Chrome:

```bash
node scripts/capture.mjs http://127.0.0.1:7777 docs/media            # all of them
node scripts/capture.mjs http://127.0.0.1:7777 docs/media phone      # just one
```

The animated hero (needs ffmpeg) steps the office frame by frame, so it is smooth on any machine:

```bash
node scripts/record.mjs http://127.0.0.1:7777 docs/media/hero.webp 18 3   # seconds, speed
```

The banner comes from docs/media/banner-light.svg and banner-dark.svg. Edit them as plain SVG.

## Before you open a pull request

- `npm test` and `claude plugin test plugin` pass, and `claude plugin validate plugin` passes.
- New behaviour has a test: server logic in `test/`, plugin logic in `plugin/tests/`.
- Changes to the API or the discovery file are reflected in `docs/spec.md`.
- UI changes work with the keyboard, at phone width, and without the 3D view (the setup page needs no WebGL).
- No new runtime dependencies without discussing it in an issue first.

## Layout

`bin/` CLI · `server/` HTTP server, discovery, sessions and tasks, skills, team launch · `public/` setup and 3D office · `plugin/` Claude Code plugin · `docs/` spec and design · `test/` node:test suites.
