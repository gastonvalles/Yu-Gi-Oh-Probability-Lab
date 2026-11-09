import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { GET, OPTIONS, POST } from '../../api/bug'

// Un valor de mentira: nunca un token real.
const TOKEN = 'test-token-no-es-real-123'
const SITE = 'https://yu-gi-oh-probability-lab.vercel.app'
let ipCounter = 0

/** Cada prueba usa su propia IP y su propio texto: el limitador y la memoria de repetidos viven en el módulo. */
function request(body: unknown, { origin = SITE, ip = `198.51.100.${++ipCounter}`, type = 'application/json', raw }: { origin?: string | null; ip?: string; type?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { 'content-type': type, 'x-forwarded-for': `${ip}, 10.0.0.1` }

  if (origin) headers.origin = origin
  return new Request(`${SITE}/api/bug`, { method: 'POST', headers, body: raw ?? JSON.stringify(body) })
}
const report = (que = `Se cuelga el Lab al sacar una carta ${Math.random()}`) => ({ area: 'Lab', que, hp: '' })
const created = (number = 7) => new Response(JSON.stringify({ number, html_url: `https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab/issues/${number}`, token: TOKEN }), { status: 201 })

let errors: ReturnType<typeof vi.spyOn>
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.stubEnv('GITHUB_BUG_TOKEN', TOKEN)
  vi.stubEnv('GITHUB_BUG_REPO', '')
  vi.stubEnv('GITHUB_BUG_API', '')
  fetchMock = vi.fn(async () => created())
  vi.stubGlobal('fetch', fetchMock)
  errors = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Ni la respuesta ni el registro llevan el token. */
async function expectNoToken(response: Response) {
  expect(await response.clone().text()).not.toContain(TOKEN)
  expect([...response.headers.values()].join(' ')).not.toContain(TOKEN)
  expect(JSON.stringify(errors.mock.calls)).not.toContain(TOKEN)
}

describe('POST /api/bug', () => {
  it('crea el issue con el token, los encabezados fijos y el texto neutralizado, y contesta 201 sin caché', async () => {
    const response = await POST(request({ ...report('@alguien mirá #1 <b>x</b> en el Lab'), entorno: { navegador: 'Chrome', sistema: 'Android' }, mail: 'x@y.z' }))

    expect(response.status).toBe(201)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    expect(await response.clone().json()).toEqual({ ok: true, number: 7, url: 'https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab/issues/7' })

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    const sent = JSON.parse(init.body as string)

    expect(url).toBe('https://api.github.com/repos/gastonvalles/Yu-Gi-Oh-Probability-Lab/issues')
    expect(init.method).toBe('POST')
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`)
    expect(headers.Accept).toBe('application/vnd.github+json')
    expect(headers['X-GitHub-Api-Version']).toBe('2022-11-28')
    expect(headers['User-Agent']).toBe('YGOUltraLab-bug-report')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(sent.title).toBe('[Lab] alguien mirá 1 b x /b en el Lab')
    expect(sent.labels).toEqual(['bug-reportado', 'area:lab'])
    expect(sent.body).toContain('```text\n@alguien mirá #1 <b>x</b> en el Lab\n```')
    expect(sent.body).toContain('- Navegador: Chrome')
    expect(sent.body).not.toMatch(/x@y\.z|198\.51\.100/)
    await expectNoToken(response)
  })

  it('el repo sale de GITHUB_BUG_REPO; la base de prueba sólo vale si es la propia máquina', async () => {
    vi.stubEnv('GITHUB_BUG_REPO', 'otro/repo')
    vi.stubEnv('GITHUB_BUG_API', 'http://127.0.0.1:5212')
    await POST(request(report()))
    vi.stubEnv('GITHUB_BUG_REPO', 'otro/repo/../../x')
    vi.stubEnv('GITHUB_BUG_API', 'https://evil.example')
    await POST(request(report()))

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['http://127.0.0.1:5212/repos/otro/repo/issues', 'https://api.github.com/repos/gastonvalles/Yu-Gi-Oh-Probability-Lab/issues'])
  })

  it('sin token: 503 not_configured y no llama a nadie', async () => {
    vi.stubEnv('GITHUB_BUG_TOKEN', '')
    const response = await POST(request(report()))

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('GitHub caído, lento o con otra respuesta: 502 upstream, sin su cuerpo ni el token', async () => {
    for (const failure of [
      async () => new Response(JSON.stringify({ message: `Bad credentials ${TOKEN}` }), { status: 401 }),
      async () => new Response('{}', { status: 201 }),
      async () => new Response('no es json', { status: 201 }),
      async () => new Response(JSON.stringify({ number: 1, html_url: 'https://evil.example/1' }), { status: 201 }),
      async () => {
        throw new DOMException(`timeout ${TOKEN}`, 'TimeoutError')
      },
    ]) {
      fetchMock.mockImplementationOnce(failure)
      const response = await POST(request(report()))

      expect(response.status).toBe(502)
      expect(await response.clone().json()).toEqual({ error: 'upstream' })
      await expectNoToken(response)
    }
  })

  it('el honeypot con algo contesta 200 sin crear nada', async () => {
    const response = await POST(request({ ...report(), hp: 'soy un bot' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valida: 400 con el campo; JSON roto, tipo de contenido y tamaño', async () => {
    const invalid = await POST(request({ ...report(), area: 'Admin' }))

    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: 'invalid', field: 'area' })
    expect((await POST(request(null, { raw: '{"area":' }))).status).toBe(400)
    expect((await POST(request(report(), { type: 'text/plain' }))).status).toBe(415)
    expect((await POST(request(report(), { type: 'application/jsonx' }))).status).toBe(415)
    expect((await POST(request({ ...report(), relleno: 'x'.repeat(13_000) }))).status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('otro origen, sin origen o con uno parecido: 403', async () => {
    for (const origin of ['https://evil.example', null, 'https://yu-gi-oh-probability-lab.vercel.app.evil.example']) {
      const response = await POST(request(report(), { origin }))

      expect(response.status).toBe(403)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
    expect((await POST(request(report(), { origin: 'http://localhost:5173' }))).status).toBe(201)
  })

  it('el mismo texto en poco tiempo es el mismo issue: no abre otro', async () => {
    const body = report()
    const first = await (await POST(request(body))).json()
    const again = await POST(request(body))

    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('el cuarto reporte en 10 minutos desde la misma IP: 429 con Retry-After, y la IP no sale a ningún lado', async () => {
    const ip = '203.0.113.99'
    const statuses = []

    for (let index = 0; index < 4; index++) statuses.push((await POST(request(report(), { ip }))).status)
    const limited = await POST(request(report(), { ip }))

    expect(statuses).toEqual([201, 201, 201, 429])
    expect(limited.headers.get('Retry-After')).toMatch(/^\d+$/)
    expect(await limited.json()).toEqual({ error: 'rate_limited' })
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(ip)
    expect(JSON.stringify(errors.mock.calls)).not.toContain(ip)
  })

  it('un content-length declarado enorme se corta sin leer el cuerpo', async () => {
    const text = vi.fn(async () => '{}')
    const huge = { headers: new Headers({ origin: SITE, 'content-type': 'application/json', 'content-length': '50000000' }), text } as unknown as Request
    const response = await POST(huge)

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'too_large' })
    expect(text).not.toHaveBeenCalled()
  })

  it('x-real-ip manda sobre x-forwarded-for, y sin Origin vale el Referer del propio sitio', async () => {
    const viaRealIp = (forwarded: string) =>
      new Request(`${SITE}/api/bug`, {
        method: 'POST',
        headers: { referer: `${SITE}/lab`, 'content-type': 'application/json', 'x-real-ip': '192.0.2.77', 'x-forwarded-for': forwarded },
        body: JSON.stringify(report()),
      })
    const statuses = []

    for (let index = 0; index < 4; index++) statuses.push((await POST(viaRealIp(`203.0.113.${200 + index}`))).status)
    expect(statuses).toEqual([201, 201, 201, 429])

    const foreign = new Request(`${SITE}/api/bug`, { method: 'POST', headers: { referer: 'https://evil.example/', 'content-type': 'application/json' }, body: JSON.stringify(report()) })

    expect((await POST(foreign)).status).toBe(403)
  })

  // Va al final de las que crean issues: deja el balde lleno (con la hora adelantada).
  it('el balde de todos: con 20 issues en la hora, el siguiente (de otra casa) espera con 429', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 3 * 60 * 60_000) // lo de las otras pruebas ya venció

    for (let index = 0; index < 20; index++) expect((await POST(request(report(), { ip: `2001:db8:${index + 100}::1` }))).status).toBe(201)
    const limited = await POST(request(report(), { ip: '2001:db8:999::1' }))

    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledTimes(20)
  })

  it('otros métodos: 405 con Allow', async () => {
    for (const handler of [GET, OPTIONS]) {
      const response = handler()

      expect(response.status).toBe(405)
      expect(response.headers.get('Allow')).toBe('POST')
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
    }
  })
})
