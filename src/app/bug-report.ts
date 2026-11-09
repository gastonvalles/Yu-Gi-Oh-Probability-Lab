/**
 * El reporte de un error que alguien manda desde la página sin cuenta (`api/bug.ts` lo convierte en un issue público de GitHub).
 * Todo lo que llega es de un desconocido: se valida contra listas cerradas y topes, y el texto libre va al issue dentro de un
 * bloque de código con una valla más larga que cualquier racha de backticks, así que no menciona a nadie, no enlaza otros issues
 * ni dibuja enlaces, HTML o imágenes. Sin mail, sin nombre, sin contacto, y la IP nunca sale de la memoria de la función.
 */

export const BUG_AREAS = ['Deck', 'Roles', 'Lab', 'Comparar', 'Jugar solo', 'Duelo', 'Datos', 'Otro'] as const
export type BugArea = (typeof BUG_AREAS)[number]

/** La etiqueta de cada área: fija, nunca sale del texto de la persona. */
const AREA_LABELS: Record<BugArea, string> = {
  Deck: 'area:deck',
  Roles: 'area:roles',
  Lab: 'area:lab',
  Comparar: 'area:comparar',
  'Jugar solo': 'area:jugar-solo',
  Duelo: 'area:duelo',
  Datos: 'area:datos',
  Otro: 'area:otro',
}
export const BUG_LABEL = 'bug-reportado'

/** Familias, no versiones: lo que se publica no tiene que servir para reconocer a nadie. */
export const BROWSER_FAMILIES = ['Chrome', 'Edge', 'Firefox', 'Safari', 'Samsung Internet', 'Opera', 'Otro'] as const
export const OS_FAMILIES = ['Android', 'iOS', 'Windows', 'macOS', 'Linux', 'ChromeOS', 'Otro'] as const

export const MAX_BODY_BYTES = 12 * 1024
const MIN_QUE = 10
const MAX_TEXT = 2000
const MAX_TITLE = 80
const LANG = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/
const BUILD = /^(?:[0-9a-f]{7,40}|local)$/

export interface BugEnv {
  navegador?: string
  sistema?: string
  idioma?: string
  build?: string
}

export interface BugReport {
  area: BugArea
  que: string
  esperaba?: string
  pasos?: string
  entorno?: BugEnv
}

export type BugParse = { ok: true; report: BugReport; honeypot: false } | { ok: true; honeypot: true } | { ok: false; field: string }

/**
 * Lo que no se ve o da vuelta el texto: controles (salvo salto y tabulación), DEL y C1, marcas de dirección (Trojan Source),
 * espacios de ancho cero y el BOM. El ZWJ (U+200D) se queda: arma los emojis compuestos.
 */
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B\u200C\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g

/** El texto limpio: saltos unificados, sin lo invisible y sin espacios a los costados. */
export function cleanText(text: string): string {
  return text.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(HIDDEN, '').trim()
}

const length = (text: string) => [...text].length

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') return null
  const text = cleanText(value)

  return length(text) > MAX_TEXT ? null : text || undefined
}

function parseEnv(value: unknown): BugEnv | undefined | null {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const env: BugEnv = {}
  const pick = (key: keyof BugEnv, ok: (text: string) => boolean): boolean => {
    const field = raw[key]

    if (field === undefined || field === null || field === '') return true
    if (typeof field !== 'string' || !ok(field)) return false
    env[key] = field

    return true
  }
  const valid =
    pick('navegador', (text) => (BROWSER_FAMILIES as readonly string[]).includes(text)) &&
    pick('sistema', (text) => (OS_FAMILIES as readonly string[]).includes(text)) &&
    pick('idioma', (text) => text.length <= 20 && LANG.test(text)) &&
    pick('build', (text) => BUILD.test(text))

  if (!valid) return null

  return Object.keys(env).length > 0 ? env : undefined
}

/** Valida el JSON del pedido; los campos de más se descartan. Un honeypot con algo es un bot: se le dice que sí y no se crea nada. */
export function parseBugReport(raw: unknown): BugParse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, field: 'body' }
  const body = raw as Record<string, unknown>

  if (body.hp !== undefined && body.hp !== null && body.hp !== '') return { ok: true, honeypot: true }
  if (typeof body.area !== 'string' || !(BUG_AREAS as readonly string[]).includes(body.area)) return { ok: false, field: 'area' }
  if (typeof body.que !== 'string') return { ok: false, field: 'que' }
  const que = cleanText(body.que)

  if (length(que) < MIN_QUE || length(que) > MAX_TEXT) return { ok: false, field: 'que' }
  const esperaba = optionalText(body.esperaba)

  if (esperaba === null) return { ok: false, field: 'esperaba' }
  const pasos = optionalText(body.pasos)

  if (pasos === null) return { ok: false, field: 'pasos' }
  const entorno = parseEnv(body.entorno)

  if (entorno === null) return { ok: false, field: 'entorno' }
  const report: BugReport = { area: body.area as BugArea, que }

  if (esperaba) report.esperaba = esperaba
  if (pasos) report.pasos = pasos
  if (entorno) report.entorno = entorno

  return { ok: true, report, honeypot: false }
}

/** El texto dentro de un bloque de código cuya valla es más larga que la racha de backticks más larga del texto: nada de adentro lo cierra. */
export function fenced(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))

  return `${fence}text\n${text}\n${fence}`
}

/** Una línea: el área y el comienzo de `que`, sin `@`, `#`, backticks ni `<>` (ni menciones, ni referencias, ni HTML), hasta 80. */
export function issueTitle(report: BugReport): string {
  const line = report.que
    .split('\n')[0]!
    .replace(/[@#`<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const title = `[${report.area}] ${line || 'Reporte'}`
  const chars = [...title]

  return chars.length <= MAX_TITLE ? title : `${chars.slice(0, MAX_TITLE - 1).join('').trimEnd()}…`
}

export const issueLabels = (report: BugReport): string[] => [BUG_LABEL, AREA_LABELS[report.area]]

export const BUG_FOOTER = 'Reportado desde la página (sin cuenta)'

/** El cuerpo del issue. Lo único fuera de un bloque de código sale de listas cerradas o patrones (área y entorno). */
export function issueBody(report: BugReport): string {
  const parts = [`**Área:** ${report.area}`, '### Qué pasó', fenced(report.que)]

  if (report.esperaba) parts.push('### Qué esperaba', fenced(report.esperaba))
  if (report.pasos) parts.push('### Pasos', fenced(report.pasos))
  if (report.entorno) {
    const { navegador, sistema, idioma, build } = report.entorno
    const lines = [navegador && `- Navegador: ${navegador}`, sistema && `- Sistema: ${sistema}`, idioma && `- Idioma: ${idioma}`, build && `- Build: ${build}`]

    parts.push('### Entorno', lines.filter(Boolean).join('\n'))
  }
  parts.push('---', `_${BUG_FOOTER}_`)

  return parts.join('\n\n')
}

const PRODUCTION_HOST = 'yu-gi-oh-probability-lab.vercel.app'
const PREVIEW_HOST = /^yu-gi-oh-probability-lab-[a-z0-9-]+-gastonvalles-projects\.vercel\.app$/
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1'])

/** Sólo el propio sitio (producción, sus vistas previas y localhost) puede mandar reportes; se mira `Origin` y, si falta, `Referer`. */
export function isAllowedOrigin(origin: string | null, referer: string | null): boolean {
  const source = origin ?? referer

  if (!source) return false
  let url: URL

  try {
    url = new URL(source)
  } catch {
    return false
  }
  if (LOCAL_HOSTS.has(url.hostname)) return url.protocol === 'http:' || url.protocol === 'https:'

  return url.protocol === 'https:' && url.port === '' && (url.hostname === PRODUCTION_HOST || PREVIEW_HOST.test(url.hostname))
}

/** La llave del límite: la IPv4 entera y, en IPv6, el /64 (una casa tiene millones de direcciones y rotarlas es gratis). */
export function clientKey(ip: string): string {
  const address = ip.trim().toLowerCase()

  if (!address.includes(':')) return address
  if (address.includes('.')) return address.slice(address.lastIndexOf(':') + 1) // IPv4 dentro de IPv6 (::ffff:1.2.3.4)
  const [head = '', tail] = address.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const groups = tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right]

  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

const MINUTE = 60_000
const WINDOW_MS = 10 * MINUTE
const WINDOW_MAX = 3
const DAY_MS = 24 * 60 * MINUTE
const DAY_MAX = 10
const MAX_KEYS = 5000

/**
 * Hasta 3 reportes cada 10 minutos y 10 por día por llave (`clientKey`). Devuelve 0 si pasa (y lo cuenta) o los segundos que faltan.
 * Las llaves viven sólo en memoria y se barren a las 24 h; nunca se escriben.
 * ponytail: límite por instancia de la función; se resetea al reciclarse y cada instancia cuenta aparte. Si llega spam de verdad,
 * subir a una regla del Firewall de Vercel sobre /api/bug o a un contador en KV.
 */
export function createRateLimiter(now: () => number = Date.now): (key: string) => number {
  const hits = new Map<string, number[]>()
  let lastSweep = 0

  return (key) => {
    const at = now()

    if (at - lastSweep > MINUTE) {
      for (const [old, list] of hits) if (list.at(-1)! <= at - DAY_MS) hits.delete(old)
      lastSweep = at
    }
    const today = (hits.get(key) ?? []).filter((hit) => hit > at - DAY_MS)
    const recent = today.filter((hit) => hit > at - WINDOW_MS)

    if (recent.length >= WINDOW_MAX) return Math.ceil((recent[0]! + WINDOW_MS - at) / 1000)
    if (today.length >= DAY_MAX) return Math.ceil((today[0]! + DAY_MS - at) / 1000)
    // Con la tabla llena (una lluvia de direcciones), una llave nueva espera: se prefiere frenar a quedarse sin memoria.
    if (!hits.has(key) && hits.size >= MAX_KEYS) return 60
    hits.set(key, [...today, at])

    return 0
  }
}

/** Lo ya enviado en los últimos 10 minutos, por huella del texto: el mismo reporte dos veces (un doble toque, un bot) no abre dos issues. */
export function createRecentReports<T>(now: () => number = Date.now, max = 500) {
  const seen = new Map<string, { at: number; value: T }>()

  return {
    get(key: string): T | undefined {
      const entry = seen.get(key)

      return entry && entry.at > now() - WINDOW_MS ? entry.value : undefined
    },
    remember(key: string, value: T): void {
      seen.delete(key)
      seen.set(key, { at: now(), value })
      if (seen.size > max) seen.delete(seen.keys().next().value!)
    },
  }
}

/** La huella del texto (SHA-256): lo que se recuerda no es el reporte. */
export async function reportFingerprint(report: BugReport): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([report.area, report.que, report.esperaba ?? '', report.pasos ?? '']))
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
