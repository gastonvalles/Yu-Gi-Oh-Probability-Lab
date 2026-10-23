#!/usr/bin/env node
/**
 * Los datos del núcleo de reglas para correr los duelos automáticos en Node (las pruebas de src/app/auto y `npm run test:auto`): baja
 * `cards.cdb` de ProjectIgnis/BabelCDB a CORE_DATA_DIR y deja al día el clon de los scripts de Project Ignis (el mismo de `sync:effects`:
 * CARD_SCRIPTS_DIR). Nada de esto va al repo: el `.cdb` no tiene licencia y los scripts son AGPL. Se corre a mano: `npm run sync:core`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CDB_URL = 'https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/master/cards.cdb'
const CORE_DATA_DIR = process.env.CORE_DATA_DIR ?? path.join(os.tmpdir(), 'ygo-lab-core-data')
const CARD_SCRIPTS_REPO = 'https://github.com/ProjectIgnis/CardScripts.git'
const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'

async function main() {
  mkdirSync(CORE_DATA_DIR, { recursive: true })
  const response = await fetch(CDB_URL, { headers: { 'User-Agent': USER_AGENT } })

  if (!response.ok) throw new Error(`cards.cdb: ${response.status} ${response.statusText}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const target = path.join(CORE_DATA_DIR, 'cards.cdb')

  // A un archivo aparte y después se renombra: una baja cortada no deja un .cdb roto.
  writeFileSync(`${target}.part`, bytes)
  renameSync(`${target}.part`, target)
  console.log(`cards.cdb (${bytes.length} bytes) en ${CORE_DATA_DIR}`)

  const scripts = syncCardScripts()

  if (!existsSync(path.join(scripts.dir, 'constant.lua'))) throw new Error(`falta constant.lua en ${scripts.dir}`)
}

/** Clona los scripts, o los pone al día si ya están (el `reset --hard` también devuelve los archivos que falten de la copia de trabajo). */
function syncCardScripts() {
  const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim()

  if (existsSync(path.join(CARD_SCRIPTS_DIR, '.git'))) {
    git('-C', CARD_SCRIPTS_DIR, 'fetch', '-q', '--depth', '1', 'origin', 'master')
    git('-C', CARD_SCRIPTS_DIR, 'reset', '-q', '--hard', 'FETCH_HEAD')
  } else {
    git('clone', '-q', '--depth', '1', '--single-branch', '--branch', 'master', CARD_SCRIPTS_REPO, CARD_SCRIPTS_DIR)
  }

  const commit = git('-C', CARD_SCRIPTS_DIR, 'rev-parse', '--short', 'HEAD')
  console.log(`Scripts de EDOPro ${commit} en ${CARD_SCRIPTS_DIR}`)

  return { dir: CARD_SCRIPTS_DIR, commit }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
