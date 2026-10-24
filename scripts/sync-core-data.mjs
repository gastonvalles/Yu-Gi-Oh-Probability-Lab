#!/usr/bin/env node
/**
 * Los datos del núcleo de reglas para correr los duelos automáticos en Node y en `vite serve` (las pruebas de src/app/auto, `npm run
 * test:auto` y el plugin `autoDataDev`): baja `cards.cdb` de ProjectIgnis/BabelCDB a CORE_DATA_DIR y deja el clon de los scripts de
 * Project Ignis (el mismo de `sync:effects`: CARD_SCRIPTS_DIR) en los commits de `auto-data.lock.json`, los mismos con los que arma
 * producción `scripts/build-auto-data.mjs` (así desarrollo y producción sirven lo mismo). Nada de esto va al repo: el `.cdb` no tiene
 * licencia y los scripts son AGPL. Se corre a mano: `npm run sync:core`.
 *
 * Subir de versión: `npm run sync:core -- --update-lock` reescribe el lock con el último commit de `master` de cada repo y después baja
 * esos. No hay cron: lo corre quien quiera datos nuevos, prueba la beta y commitea el lock; el próximo despliegue los usa.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'auto-data.lock.json')
const CORE_DATA_DIR = process.env.CORE_DATA_DIR ?? path.join(os.tmpdir(), 'ygo-lab-core-data')
const CARD_SCRIPTS_REPO = 'https://github.com/ProjectIgnis/CardScripts.git'
const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'

async function main() {
  if (process.argv.includes('--update-lock')) await updateLock()
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'))

  mkdirSync(CORE_DATA_DIR, { recursive: true })
  const response = await fetch(`https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/${lock.BabelCDB.commit}/cards.cdb`, { headers: { 'User-Agent': USER_AGENT } })

  if (!response.ok) throw new Error(`cards.cdb: ${response.status} ${response.statusText}`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const target = path.join(CORE_DATA_DIR, 'cards.cdb')

  // A un archivo aparte y después se renombra: una baja cortada no deja un .cdb roto.
  writeFileSync(`${target}.part`, bytes)
  renameSync(`${target}.part`, target)
  console.log(`cards.cdb ${lock.BabelCDB.commit.slice(0, 7)} (${bytes.length} bytes) en ${CORE_DATA_DIR}`)

  const scripts = syncCardScripts(lock.CardScripts.commit)

  if (!existsSync(path.join(scripts.dir, 'constant.lua'))) throw new Error(`falta constant.lua en ${scripts.dir}`)
}

/** El último commit de `master` de cada repo, con su fecha: es todo lo que guarda el lock (nada de datos). */
async function updateLock() {
  const lock = {}

  for (const repo of ['CardScripts', 'BabelCDB']) {
    const response = await fetch(`https://api.github.com/repos/ProjectIgnis/${repo}/commits/master`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } })

    if (!response.ok) throw new Error(`${repo}: ${response.status} ${response.statusText}`)
    const { sha, commit } = await response.json()

    lock[repo] = { commit: sha, date: commit.committer.date }
  }

  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`auto-data.lock.json: CardScripts ${lock.CardScripts.commit.slice(0, 7)}, BabelCDB ${lock.BabelCDB.commit.slice(0, 7)}`)
}

/**
 * Deja el clon en ese commit (el `reset --hard` también devuelve los archivos que falten de la copia de trabajo). Un clon nuevo sale con LF:
 * el repo marca todo como texto y Git para Windows lo pasaría a CRLF, y los scripts no serían byte a byte los de producción (al núcleo le
 * da igual; un clon viejo con CRLF sigue andando).
 */
function syncCardScripts(commit) {
  const git = (...args) => execFileSync('git', args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' }).trim()

  if (!existsSync(path.join(CARD_SCRIPTS_DIR, '.git'))) git('clone', '-q', '--depth', '1', '--no-checkout', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', CARD_SCRIPTS_REPO, CARD_SCRIPTS_DIR)
  git('-C', CARD_SCRIPTS_DIR, 'fetch', '-q', '--depth', '1', 'origin', commit)
  git('-C', CARD_SCRIPTS_DIR, 'reset', '-q', '--hard', 'FETCH_HEAD')
  console.log(`Scripts de EDOPro ${commit.slice(0, 7)} en ${CARD_SCRIPTS_DIR}`)

  return { dir: CARD_SCRIPTS_DIR, commit }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
