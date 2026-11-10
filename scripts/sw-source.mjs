import { createHash } from 'node:crypto'

/**
 * Si la plantilla está en modo apagado (el botón de pánico de `src/sw.js`): el build se lo pasa a `src/main.tsx` (`import.meta.env.VITE_SW_OFF`), que en vez de
 * registrar el service worker desregistra el que haya. Sin eso, la página volvería a registrar el apagado en cada visita.
 *
 * @param {string} template
 */
export const serviceWorkerOff = (template) => /^const OFF = true$/m.test(template)

/**
 * Se sube a mano para forzar una versión nueva del service worker sin cambiar ningún archivo de la lista: por ejemplo, tras cambiar sólo cabeceras en vercel.json
 * (la CSP), que no cambian ni la lista ni la plantilla.
 */
export const GENERATION = 1

const sha256 = (/** @type {string | Uint8Array} */ data) => createHash('sha256').update(data).digest('hex')

/**
 * El `sw.js` del build (lo usa el plugin `serviceWorker` de vite.config.ts): la plantilla `src/sw.js` con lo que precachea escrito en los bytes, como
 * `{ ruta: sha256 }` (el SHA-256 del contenido de lo que no lleva hash en el nombre, que `install` verifica; `null` para lo de `/assets`, cuyo nombre ya es su hash),
 * y su versión: el hash de esa lista, de la plantilla misma y de `generation`. Si algo cambia, cambian los bytes y el navegador instala la versión nueva. Si la
 * plantilla perdió un marcador, tira: mejor un build roto que un service worker sin lista.
 *
 * @param {string} template
 * @param {ReadonlyArray<{ path: string, content?: string | Uint8Array }>} files
 * @param {number} [generation]
 * @returns {string}
 */
export function serviceWorkerSource(template, files, generation = GENERATION) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const list = Object.fromEntries(sorted.map((file) => [file.path, file.content === undefined ? null : sha256(file.content)]))
  const version = sha256(`${generation}\n${template}\n${JSON.stringify(list)}`).slice(0, 12)

  /** @param {string} code @param {string} from @param {string} to */
  const fill = (code, from, to) => {
    if (code.split(from).length !== 2) throw new Error(`src/sw.js: expected exactly one "${from}"`)
    return code.replace(from, () => to)
  }

  return fill(fill(template, "const VERSION = 'dev'", `const VERSION = '${version}'`), 'const FILES = {}', `const FILES = ${JSON.stringify(list)}`)
}
