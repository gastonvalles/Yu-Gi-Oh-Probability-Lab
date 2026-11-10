import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../../', import.meta.url)
const text = (path: string) => readFileSync(new URL(path, ROOT), 'utf8')
const bytes = (path: string) => readFileSync(new URL(path, ROOT))
const inPublic = (path: string) => existsSync(new URL(`public${path}`, ROOT))

const html = text('index.html')
const meta = (name: string) => new RegExp(`<meta (?:property|name)="${name}" content="([^"]*)"`).exec(html)?.[1]
const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1] ?? ''
const origin = new URL(canonical).origin

/** Ancho y alto de un PNG o un JPEG, leídos de su cabecera. */
function sizeOf(file: Buffer): [number, number] {
  if (file.subarray(1, 4).toString() === 'PNG') return [file.readUInt32BE(16), file.readUInt32BE(20)]

  for (let offset = 2; offset + 9 < file.length; offset += 2 + file.readUInt16BE(offset + 2)) {
    const marker = file[offset + 1]!
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [file.readUInt16BE(offset + 7), file.readUInt16BE(offset + 5)]
  }

  throw new Error('imagen sin cabecera reconocible')
}

describe('el sitio para compartir y para los buscadores', () => {
  it('la URL pública es la misma en el HTML, robots.txt y sitemap.xml, y cada página del sitemap existe', () => {
    expect(origin).toMatch(/^https:\/\//)
    expect(canonical).toBe(`${origin}/`)
    expect(meta('og:url')).toBe(`${origin}/`)
    expect(meta('og:image')?.startsWith(`${origin}/`)).toBe(true)
    expect(text('public/robots.txt')).toContain(`Sitemap: ${origin}/sitemap.xml`)

    const pages = [...text('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]!)
    expect(pages).toContain(`${origin}/`)

    for (const page of pages) {
      expect(page.startsWith(`${origin}/`), page).toBe(true)
      const path = page.slice(origin.length)
      if (path !== '/') expect(inPublic(path), page).toBe(true)
    }
  })

  it('la imagen para compartir existe y mide lo que declara el HTML: 1200 × 630', () => {
    const path = meta('og:image')!.slice(origin.length)

    expect(inPublic(path)).toBe(true)
    expect(sizeOf(bytes(`public${path}`))).toEqual([1200, 630])
    expect([meta('og:image:width'), meta('og:image:height')]).toEqual(['1200', '630'])
    expect(meta('twitter:card')).toBe('summary_large_image')
  })

  it('los íconos del manifiesto existen y miden lo que dicen, y el favicon.ico es un ICO', () => {
    const { icons } = JSON.parse(text('public/site.webmanifest')) as { icons: Array<{ src: string; sizes: string; purpose: string }> }

    expect(icons.map((icon) => `${icon.purpose} ${icon.sizes}`).sort()).toEqual(['any 192x192', 'any 512x512', 'maskable 192x192', 'maskable 512x512'])

    for (const icon of icons) {
      expect(inPublic(icon.src), icon.src).toBe(true)
      expect(sizeOf(bytes(`public${icon.src}`)).join('x')).toBe(icon.sizes)
    }

    expect([...bytes('public/favicon.ico').subarray(0, 4)]).toEqual([0, 0, 1, 0])
  })

  // Chrome en Android regenera la app instalada (WebAPK) cuando cambia el manifiesto: la identidad (`id`, `start_url`, `scope`) no se toca.
  it('el manifiesto de la app instalada: la identidad, los accesos directos, las capturas y las categorías', () => {
    type Manifest = {
      id: string
      start_url: string
      scope: string
      categories: string[]
      shortcuts: Array<{ name: string; url: string }>
      screenshots: Array<{ src: string; sizes: string; type: string; form_factor: string; label: string }>
    }
    const manifest = JSON.parse(text('public/site.webmanifest')) as Manifest
    // La lista de categorías del W3C (Web App Manifest, «Application Information»).
    const W3C_CATEGORIES = ['books', 'business', 'education', 'entertainment', 'finance', 'fitness', 'food', 'games', 'government', 'health', 'kids', 'lifestyle', 'magazines', 'medical', 'music', 'navigation', 'news', 'personalization', 'photo', 'politics', 'productivity', 'security', 'shopping', 'social', 'sports', 'travel', 'utilities', 'weather']

    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />')
    expect([manifest.id, manifest.start_url, manifest.scope]).toEqual(['/', '/', '/'])
    expect(manifest.categories.filter((category) => !W3C_CATEGORIES.includes(category))).toEqual([])

    // Android muestra hasta 4.
    expect(manifest.shortcuts.length).toBeGreaterThan(0)
    expect(manifest.shortcuts.length).toBeLessThanOrEqual(4)
    for (const shortcut of manifest.shortcuts) {
      expect(shortcut.name.length, shortcut.url).toBeGreaterThan(0)
      expect(shortcut.url, shortcut.name).toMatch(/^\/#[a-z-]+$/)
    }

    // De 1 a 5 angostas, del mismo tamaño, con lados de 320 a 3840 px y el lado largo hasta 2,3 veces el corto.
    expect(manifest.screenshots.length).toBeGreaterThan(0)
    expect(manifest.screenshots.length).toBeLessThanOrEqual(5)
    expect(new Set(manifest.screenshots.map((shot) => shot.sizes)).size).toBe(1)
    for (const shot of manifest.screenshots) {
      const [width, height] = sizeOf(bytes(`public${shot.src}`))

      expect(`${width}x${height}`, shot.src).toBe(shot.sizes)
      expect(Math.min(width, height)).toBeGreaterThanOrEqual(320)
      expect(Math.max(width, height)).toBeLessThanOrEqual(3840)
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(2.3)
      expect(shot.type, shot.src).toBe(bytes(`public${shot.src}`).subarray(1, 4).toString() === 'PNG' ? 'image/png' : 'image/jpeg')
      expect(shot.form_factor).toBe('narrow')
      expect(shot.label.length, shot.src).toBeGreaterThan(0)
    }
  })

  it('todo lo que enlazan el HTML y las páginas estáticas existe en public/, y la 404 no se indexa', () => {
    for (const page of ['index.html', 'public/404.html', 'public/privacidad.html', 'public/privacy.html']) {
      for (const [, url] of text(page).matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
        if (url === '/' || url!.startsWith('/src/')) continue
        expect(inPublic(url!), `${page}: ${url}`).toBe(true)
      }
    }

    expect(text('public/404.html')).toContain('<meta name="robots" content="noindex" />')
  })
})
