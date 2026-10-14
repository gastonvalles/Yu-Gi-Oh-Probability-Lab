import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../', import.meta.url)
const text = (path: string) => readFileSync(new URL(path, ROOT), 'utf8')

type Rule = { source: string; headers: Array<{ key: string; value: string }> }

const rules = (JSON.parse(text('vercel.json')) as { headers: Rule[] }).headers
const cacheControl = (source: string) => rules.find((rule) => rule.source === source)?.headers.find((header) => header.key === 'Cache-Control')?.value

describe('caché y headers del hosting (vercel.json)', () => {
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
