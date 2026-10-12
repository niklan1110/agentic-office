import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

// three.js calls the animation loop with a timestamp; handing it the frame function,
// which takes an optional fixed step (for recording), made every frame jump thousands
// of seconds and the agents teleport. The loop must call frame() without arguments.
test('the live animation loop never passes the timestamp to frame()', async () => {
  const src = await readFile(new URL('../public/js/app.js', import.meta.url), 'utf8')

  assert.doesNotMatch(src, /setAnimationLoop\([^)]*\bframe\b[^)]*\)/)
  assert.match(src, /const liveFrame = \(\) => frame\(\)/)
})
