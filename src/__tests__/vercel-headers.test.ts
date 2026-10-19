import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../', import.meta.url)
const text = (path: string) => readFileSync(new URL(path, ROOT), 'utf8')

type Condition = { type: string; value: string }
type Rule = { source: string; has?: Condition[]; missing?: Condition[]; headers: Array<{ key: string; value: string }> }

const rules = (JSON.parse(text('vercel.json')) as { headers: Rule[] }).headers
const cacheControl = (source: string) => rules.find((rule) => rule.source === source)?.headers.find((header) => header.key === 'Cache-Control')?.value

describe('caché y headers del hosting (vercel.json)', () => {
  it('sólo se despliega main: las ramas de PR no gastan despliegues (el plan gratis tiene un tope diario; el 2026-10-19 se agotó y producción quedó atrás)', () => {
    // Vercel salta el despliegue cuando el comando sale con 0: true para cualquier rama que no sea main.
    expect((JSON.parse(text('vercel.json')) as { ignoreCommand?: string }).ignoreCommand).toBe('[ "$VERCEL_GIT_COMMIT_REF" != "main" ]')
  })

  it('lo que lleva hash en /assets se cachea un año, y el HTML y los datos siguen revalidándose', () => {
    expect(cacheControl('/assets/(.*)')).toBe('public, max-age=31536000, immutable')

    // La regla de seguridad cubre todo (también el index.html y los precios): un Cache-Control ahí los dejaría viejos.
    expect(cacheControl('/(.*)')).toBeUndefined()
    expect(rules.filter((rule) => rule.source.startsWith('/prices'))).toEqual([])
  })

  it('la mascota y los cosméticos se reemplazan en el lugar: un día de caché y nunca immutable', () => {
    for (const source of ['/mascot/(.*)', '/cosmetics/(.*)']) {
      expect(cacheControl(source), source).toMatch(/^public, max-age=86400, stale-while-revalidate=\d+$/)
    }
  })

  it('las fuentes que precarga el HTML existen (Vite las reescribe al archivo con hash y, si hay un error de tipeo, sólo avisa)', () => {
    const preloads = [...text('index.html').matchAll(/<link rel="preload" as="font"[^>]* href="(\/src\/[^"]+)"/g)].map(([, href]) => href!)

    expect(preloads).toHaveLength(3)

    for (const href of preloads) {
      expect(existsSync(new URL(`.${href}`, ROOT)), href).toBe(true)
    }
  })
})

/** La política de seguridad de contenido de una regla (null si no la tiene). */
const csp = (rule: Rule) => rule.headers.find((header) => header.key === 'Content-Security-Policy')?.value ?? null
const directives = (policy: string) => Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([name, ...sources]) => [name!, sources]))
const PRODUCTION_HOST = 'yu-gi-oh-probability-lab.vercel.app'
const cspRules = rules.filter((rule) => csp(rule) !== null)
const production = cspRules.find((rule) => rule.has?.some((condition) => condition.type === 'host' && condition.value === PRODUCTION_HOST))!
const previews = cspRules.find((rule) => rule.missing?.some((condition) => condition.type === 'host' && condition.value === PRODUCTION_HOST))!

describe('seguridad del hosting (vercel.json)', () => {
  it('hay una política para producción y otra para las previews, y no se pisan: cada despliegue recibe una sola', () => {
    expect(cspRules).toHaveLength(2)
    expect(production).toBeDefined()
    expect(previews).toBeDefined()
    expect(production.missing).toBeUndefined()
    expect(previews.has).toBeUndefined()
    // Las dos cubren todo el sitio (también el HTML y la API).
    expect([production.source, previews.source]).toEqual(['/(.*)', '/(.*)'])
  })

  it('la de producción no deja entrar nada de terceros que no haga falta: sin la barra de Vercel, sin comodines, sin scripts en línea', () => {
    const policy = csp(production)!
    const rule = directives(policy)

    expect(policy).not.toMatch(/vercel\.(live|com)|pusher|assets\.vercel/)
    expect(policy).not.toContain('*')
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(rule['script-src']).toEqual(["'self'"])
    expect(rule['default-src']).toEqual(["'self'"])
    expect(rule['object-src']).toEqual(["'none'"])
    expect(rule['base-uri']).toEqual(["'self'"])
    expect(rule['form-action']).toEqual(["'self'"])
    expect(rule['frame-ancestors']).toEqual(["'none'"])
    expect(rule['frame-src']).toEqual(['https://www.youtube-nocookie.com'])
    expect(policy).toContain('upgrade-insecure-requests')
  })

  it('el relay del duelo es el único WebSocket permitido, con su dirección exacta (no cualquier workers.dev)', () => {
    for (const rule of [production, previews]) {
      const connect = directives(csp(rule)!)['connect-src']!
      const sockets = connect.filter((source) => source.startsWith('wss:') || source.startsWith('ws:'))

      expect(connect).toContain("'self'")
      expect(connect).toContain('https://db.ygoprodeck.com')
      expect(sockets).toContain('wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev')
      // La lista de salas públicas se pide por https al mismo relay: sin esto el navegador la bloquea y ninguna sala aparece.
      expect(connect).toContain('https://ygo-lab-duel-relay.gastonvallesyeou.workers.dev')
      expect(sockets.filter((source) => source.includes('*'))).toEqual([])
      expect(sockets.filter((source) => source.endsWith('.workers.dev') && !source.includes('ygo-lab-duel-relay'))).toEqual([])
    }
  })

  it('las previews conservan lo de la barra de Vercel (comentarios) y nada más suelto: sin comodines ni scripts en línea', () => {
    const policy = csp(previews)!

    expect(policy).toContain('https://vercel.live')
    expect(policy).not.toContain('*')
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/)
    expect(directives(policy)['frame-ancestors']).toEqual(["'none'"])
  })

  it('en todo el sitio: sin sniffing, sin marcos, sin cámara ni micrófono ni ubicación, y el proxy de imágenes no se puede enlazar desde otras páginas', () => {
    const all = rules.find((rule) => rule.source === '/(.*)' && !rule.has && !rule.missing)!
    const header = (rule: Rule, key: string) => rule.headers.find((entry) => entry.key === key)?.value

    expect(header(all, 'X-Content-Type-Options')).toBe('nosniff')
    expect(header(all, 'X-Frame-Options')).toBe('DENY')
    expect(header(all, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(header(all, 'Cross-Origin-Opener-Policy')).toBe('same-origin')
    expect(header(all, 'Permissions-Policy')).toMatch(/camera=\(\).*microphone=\(\).*geolocation=\(\)/)

    const proxy = rules.find((rule) => rule.source === '/api/card-image/(.*)')!
    expect(header(proxy, 'Cross-Origin-Resource-Policy')).toBe('same-origin')
  })
})
