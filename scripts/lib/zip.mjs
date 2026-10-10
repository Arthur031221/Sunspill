// Reading a zip file in memory: the entries that are stored or deflated, which is every zip this project meets.
// The deals data comes as a zip of CSV files, and Node has no zip reader of its own.

import { inflateRawSync } from 'node:zlib'

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50

/**
 * @param {Buffer} buffer the whole zip
 * @param {(name:string) => boolean} [wanted] which files to open, all of them by default
 * @returns {Map<string, Buffer>} the contents of each file, by its name
 */
export function readZip(buffer, wanted = () => true) {
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('not a zip file')
  const count = buffer.readUInt16LE(end + 10)
  let at = buffer.readUInt32LE(end + 16)
  const files = new Map()
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(at) !== CENTRAL) throw new Error('damaged zip directory')
    const method = buffer.readUInt16LE(at + 10)
    const size = buffer.readUInt32LE(at + 20)
    const nameLength = buffer.readUInt16LE(at + 28)
    const extraLength = buffer.readUInt16LE(at + 30)
    const commentLength = buffer.readUInt16LE(at + 32)
    const offset = buffer.readUInt32LE(at + 42)
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength)
    at += 46 + nameLength + extraLength + commentLength
    if (name.endsWith('/') || !wanted(name)) continue
    if (buffer.readUInt32LE(offset) !== LOCAL) throw new Error(`damaged zip entry ${name}`)
    const start = offset + 30 + buffer.readUInt16LE(offset + 26) + buffer.readUInt16LE(offset + 28)
    const data = buffer.subarray(start, start + size)
    if (method === 0) files.set(name, Buffer.from(data))
    else if (method === 8) files.set(name, inflateRawSync(data))
    else throw new Error(`zip entry ${name} is compressed in a way that is not read here (${method})`)
  }
  return files
}
