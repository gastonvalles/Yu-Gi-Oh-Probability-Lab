import { BROWSER_FAMILIES, BUG_AREAS, cleanText, MAX_BODY_BYTES, OS_FAMILIES, type BugArea, type BugEnv } from './bug-report'

/**
 * La lógica del paso «Reportar un problema» (`#reportar`): el borrador, la validación antes de enviar, qué datos del navegador se mandan y qué quiere decir cada
 * respuesta de `POST /api/bug`. El contrato (áreas, familias, topes) sale de `bug-report.ts`: acá no se copia ninguna lista.
 */

/** Los topes de `bug-report.ts` (no se exportan): `reportar.test.ts` los compara contra `parseBugReport`, así que un cambio allá rompe el test. */
export const MIN_QUE = 10
export const MAX_TEXT = 2000
export const REPORT_TIMEOUT_MS = 15_000

export type BrowserFamily = (typeof BROWSER_FAMILIES)[number]
export type OsFamily = (typeof OS_FAMILIES)[number]

/** La familia del navegador por su marca en el User-Agent, nunca la versión. El orden importa: Edge, Opera y Samsung también dicen «Chrome». */
export function detectBrowser(userAgent: string): BrowserFamily {
  const family: BrowserFamily =
    /SamsungBrowser/.test(userAgent) ? 'Samsung Internet'
    : /Edg(?:e|A|iOS)?\//.test(userAgent) ? 'Edge'
    : /OPR\/|OPiOS|Opera/.test(userAgent) ? 'Opera'
    : /Firefox\/|FxiOS/.test(userAgent) ? 'Firefox'
    : /Chrome\/|CriOS/.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) && /Version\//.test(userAgent) ? 'Safari'
    : 'Otro'

  return family
}

/** La familia del sistema. Un iPad con iPadOS se presenta como Mac: lo delata la pantalla táctil. */
export function detectOs(userAgent: string, maxTouchPoints = 0): OsFamily {
  const family: OsFamily =
    /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1) ? 'iOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /CrOS/.test(userAgent) ? 'ChromeOS'
    : /Macintosh|Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : 'Otro'

  return family
}

/** El idioma con a lo sumo su región («es-AR»); cualquier otra cosa no se manda. */
export function reportLanguage(language: string | undefined): string | undefined {
  try {
    const locale = new Intl.Locale(language ?? '')

    return /^[a-z]{2,3}$/.test(locale.language) ? [locale.language, locale.region].filter(Boolean).join('-') : undefined
  } catch {
    return undefined
  }
}

/** La versión de la página: los 7 primeros caracteres del commit de `/build.json` (en local no hay archivo y no se manda). */
export function reportBuild(json: unknown): string | undefined {
  const sha = typeof json === 'object' && json !== null ? (json as { sha?: unknown }).sha : undefined

  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : undefined
}

/** Lo que se manda del navegador, todo de listas cerradas o patrones. */
export function detectEnv({ userAgent, maxTouchPoints, language, build }: { userAgent: string; maxTouchPoints?: number; language?: string; build?: string }): BugEnv {
  const env: BugEnv = { navegador: detectBrowser(userAgent), sistema: detectOs(userAgent, maxTouchPoints) }
  const idioma = reportLanguage(language)

  if (idioma) env.idioma = idioma
  if (build) env.build = build

  return env
}

export interface ReportDraft {
  area: BugArea | ''
  que: string
  esperaba: string
  pasos: string
  includeEnv: boolean
}

export const EMPTY_DRAFT: ReportDraft = { area: '', que: '', esperaba: '', pasos: '', includeEnv: true }
export const REPORT_DRAFT_KEY = 'ygo-lab:bug-draft'

const isArea = (value: unknown): value is BugArea => BUG_AREAS.includes(value as BugArea)

/** El borrador guardado; sin almacenamiento o con algo roto, uno vacío. */
export function readDraft(storage: () => Storage = () => localStorage): ReportDraft {
  try {
    const raw: unknown = JSON.parse(storage().getItem(REPORT_DRAFT_KEY) ?? 'null')

    if (typeof raw !== 'object' || raw === null) return EMPTY_DRAFT
    const saved = raw as Record<string, unknown>
    const text = (value: unknown) => (typeof value === 'string' ? value : '')

    return {
      area: isArea(saved.area) ? saved.area : '',
      que: text(saved.que),
      esperaba: text(saved.esperaba),
      pasos: text(saved.pasos),
      includeEnv: saved.includeEnv !== false,
    }
  } catch {
    return EMPTY_DRAFT
  }
}

/** Guarda el borrador; uno vacío borra la clave. Si no se puede, sigue igual. */
export function writeDraft(draft: ReportDraft, storage: () => Storage = () => localStorage): void {
  try {
    const empty = !draft.area && !draft.que && !draft.esperaba && !draft.pasos

    if (empty) storage().removeItem(REPORT_DRAFT_KEY)
    else storage().setItem(REPORT_DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // Sin almacenamiento (modo privado, cuota llena): el formulario anda igual, sólo no sobrevive a una recarga.
  }
}

// i18n-ignore: los nombres de campo del contrato de /api/bug
export type ReportField = 'que' | 'esperaba' | 'pasos' | 'area'
export type FieldError = { kind: 'empty' } | { kind: 'short' } | { kind: 'long'; over: number }
export type ReportErrors = Partial<Record<ReportField, FieldError>>

/** En el orden en que se ven: el foco va al primero que falla. */
// i18n-ignore: los nombres de campo del contrato de /api/bug
export const REPORT_FIELDS: readonly ReportField[] = ['que', 'esperaba', 'pasos', 'area']

export const textLength = (text: string): number => [...cleanText(text)].length

/** Lo que falta o sobra, campo por campo, con las mismas cuentas que el servidor (texto limpio, por caracteres). */
export function validateDraft(draft: ReportDraft): ReportErrors {
  const errors: ReportErrors = {}
  const que = textLength(draft.que)

  if (que === 0) errors.que = { kind: 'empty' }
  else if (que < MIN_QUE) errors.que = { kind: 'short' }
  else if (que > MAX_TEXT) errors.que = { kind: 'long', over: que - MAX_TEXT }
  // i18n-ignore: los nombres de campo del contrato de /api/bug
  for (const field of ['esperaba', 'pasos'] as const) {
    const length = textLength(draft[field])

    if (length > MAX_TEXT) errors[field] = { kind: 'long', over: length - MAX_TEXT }
  }
  if (!draft.area) errors.area = { kind: 'empty' }

  return errors
}

/** El cuerpo del pedido. Sin `entorno` si la persona lo apagó; `hp` es el honeypot (vacío salvo para un bot). */
export function reportBody(draft: ReportDraft, env: BugEnv | null, hp = ''): string {
  return JSON.stringify({
    area: draft.area,
    que: draft.que,
    ...(draft.esperaba.trim() ? { esperaba: draft.esperaba } : {}),
    ...(draft.pasos.trim() ? { pasos: draft.pasos } : {}),
    ...(draft.includeEnv && env ? { entorno: env } : {}),
    hp,
  })
}

export const isTooLarge = (body: string): boolean => new TextEncoder().encode(body).length > MAX_BODY_BYTES

export type ReportResult =
  | { kind: 'sent'; number?: number; url?: string }
  | { kind: 'rate-limited'; minutes: number }
  /** 503 `not_configured`, 404 (en desarrollo no hay función), 403 o 405: desde acá no se puede, se ofrece GitHub. */
  | { kind: 'unavailable' }
  | { kind: 'upstream' }
  | { kind: 'invalid'; field?: ReportField }
  | { kind: 'too-large' }
  | { kind: 'network' }

/** Qué quiere decir una respuesta de `POST /api/bug`. */
export async function readReportResponse(response: Response): Promise<ReportResult> {
  const json = (await response.json().catch(() => null)) as { number?: unknown; url?: unknown; field?: unknown } | null

  if (response.status === 200 || response.status === 201) {
    const number = Number.isInteger(json?.number) ? (json!.number as number) : undefined
    const url = typeof json?.url === 'string' && json.url.startsWith('https://github.com/') ? json.url : undefined

    return number && url ? { kind: 'sent', number, url } : { kind: 'sent' }
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('Retry-After'))

    return { kind: 'rate-limited', minutes: Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds / 60) : 10 }
  }
  if (response.status === 413) return { kind: 'too-large' }
  if (response.status === 400) {
    const field = REPORT_FIELDS.find((name) => name === json?.field)

    return field ? { kind: 'invalid', field } : { kind: 'invalid' }
  }
  if (response.status === 415) return { kind: 'invalid' }
  if (response.status >= 500 && response.status !== 503) return { kind: 'upstream' }

  // 503 `not_configured`, 404, 403, 405: desde acá no hay cómo.
  return { kind: 'unavailable' }
}

/** Manda el reporte. Nunca tira: sin red o pasados 15 s, `network`. */
export async function sendReport(body: string, request: typeof fetch = fetch): Promise<ReportResult> {
  try {
    const response = await request('/api/bug', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(REPORT_TIMEOUT_MS) })

    return await readReportResponse(response)
  } catch {
    return { kind: 'network' }
  }
}
