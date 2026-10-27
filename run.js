#!/usr/bin/env node
/**
 * Profile-aware runner for the 18 Debian/Apache 8.4 chains.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { main } from './engine/pure_fixed.js'

const here = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)

let version = '8.4.26'
const forward = []
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--version') {
    version = args[i + 1]
    i += 1
  } else if (args[i] === '-h' || args[i] === '--help') {
    console.log(`uso: ./run.js --version 8.4.26 [--host 127.0.0.1] [--port 19300]
             [--proof out/p1] [--cmd 'id>/out/p1'] [--retries 4] [--probes 6]`)
    process.exit(0)
  } else {
    forward.push(args[i])
  }
}

const profilePath = join(here, 'profiles', `${version}.json`)
let profile
try {
  profile = JSON.parse(readFileSync(profilePath, 'utf8'))
} catch (error) {
  console.error(`perfil nao encontrado ou invalido: ${profilePath}`)
  process.exit(2)
}

const withDefaults = [
  '--zif-off',
  profile.symbols.zif_system,
  '--dtor-off',
  profile.symbols.zval_ptr_dtor,
  '--s-off',
  profile.layout.s_off,
  '--blockers',
  String(profile.requirements?.blockers ?? 149),
  '--proof',
  'out/p1',
  ...forward,
]

main(withDefaults).then((code) => process.exit(code)).catch((error) => {
  console.error(error)
  process.exit(2)
})
