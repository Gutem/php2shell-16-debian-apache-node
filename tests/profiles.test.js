import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versions = new Set(Array.from({ length: 16 }, (_, i) => `8.4.${i + 11}`))

test('repository has exactly 16 build profiles', () => {
  const files = readdirSync(join(root, 'profiles')).filter((f) => f.endsWith('.json') && !f.startsWith('._'))
  assert.equal(files.length, 16)
})

test('profiles are Debian/Apache only', () => {
  for (const file of readdirSync(join(root, 'profiles')).filter((f) => f.endsWith('.json') && !f.startsWith('._'))) {
    const data = JSON.parse(readFileSync(join(root, 'profiles', file), 'utf8'))
    const blob = JSON.stringify(data).toLowerCase()
    assert.ok(!blob.includes('alpine'), file)
    assert.ok(!blob.includes('nginx'), file)
    assert.ok(!blob.includes('fpm'), file)
    assert.equal(data.arch, 'amd64', file)
    assert.equal(data.sapi, 'apache2handler', file)
  }
})

test('covers the expected 16 versions', () => {
  const seen = new Set(
    readdirSync(join(root, 'profiles'))
      .filter((f) => f.endsWith('.json') && !f.startsWith('._'))
      .map((f) => JSON.parse(readFileSync(join(root, 'profiles', f), 'utf8')).version),
  )
  assert.deepEqual([...seen].sort(), [...versions].sort())
})

test('runner and engine are JavaScript', () => {
  assert.ok(readFileSync(join(root, 'run.js'), 'utf8').includes('#!/usr/bin/env node'))
  assert.ok(readFileSync(join(root, 'engine/pure_fixed.js'), 'utf8').includes('parseLeak'))
})
