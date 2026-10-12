// A small ZIP reader, enough for skill archives: GitHub's repository zips and zips
// people make themselves. Stored and deflated entries; no encryption, no zip64.
// Paths are checked so nothing can point outside the archive.

import { inflateRawSync } from 'node:zlib'

export const LIMITS = Object.freeze({ files: 5000, bytes: 64 * 1024 * 1024, file: 8 * 1024 * 1024 })

// A clean relative path, or '' when the entry must be skipped (absolute, "..", odd characters).
export function safePath(name) {
  const p = name.replace(/\\/g, '/')

  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p) || /[\u0000-\u001f]/.test(p)) return ''

  const parts = p.split('/').filter((x) => x && x !== '.')

  return parts.some((x) => x === '..') ? '' : parts.join('/')
}

// The files in a zip: [{ path, data }]. Throws with a reason a person can act on.
export function unzip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('this is not a zip file')

  // The end-of-central-directory record sits in the last 64 KiB (after an optional comment).
  let eocd = -1

  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }

  if (eocd < 0) throw new Error('this is not a zip file')

  const count = buf.readUInt16LE(eocd + 10)
  let at = buf.readUInt32LE(eocd + 16)

  if (count === 0xffff || at === 0xffffffff) throw new Error('zip64 archives are not supported')
  if (count > LIMITS.files) throw new Error(`the zip has more than ${LIMITS.files} files`)

  const files = []
  let total = 0

  for (let n = 0; n < count; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw new Error('the zip is damaged')

    const flags = buf.readUInt16LE(at + 8)
    const method = buf.readUInt16LE(at + 10)
    const compressed = buf.readUInt32LE(at + 20)
    const size = buf.readUInt32LE(at + 24)
    const nameLen = buf.readUInt16LE(at + 28)
    const extraLen = buf.readUInt16LE(at + 30)
    const commentLen = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', at + 46, at + 46 + nameLen)

    at += 46 + nameLen + extraLen + commentLen

    const path = safePath(name)

    if (!path || name.endsWith('/')) continue
    if (flags & 1) throw new Error('encrypted zips are not supported')
    if (size > LIMITS.file) continue // a skill file this big is not text worth keeping
    total += size
    if (total > LIMITS.bytes) throw new Error(`the zip unpacks to more than ${LIMITS.bytes / 1024 / 1024} MB`)
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('the zip is damaged')

    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(start, start + compressed)
    let data

    if (method === 0) data = Buffer.from(raw)
    else if (method === 8) data = inflateRawSync(raw, { maxOutputLength: LIMITS.file + 1 })
    else continue // other methods are rare; skip the file rather than fail the archive

    files.push({ path, data })
  }

  return files
}
