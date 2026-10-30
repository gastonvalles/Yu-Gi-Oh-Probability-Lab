import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, posix } from 'node:path'

/**
 * La privacidad del bot, capa 1 (estructural): `src/app/auto/bot/` no alcanza con valores la sesión, el anfitrión, el árbitro, el adaptador ni las barajas, así que no puede leer el
 * estado del anfitrión ni la semilla del duelo (el tipo `Bot` tampoco los recibe). La capa 2 (lo que ve: `botViewOf`) está en `auto-bot.test.ts` y la 3 (con el núcleo real), en
 * `auto-bot-privacy.slow.test.ts`.
 */

const ROOT = join(__dirname, '..', '..')
/** Como en `auto-isolation.test.ts`: una importación relativa con valores (un `import type` se borra al compilar). */
const VALUE_IMPORT = /(?:(?:import|export)\s+(?!type\s)[^'"]*?from\s+|import\(\s*)['"](\.{1,2}\/[^'"]*)['"]/g
const resolve = (target: string) => [`${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((file) => existsSync(join(ROOT, file)))

describe('el bot sólo ve lo de su asiento: lo que importa', () => {
  it('estructural: nada de src/app/auto/bot llega con valores a la sesión, al anfitrión, al árbitro, al adaptador ni a las barajas (ni a ocgcore-wasm)', () => {
    const start = readdirSync(join(ROOT, 'src/app/auto/bot')).map((name) => `src/app/auto/bot/${name}`)
    const seen = new Set<string>()
    const queue = [...start]

    // Todo lo que alcanza con valores, de archivo en archivo.
    while (queue.length > 0) {
      const file = queue.pop()!

      if (seen.has(file)) continue
      seen.add(file)
      const text = readFileSync(join(ROOT, file), 'utf8')

      expect(text, file).not.toMatch(/(?:from\s+|import\(\s*)['"]ocgcore-wasm/)
      for (const match of text.matchAll(VALUE_IMPORT)) {
        const next = resolve(posix.join(posix.dirname(file), match[1]!))

        if (next) queue.push(next)
      }
    }
    const forbidden = ['auto-session', 'core-host', 'core-host.worker', 'referee', 'adapter', 'deck-map', 'online', 'online-protocol', 'online-resume', 'resume', 'auto-data'].map((name) => `src/app/auto/${name}.ts`)
    // `duel-key` llega sólo por `protocol` (que valida el formato de una clave: `isDuelKey`): del bot, nunca directo.
    const direct = start.flatMap((file) => [...readFileSync(join(ROOT, file), 'utf8').matchAll(VALUE_IMPORT)].map((match) => resolve(posix.join(posix.dirname(file), match[1]!))))

    expect([...seen].filter((file) => forbidden.includes(file))).toEqual([])
    expect(direct.filter((file) => file !== 'src/app/auto/policies.ts' && !file?.startsWith('src/app/auto/bot/'))).toEqual([])
    expect(seen).toContain('src/app/auto/policies.ts')
  })

})
