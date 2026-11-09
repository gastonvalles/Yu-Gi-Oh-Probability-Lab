import { describe, expect, it } from 'vitest'

import {
  BUG_FOOTER,
  clientKey,
  GLOBAL_HOUR_MAX,
  cleanText,
  createGlobalLimiter,
  createRateLimiter,
  createRecentReports,
  fenced,
  isAllowedOrigin,
  issueBody,
  issueLabels,
  issueTitle,
  parseBugReport,
  type BugReport,
} from '../app/bug-report'

const valid = { area: 'Lab', que: 'El anillo no se actualiza al sacar una carta', hp: '' }
const reportOf = (raw: unknown): BugReport => {
  const parsed = parseBugReport(raw)

  if (!parsed.ok || parsed.honeypot) throw new Error('se esperaba un reporte válido')
  return parsed.report
}

/** Lo que GitHub interpretaría fuera de un bloque de código: el cuerpo, sin el contenido de los bloques. */
function outsideFences(body: string): string {
  return body.replace(/^(`{3,})text\n[\s\S]*?\n\1$/gm, '')
}

describe('parseBugReport', () => {
  it('acepta lo mínimo, descarta los campos de más y limpia el texto', () => {
    const report = reportOf({ ...valid, mail: 'a@b.c', nombre: 'X', que: '  El anillo\r\nno se mueve  ', entorno: { navegador: 'Chrome', ancho: 390 } })

    expect(report).toEqual({ area: 'Lab', que: 'El anillo\nno se mueve', entorno: { navegador: 'Chrome' } })
  })

  it('rechaza cada campo fuera de forma con su nombre', () => {
    expect(parseBugReport(null)).toEqual({ ok: false, field: 'body' })
    expect(parseBugReport([])).toEqual({ ok: false, field: 'body' })
    expect(parseBugReport({ ...valid, area: 'Admin' })).toEqual({ ok: false, field: 'area' })
    expect(parseBugReport({ ...valid, area: undefined })).toEqual({ ok: false, field: 'area' })
    expect(parseBugReport({ ...valid, que: 'corto' })).toEqual({ ok: false, field: 'que' })
    expect(parseBugReport({ ...valid, que: '\u0000\u202E         \u200B' })).toEqual({ ok: false, field: 'que' })
    expect(parseBugReport({ ...valid, que: 'x'.repeat(2001) })).toEqual({ ok: false, field: 'que' })
    expect(parseBugReport({ ...valid, que: 42 })).toEqual({ ok: false, field: 'que' })
    expect(parseBugReport({ ...valid, esperaba: 'x'.repeat(2001) })).toEqual({ ok: false, field: 'esperaba' })
    expect(parseBugReport({ ...valid, pasos: ['1'] })).toEqual({ ok: false, field: 'pasos' })
    expect(parseBugReport({ ...valid, entorno: 'Chrome' })).toEqual({ ok: false, field: 'entorno' })
    expect(parseBugReport({ ...valid, entorno: { navegador: 'Chrome 130.0.6723' } })).toEqual({ ok: false, field: 'entorno' })
    expect(parseBugReport({ ...valid, entorno: { sistema: 'Windows 11 Pro' } })).toEqual({ ok: false, field: 'entorno' })
    expect(parseBugReport({ ...valid, entorno: { idioma: 'es-AR; rm -rf' } })).toEqual({ ok: false, field: 'entorno' })
    expect(parseBugReport({ ...valid, entorno: { build: '<script>' } })).toEqual({ ok: false, field: 'entorno' })
  })

  it('un sustituto suelto se reemplaza antes de contar (GitHub no recibe UTF-16 roto)', () => {
    const lone = String.fromCharCode(0xd800)
    const cleaned = cleanText(`texto con ${lone} suelto`)

    expect(cleaned.isWellFormed()).toBe(true)
    expect(cleaned).toBe('texto con � suelto')
    expect(parseBugReport({ ...valid, que: `${lone}`.repeat(2001) })).toEqual({ ok: false, field: 'que' })
    expect(reportOf({ ...valid, que: `${valid.que} ${lone}` }).que.isWellFormed()).toBe(true)
  })

  it('cuenta caracteres, no unidades de UTF-16: 2000 emojis entran', () => {
    expect(parseBugReport({ ...valid, que: '🃏'.repeat(2000) }).ok).toBe(true)
  })

  it('un honeypot con algo es un bot, aunque el resto esté mal', () => {
    expect(parseBugReport({ hp: 'http://spam' })).toEqual({ ok: true, honeypot: true })
  })

  it('el entorno marcado pasa entero', () => {
    const entorno = { navegador: 'Samsung Internet', sistema: 'Android', idioma: 'es-AR', build: 'e920a300' }

    expect(reportOf({ ...valid, entorno }).entorno).toEqual(entorno)
  })
})

describe('neutralización', () => {
  const hostile = [
    '@gastonvalles @github/security mirá esto',
    'igual que #1 y que org/repo#12 y GH-3',
    '<img src=x onerror=alert(1)><script>alert(1)</script><details open>',
    '![img](https://evil.example/pixel.png) [click](javascript:alert(1)) https://evil.example',
    'tres ``` y cinco ````` y uno ` y fin ``',
    '```\n# cierre falso\n@alguien\n```',
    'nulos \u0000\u0001 y bidi \u202Eesrever\u202C y BOM \uFEFF',
    'emojis 👨\u200D👩\u200D👧 🃏 ✨',
    'x'.repeat(1990),
    'separador de línea\u2028@alguien\u2029#5 aparte',
    'CRLF\r\n```\r\n@alguien\r\n```\r\nfin',
    'valla con sangría\n   ```\n@alguien #7\n   ```\nfin',
  ]

  it('la valla es más larga que cualquier racha de backticks y nada de adentro la cierra', () => {
    const text = 'a ``` b ````` c'
    const block = fenced(text)

    expect(block.startsWith('``````text\n')).toBe(true)
    expect(block.endsWith('\n``````')).toBe(true)
    expect(fenced('sin backticks')).toBe('```text\nsin backticks\n```')
  })

  it('con textos hostiles, fuera de los bloques sólo queda lo fijo y el título es una línea limpia', () => {
    for (const que of hostile) {
      const report = reportOf({ area: 'Duelo', que, esperaba: que, pasos: que, entorno: { navegador: 'Firefox' } })
      const body = issueBody(report)
      const outside = outsideFences(body)
      const title = issueTitle(report)

      expect(outside, que).not.toMatch(/@|<|https?:|\]\(/)
      expect(outside.replace(/^### .*$/gm, '').replace(/^\*\*Área:\*\*.*$/m, ''), que).not.toContain('#')
      expect(body).toContain(BUG_FOOTER)
      // eslint-disable-next-line no-control-regex -- es justo lo que no tiene que llegar al issue
      expect(body).not.toMatch(/[\u0000\u202E\uFEFF]/)
      expect([...title].length).toBeLessThanOrEqual(80)
      expect(title).not.toMatch(/[\n\r@#`<>]/)
      expect(title.startsWith('[Duelo] ')).toBe(true)
    }
  })

  it('el ZWJ de los emojis compuestos se queda', () => {
    expect(issueBody(reportOf({ ...valid, que: 'emojis 👨\u200D👩\u200D👧 rotos' }))).toContain('👨\u200D👩\u200D👧')
  })

  it('el título toma sólo la primera línea y corta en 80 con «…»', () => {
    expect(issueTitle(reportOf({ ...valid, que: 'Primera línea\nsegunda @alguien' }))).toBe('[Lab] Primera línea')
    const long = issueTitle(reportOf({ ...valid, que: 'palabra '.repeat(40) }))

    expect([...long].length).toBe(80)
    expect(long.endsWith('…')).toBe(true)
    expect(issueTitle(reportOf({ ...valid, que: '@@@@ ### ```\nlo demás' }))).toBe('[Lab] Reporte')
  })

  it('las etiquetas son fijas: nada del usuario', () => {
    expect(issueLabels(reportOf({ ...valid, area: 'Jugar solo' }))).toEqual(['bug-reportado', 'area:jugar-solo'])
  })
})

describe('isAllowedOrigin', () => {
  it('sólo el propio sitio, sus vistas previas y localhost', () => {
    expect(isAllowedOrigin('https://yu-gi-oh-probability-lab.vercel.app', null)).toBe(true)
    expect(isAllowedOrigin('https://yu-gi-oh-probability-lab-git-rama-gastonvalles-projects.vercel.app', null)).toBe(true)
    expect(isAllowedOrigin('http://localhost:5173', null)).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:4173', null)).toBe(true)
    expect(isAllowedOrigin(null, 'https://yu-gi-oh-probability-lab.vercel.app/lab?x=1')).toBe(true)

    expect(isAllowedOrigin(null, null)).toBe(false)
    expect(isAllowedOrigin('null', null)).toBe(false)
    expect(isAllowedOrigin('http://yu-gi-oh-probability-lab.vercel.app', null)).toBe(false)
    expect(isAllowedOrigin('https://yu-gi-oh-probability-lab.vercel.app.evil.example', null)).toBe(false)
    expect(isAllowedOrigin('https://evil-gastonvalles-projects.vercel.app', null)).toBe(false)
    expect(isAllowedOrigin('https://a.yu-gi-oh-probability-lab-x-gastonvalles-projects.vercel.app', null)).toBe(false)
    expect(isAllowedOrigin('https://evil.example', 'https://yu-gi-oh-probability-lab.vercel.app/')).toBe(false)
    expect(isAllowedOrigin('file:///localhost', null)).toBe(false)
  })
})

describe('clientKey', () => {
  it('IPv4 entera; IPv6 por /48 (una casa, una llave); IPv4 dentro de IPv6 como IPv4', () => {
    expect(clientKey('203.0.113.7')).toBe('203.0.113.7')
    expect(clientKey('2001:db8:0:1:aaaa::1')).toBe('2001:db8:0::/48')
    expect(clientKey('2001:0DB8:0000:ffff:ffff:ffff:ffff:ffff')).toBe('2001:db8:0::/48')
    expect(clientKey('2001:db8:7::1')).toBe('2001:db8:7::/48')
    expect(clientKey('::ffff:198.51.100.2')).toBe('198.51.100.2')
  })

  it('sin corchetes ni puerto, y la IPv4 mapeada en hex no se junta con ::1', () => {
    expect(clientKey('203.0.113.7:8080')).toBe('203.0.113.7')
    expect(clientKey('[2001:db8:7::1]:443')).toBe('2001:db8:7::/48')
    expect(clientKey('[2001:db8:7::1]')).toBe('2001:db8:7::/48')
    expect(clientKey('[::ffff:198.51.100.2]:80')).toBe('198.51.100.2')
    expect(clientKey('::ffff:0102:0304')).toBe('1.2.3.4')
    expect(clientKey('::ffff:c633:6402')).toBe('198.51.100.2')
    expect(clientKey('::1')).toBe('0:0:0::/48')
    expect(clientKey('::ffff:0102:0304')).not.toBe(clientKey('::1'))
  })
})

describe('createGlobalLimiter', () => {
  it('hasta 20 issues por hora entre todos, con el tiempo que falta', () => {
    let now = 0
    const limitAll = createGlobalLimiter(() => now)

    for (let index = 0; index < GLOBAL_HOUR_MAX; index++) {
      expect(limitAll()).toBe(0)
      now += 60_000
    }
    expect(GLOBAL_HOUR_MAX).toBe(20)
    expect(limitAll()).toBe(40 * 60)
    now = 60 * 60_000 + 1
    expect(limitAll()).toBe(0)
  })
})

describe('createRateLimiter', () => {
  it('3 cada 10 minutos y 10 por día, con el tiempo que falta', () => {
    let now = 1_000_000_000
    const limit = createRateLimiter(() => now)

    expect([limit('a'), limit('a'), limit('a')]).toEqual([0, 0, 0])
    expect(limit('a')).toBe(600)
    expect(limit('b')).toBe(0)
    now += 4 * 60_000
    expect(limit('a')).toBe(360)

    for (let round = 0; round < 3; round++) {
      now += 10 * 60_000
      limit('a')
      limit('a')
      limit('a')
    }
    // Entraron 3 + 3 + 3 + 1 = 10 en el día: el siguiente espera a que venza el primero.
    now += 10 * 60_000
    expect(limit('a')).toBeGreaterThan(600)
  })

  it('barre las llaves de más de un día y vuelven a empezar', () => {
    let now = 0
    const limit = createRateLimiter(() => now)

    limit('a')
    limit('a')
    limit('a')
    now += 24 * 60 * 60_000 + 1
    expect(limit('a')).toBe(0)
  })

  it('con la tabla llena desaloja la llave que hace más que no pide, en vez de rechazar a la nueva', () => {
    let now = 0
    const limit = createRateLimiter(() => now, 3)

    for (const key of ['a', 'b', 'c']) {
      limit(key)
      now += 1000
    }
    limit('a') // «a» vuelve a pedir: ahora la más vieja es «b»
    now += 1000
    expect(limit('d')).toBe(0)
    // «b» fue desalojada y arranca de cero; «a» sigue contada (2 de 3).
    expect([limit('b'), limit('b'), limit('b')]).toEqual([0, 0, 0])
    expect(limit('a')).toBe(0)
    expect(limit('a')).toBeGreaterThan(0)
  })
})

describe('createRecentReports', () => {
  it('recuerda 10 minutos y con tope', () => {
    let now = 0
    const recent = createRecentReports<number>(() => now, 2)

    recent.remember('a', 1)
    expect(recent.get('a')).toBe(1)
    now += 10 * 60_000
    expect(recent.get('a')).toBeUndefined()
    recent.remember('b', 2)
    recent.remember('c', 3)
    recent.remember('d', 4)
    expect(recent.get('b')).toBeUndefined()
    expect(recent.get('d')).toBe(4)
  })
})
