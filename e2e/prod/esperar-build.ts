// Si hay `EXPECT_SHA`, espera a que producción sirva ese commit: `/build.json` (lo escribe `scripts/write-build-id.mjs` en cada build).
// Sin `EXPECT_SHA` no espera y lo avisa. `buildSha` también lo usa el reporter.
const SUFFIX = 'YGOUltraLab-QA'
const baseUrl = () => process.env.BASE_URL || 'https://yu-gi-oh-probability-lab.vercel.app'

/** El `sha` que sirve el sitio, o `null` si no hay `/build.json` (hoy producción todavía no lo sirve) o no se pudo leer. */
export async function buildSha(): Promise<string | null> {
  try {
    const response = await fetch(new URL(`/build.json?t=${Date.now()}`, baseUrl()), { headers: { 'user-agent': SUFFIX, accept: 'application/json' }, signal: AbortSignal.timeout(10_000) })
    if (!response.ok) return null
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null && 'sha' in body && typeof body.sha === 'string' ? body.sha : null
  } catch {
    return null
  }
}

export default async function esperarBuild(): Promise<void> {
  const expected = process.env.EXPECT_SHA?.trim()
  if (!expected) {
    console.log('[qa] Sin EXPECT_SHA: no se espera el deploy, se prueba lo que haya publicado.')
    return
  }
  const deadline = Date.now() + 10 * 60_000
  let served: string | null
  for (;;) {
    served = await buildSha()
    if (served === expected) {
      console.log(`[qa] Producción sirve ${expected.slice(0, 7)}.`)
      return
    }
    if (Date.now() + 15_000 > deadline) break
    await new Promise((resolve) => setTimeout(resolve, 15_000))
  }
  throw new Error(`Producción no sirvió el commit ${expected.slice(0, 7)} en 10 minutos (sirve ${served ? served.slice(0, 7) : 'nada: no hay /build.json'}).`)
}
