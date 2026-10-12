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
    const { icons } = JSON.parse(text('public/site.webmanifest')) as { icons: Array<{ src: string; sizes: string }> }

    expect(icons.map((icon) => icon.sizes)).toEqual(['192x192', '512x512'])

    for (const icon of icons) {
      expect(inPublic(icon.src), icon.src).toBe(true)
      expect(sizeOf(bytes(`public${icon.src}`)).join('x')).toBe(icon.sizes)
    }

    expect([...bytes('public/favicon.ico').subarray(0, 4)]).toEqual([0, 0, 1, 0])
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
