#!/usr/bin/env node
/**
 * Los datos del núcleo de reglas para correr los duelos automáticos en Node y en `vite serve` (las pruebas de src/app/auto, `npm run
 * test:auto` y el plugin `autoDataDev`): baja las bases de ProjectIgnis/BabelCDB que nombra el lock, las junta (`mergeCdbs`) en
 * CORE_DATA_DIR/cards.cdb y deja el clon de los scripts de Project Ignis (el mismo de `sync:effects`: CARD_SCRIPTS_DIR) en los commits de
 * `auto-data.lock.json`, los mismos con los que arma producción `scripts/build-auto-data.mjs` (así desarrollo y producción sirven lo mismo).
 * Nada de esto va al repo: el `.cdb` no tiene licencia y los scripts son AGPL. Se corre a mano: `npm run sync:core`.
 *
 * Subir de versión: `npm run sync:core -- --update-lock` reescribe el lock con el último commit de `master` de cada repo, las bases de
 * BabelCDB que se juntan y las cartas de preestreno que ya tienen passcode (por nombre, en YGOPRODeck), y después baja esos. No hay cron: lo
 * corre quien quiera datos nuevos, prueba la beta y commitea el lock; el próximo despliegue los usa.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mergeCdbs, readLock } from './build-auto-data.mjs'

const LOCK = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'auto-data.lock.json')
const CORE_DATA_DIR = process.env.CORE_DATA_DIR ?? path.join(os.tmpdir(), 'ygo-lab-core-data')
const CARD_SCRIPTS_REPO = 'https://github.com/ProjectIgnis/CardScripts.git'
const CARD_SCRIPTS_DIR = process.env.CARD_SCRIPTS_DIR ?? path.join(os.tmpdir(), 'ygo-lab-card-scripts')
const USER_AGENT = 'YGO Probability Lab sync (+https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab)'
/**
 * Las bases de BabelCDB que se juntan, en el orden en que ganan un id repetido: `cards.cdb` (las oficiales), las `release-*` (recién
 * salidas, con su passcode) y las `prerelease-*` (de preestreno, con un id provisorio). Quedan afuera las de Rush (otras reglas), las no
 * oficiales, las de habilidades y las de Goat.
 */
const RANK = [/^cards\.cdb$/, /^release-(?!.*rush).*\.cdb$/, /^prerelease-(?!.*rush).*\.cdb$/]
const rankOf = (name) => RANK.findIndex((pattern) => pattern.test(name))

async function main() {
  const updating = process.argv.includes('--update-lock')

  if (updating) await updateLock()
  const lock = readLock()

  mkdirSync(CORE_DATA_DIR, { recursive: true })
  // Se bajan y se juntan aparte, y después se renombra: una baja cortada no deja un .cdb roto.
  const temp = mkdtempSync(path.join(CORE_DATA_DIR, 'cdb-'))

  try {
    const files = await Promise.all(
      lock.BabelCDB.files.map(async (name) => {
        const response = await fetch(`https://raw.githubusercontent.com/ProjectIgnis/BabelCDB/${lock.BabelCDB.commit}/${name}`, { headers: { 'User-Agent': USER_AGENT } })

        if (!response.ok) throw new Error(`${name}: ${response.status} ${response.statusText}`)
        writeFileSync(path.join(temp, name), Buffer.from(await response.arrayBuffer()))
        return path.join(temp, name)
      }),
    )

    await mergeCdbs(files)
    if (updating) {
      lock.BabelCDB.released = await releasedPasscodes(files[0])
      writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
      console.log(`auto-data.lock.json: ${Object.keys(lock.BabelCDB.released).length} cartas de preestreno con passcode`)
    }
    await mergeCdbs(files.slice(0, 1), lock.BabelCDB.released)
    renameSync(files[0], path.join(CORE_DATA_DIR, 'cards.cdb'))
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  console.log(`cards.cdb ${lock.BabelCDB.commit.slice(0, 7)} (${lock.BabelCDB.files.join(', ')}) en ${CORE_DATA_DIR}`)

  const scripts = syncCardScripts(lock.CardScripts.commit)

  if (!existsSync(path.join(scripts.dir, 'constant.lua'))) throw new Error(`falta constant.lua en ${scripts.dir}`)
}

async function github(route) {
  const response = await fetch(`https://api.github.com/repos/ProjectIgnis/${route}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' } })

  if (!response.ok) throw new Error(`${route}: ${response.status} ${response.statusText}`)
  return response.json()
}

/** El último commit de `master` de cada repo, con su fecha, y las bases de BabelCDB de ese commit (`files`, en orden). Nada de datos. */
async function updateLock() {
  const lock = {}

  for (const repo of ['CardScripts', 'BabelCDB']) {
    const { sha, commit } = await github(`${repo}/commits/master`)

    lock[repo] = { commit: sha, date: commit.committer.date }
  }
  lock.BabelCDB.files = (await github(`BabelCDB/git/trees/${lock.BabelCDB.commit}`)).tree
    .map((entry) => entry.path)
    .filter((name) => rankOf(name) >= 0)
    .sort((a, b) => rankOf(a) - rankOf(b) || a.localeCompare(b))

  writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`auto-data.lock.json: CardScripts ${lock.CardScripts.commit.slice(0, 7)}, BabelCDB ${lock.BabelCDB.commit.slice(0, 7)} (${lock.BabelCDB.files.length} bases)`)
}

/**
 * Las cartas de preestreno (id de 9 cifras; ni fichas ni artes alternativos) que en YGOPRODeck ya tienen otro passcode, el que usan
 * nuestros decks: id provisorio → passcode, para que `mergeCdbs` las ascienda. Se buscan por nombre, de a 40.
 */
async function releasedPasscodes(file) {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(file, { readOnly: true })
  const exists = db.prepare('select 1 from datas where id = ?')
  const released = {}

  try {
    const rows = db.prepare('select d.id, t.name from datas d join texts t on t.id = d.id where d.id >= 100000000 and (d.type & 16384) = 0 and (d.alias = 0 or abs(d.alias - d.id) >= 20)').all()

    for (let at = 0; at < rows.length; at += 40) {
      const batch = rows.slice(at, at + 40)
      const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?name=${encodeURIComponent(batch.map((row) => row.name).join('|'))}`, { headers: { 'User-Agent': USER_AGENT } })
      // Si no encuentra ninguna contesta 400 con `{ error }`: no hay `data`.
      const passcodes = new Map(((await response.json()).data ?? []).map((card) => [card.name, card.id]))

      for (const { id, name } of batch) {
        const code = passcodes.get(name)

        if (code && code !== id && !exists.get(code)) released[id] = code
      }
    }
  } finally {
    db.close()
  }

  return released
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
