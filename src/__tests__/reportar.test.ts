import { describe, expect, it, vi } from 'vitest'

import { BROWSER_FAMILIES, OS_FAMILIES, parseBugReport } from '../app/bug-report'
import {
  detectBrowser,
  detectEnv,
  detectOs,
  EMPTY_DRAFT,
  MAX_TEXT,
  MIN_QUE,
  readDraft,
  readReportResponse,
  REPORT_DRAFT_KEY,
  reportBody,
  reportBuild,
  reportLanguage,
  sendReport,
  validateDraft,
  writeDraft,
} from '../app/reportar'

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  operaMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 OPR/115.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  ipadOs: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
}

const memory = () => {
  const map = new Map<string, string>()
  const storage = { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key) } as Storage

  return { map, storage: () => storage }
}

const answer = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })

describe('reportar: el entorno', () => {
  it('detecta la familia del navegador y del sistema sin versiones, siempre dentro de las listas del endpoint', () => {
    expect([detectBrowser(UA.chromeWin), detectOs(UA.chromeWin)]).toEqual(['Chrome', 'Windows'])
    expect([detectBrowser(UA.edgeWin), detectOs(UA.edgeWin)]).toEqual(['Edge', 'Windows'])
    expect([detectBrowser(UA.operaMac), detectOs(UA.operaMac)]).toEqual(['Opera', 'macOS'])
    expect([detectBrowser(UA.firefoxLinux), detectOs(UA.firefoxLinux)]).toEqual(['Firefox', 'Linux'])
    expect([detectBrowser(UA.safariIphone), detectOs(UA.safariIphone)]).toEqual(['Safari', 'iOS'])
    expect([detectBrowser(UA.chromeIphone), detectOs(UA.chromeIphone)]).toEqual(['Chrome', 'iOS'])
    expect([detectBrowser(UA.samsung), detectOs(UA.samsung)]).toEqual(['Samsung Internet', 'Android'])
    expect([detectBrowser(UA.chromebook), detectOs(UA.chromebook)]).toEqual(['Chrome', 'ChromeOS'])
    // Un iPad con iPadOS dice «Macintosh»: lo delata el toque.
    expect(detectOs(UA.ipadOs, 5)).toBe('iOS')
    expect(detectOs(UA.ipadOs, 0)).toBe('macOS')
    expect([detectBrowser('curl/8'), detectOs('curl/8')]).toEqual(['Otro', 'Otro'])
    for (const ua of Object.values(UA)) {
      expect(BROWSER_FAMILIES).toContain(detectBrowser(ua))
      expect(OS_FAMILIES).toContain(detectOs(ua))
    }
  })

  it('el idioma, a lo sumo con su región, y la versión, los 7 primeros del commit', () => {
    expect(reportLanguage('es-AR')).toBe('es-AR')
    expect(reportLanguage('en')).toBe('en')
    expect(reportLanguage('zh-Hant-TW')).toBe('zh-TW')
    expect(reportLanguage('x-pirate')).toBeUndefined()
    expect(reportLanguage(undefined)).toBeUndefined()
    expect(reportBuild({ sha: 'e920a300aabbccddeeff00112233445566778899' })).toBe('e920a30')
    expect(reportBuild({ sha: 'local' })).toBeUndefined()
    expect(reportBuild('<!doctype html>')).toBeUndefined()
  })

  it('lo que arma pasa la validación del endpoint', () => {
    const entorno = detectEnv({ userAgent: UA.samsung, language: 'es-AR', build: 'e920a30' })

    expect(entorno).toEqual({ navegador: 'Samsung Internet', sistema: 'Android', idioma: 'es-AR', build: 'e920a30' })
    expect(parseBugReport(JSON.parse(reportBody({ ...EMPTY_DRAFT, area: 'Lab', que: 'El anillo no se mueve' }, entorno)))).toMatchObject({ ok: true, report: { entorno } })
  })
})

describe('reportar: validación y cuerpo', () => {
  it('los topes son los del endpoint (no se exportan allá: si cambian, esto se rompe)', () => {
    const report = (que: string) => parseBugReport({ area: 'Otro', que }).ok

    expect([report('a'.repeat(MIN_QUE - 1)), report('a'.repeat(MIN_QUE)), report('a'.repeat(MAX_TEXT)), report('a'.repeat(MAX_TEXT + 1))]).toEqual([false, true, true, false])
    expect(parseBugReport({ area: 'Otro', que: 'a'.repeat(MIN_QUE), pasos: 'a'.repeat(MAX_TEXT + 1) })).toEqual({ ok: false, field: 'pasos' })
  })

  it('marca lo que falta o sobra contando como el servidor (sin espacios ni invisibles)', () => {
    expect(validateDraft(EMPTY_DRAFT)).toEqual({ que: { kind: 'empty' }, area: { kind: 'empty' } })
    expect(validateDraft({ ...EMPTY_DRAFT, area: 'Lab', que: '   corto​   ' })).toEqual({ que: { kind: 'short' } })
    expect(validateDraft({ ...EMPTY_DRAFT, area: 'Lab', que: 'a'.repeat(MAX_TEXT + 3), esperaba: 'b'.repeat(MAX_TEXT + 1) })).toEqual({ que: { kind: 'long', over: 3 }, esperaba: { kind: 'long', over: 1 } })
    expect(validateDraft({ ...EMPTY_DRAFT, area: 'Duelo', que: 'Se cortó la sala al robar' })).toEqual({})
  })

  it('sin el entorno marcado no manda `entorno`; los opcionales vacíos no van; el honeypot va vacío', () => {
    const draft = { ...EMPTY_DRAFT, area: 'Lab' as const, que: 'El anillo no se mueve', esperaba: '  ', includeEnv: false }

    expect(JSON.parse(reportBody(draft, { navegador: 'Chrome' }))).toEqual({ area: 'Lab', que: 'El anillo no se mueve', hp: '' })
  })
})

describe('reportar: el borrador', () => {
  it('sobrevive (se guarda y se lee), uno vacío borra la clave y algo roto vuelve a vacío', () => {
    const { map, storage } = memory()
    const draft = { ...EMPTY_DRAFT, area: 'Roles' as const, que: 'Algo raro', includeEnv: false }

    writeDraft(draft, storage)
    expect(readDraft(storage)).toEqual(draft)
    writeDraft(EMPTY_DRAFT, storage)
    expect(map.has(REPORT_DRAFT_KEY)).toBe(false)
    map.set(REPORT_DRAFT_KEY, '{"area":"Nada","que":3}')
    expect(readDraft(storage)).toEqual(EMPTY_DRAFT)
    map.set(REPORT_DRAFT_KEY, '{roto')
    expect(readDraft(storage)).toEqual(EMPTY_DRAFT)
  })

  it('sin almacenamiento no rompe', () => {
    const broken = () => {
      throw new Error('SecurityError')
    }

    expect(readDraft(broken)).toEqual(EMPTY_DRAFT)
    expect(() => writeDraft({ ...EMPTY_DRAFT, que: 'x' }, broken)).not.toThrow()
  })
})

describe('reportar: cada respuesta del endpoint', () => {
  it.each([
    [answer(201, { ok: true, number: 12, url: 'https://github.com/o/r/issues/12' }), { kind: 'sent', number: 12, url: 'https://github.com/o/r/issues/12' }],
    [answer(200, { ok: true, number: 12, url: 'https://github.com/o/r/issues/12' }), { kind: 'sent', number: 12, url: 'https://github.com/o/r/issues/12' }],
    [answer(200, { ok: true }), { kind: 'sent' }],
    [answer(201, { ok: true, number: 3, url: 'https://elsewhere.example/3' }), { kind: 'sent' }],
    [answer(429, { error: 'rate_limited' }, { 'Retry-After': '421' }), { kind: 'rate-limited', minutes: 8 }],
    [answer(429, { error: 'rate_limited' }), { kind: 'rate-limited', minutes: 10 }],
    [answer(503, { error: 'not_configured' }), { kind: 'unavailable' }],
    [new Response('Not found', { status: 404 }), { kind: 'unavailable' }],
    [answer(403, { error: 'forbidden' }), { kind: 'unavailable' }],
    [answer(502, { error: 'upstream' }), { kind: 'upstream' }],
    [answer(500, {}), { kind: 'upstream' }],
    [answer(400, { error: 'invalid', field: 'que' }), { kind: 'invalid', field: 'que' }],
    [answer(400, { error: 'invalid', field: 'entorno' }), { kind: 'invalid' }],
    [answer(413, { error: 'too_large' }), { kind: 'too-large' }],
    [answer(415, { error: 'unsupported_media_type' }), { kind: 'invalid' }],
  ])('%#', async (response, expected) => {
    expect(await readReportResponse(response)).toEqual(expected)
  })

  it('manda JSON por POST a /api/bug con un tope de 15 s; sin red o con el tiempo agotado, `network`', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(answer(201, { ok: true, number: 1, url: 'https://github.com/o/r/issues/1' }))

    expect(await sendReport('{}', request)).toEqual({ kind: 'sent', number: 1, url: 'https://github.com/o/r/issues/1' })
    const [url, init] = request.mock.calls[0]!
    expect(url).toBe('/api/bug')
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    expect(init!.signal).toBeInstanceOf(AbortSignal)

    expect(await sendReport('{}', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch')))).toEqual({ kind: 'network' })
    expect(await sendReport('{}', vi.fn<typeof fetch>().mockRejectedValue(new DOMException('timeout', 'TimeoutError')))).toEqual({ kind: 'network' })
  })
})
