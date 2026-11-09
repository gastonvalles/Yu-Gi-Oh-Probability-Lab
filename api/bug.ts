import {
  MAX_BODY_BYTES,
  clientKey,
  createGlobalLimiter,
  createRateLimiter,
  createRecentReports,
  isAllowedOrigin,
  issueBody,
  issueLabels,
  issueTitle,
  parseBugReport,
  reportFingerprint,
} from '../src/app/bug-report'

const UPSTREAM_TIMEOUT_MS = 8000
const DEFAULT_REPO = 'gastonvalles/Yu-Gi-Oh-Probability-Lab'
const REPO = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/
/** Para probar el camino completo contra un GitHub de mentira: sólo se acepta si apunta a la propia máquina, así el token nunca sale a otro host. */
const LOCAL_API = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/

const limit = createRateLimiter()
const limitAll = createGlobalLimiter()
const recent = createRecentReports<{ number: number; url: string }>()

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } })

/** Crea el issue; null si GitHub no contesta, tarda o dice que no (nunca se reenvía su respuesta). */
async function createIssue(token: string, payload: { title: string; body: string; labels: string[] }): Promise<{ number: number; url: string } | null> {
  const repo = REPO.test(process.env.GITHUB_BUG_REPO ?? '') ? process.env.GITHUB_BUG_REPO! : DEFAULT_REPO
  const base = LOCAL_API.test(process.env.GITHUB_BUG_API ?? '') ? process.env.GITHUB_BUG_API! : 'https://api.github.com'

  try {
    const response = await fetch(`${base}/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'YGOUltraLab-bug-report',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      redirect: 'error',
    })

    if (response.status !== 201) {
      // Sólo el código: ni el cuerpo de GitHub ni nada del pedido van al registro.
      console.error('bug-report: GitHub respondió', response.status)
      return null
    }
    const issue = (await response.json()) as { number?: unknown; html_url?: unknown }

    return Number.isInteger(issue.number) && typeof issue.html_url === 'string' && issue.html_url.startsWith('https://github.com/')
      ? { number: issue.number as number, url: issue.html_url }
      : null
  } catch (error) {
    console.error('bug-report: GitHub no contestó', error instanceof Error ? error.name : 'error')
    return null
  }
}

/**
 * Función de Vercel: un reporte de error de la página se vuelve un issue público de GitHub (`src/app/bug-report.ts`). Sin cuenta
 * de quien reporta; el token (`GITHUB_BUG_TOKEN`, Issues de este único repo) lo carga Gastón en Vercel y sin él contesta 503.
 * Sin `Access-Control-Allow-Origin`: un sitio ajeno no puede llamarla desde el navegador de nadie.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request.headers.get('origin'), request.headers.get('referer'))) return json(403, { error: 'forbidden' })
  if (!/^application\/json\s*(?:;|$)/i.test(request.headers.get('content-type') ?? '')) return json(415, { error: 'unsupported_media_type' })
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return json(413, { error: 'too_large' })
  const text = await request.text()

  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'too_large' })
  let raw: unknown

  try {
    raw = JSON.parse(text)
  } catch {
    return json(400, { error: 'invalid', field: 'body' })
  }
  const parsed = parseBugReport(raw)

  if (!parsed.ok) return json(400, { error: 'invalid', field: parsed.field })
  if (parsed.honeypot) return json(200, { ok: true })
  const token = process.env.GITHUB_BUG_TOKEN

  if (!token) return json(503, { error: 'not_configured' })
  const { report } = parsed
  const fingerprint = await reportFingerprint(report)
  const already = recent.get(fingerprint)

  if (already) return json(200, { ok: true, ...already })
  // Vercel pisa `x-forwarded-for` con la IP real; la llave sólo vive en la memoria del limitador.
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'
  // Primero el de la llave y después el de todos: así una llave ya frenada no gasta el balde común.
  const retryAfter = limit(clientKey(ip)) || limitAll()

  if (retryAfter > 0) return json(429, { error: 'rate_limited' }, { 'Retry-After': String(retryAfter) })
  const issue = await createIssue(token, { title: issueTitle(report), body: issueBody(report), labels: issueLabels(report) })

  if (!issue) return json(502, { error: 'upstream' })
  recent.remember(fingerprint, issue)

  return json(201, { ok: true, ...issue })
}

const methodNotAllowed = (): Response => json(405, { error: 'method_not_allowed' }, { Allow: 'POST' })

export { methodNotAllowed as DELETE, methodNotAllowed as GET, methodNotAllowed as HEAD, methodNotAllowed as OPTIONS, methodNotAllowed as PATCH, methodNotAllowed as PUT }
