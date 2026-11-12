// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { PALETTE_KEY, setPalette } from '../app/palette'

// Las paletas: Carbón (de fábrica, el primer bloque de `index.css`: lo que leen los demás tests) e Índigo (`:root[data-palette='indigo']`, la de antes de `85dc26c0`, a elección en el menú).
const CSS = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')
const BLOCK = (head: string) => new RegExp(`${head} \\{([\\s\\S]*?)\\n  \\}`).exec(CSS)?.[1] ?? ''
const declarations = (block: string) => new Map([...block.matchAll(/^\s+(--[\w-]+):\s*([^;]+);/gm)].map((match) => [match[1]!, match[2]!.trim()]))
const CARBON = declarations(BLOCK(':root'))
const INDIGO = declarations(BLOCK(":root\\[data-palette='indigo'\\]"))

/** Los valores de la paleta de justo antes de `85dc26c0` (`git show 85dc26c0 -- src/index.css`, las líneas que salen). */
const BEFORE_85DC26C0: Record<string, string> = {
  '--color-lavender-light': '#eee9ff',
  '--background': '#150a24',
  '--background-rgb': '21 10 36',
  '--secondary': '#231238',
  '--card-background': '#231238',
  '--card-background-rgb': '35 18 56',
  '--border': '#3a2459',
  '--input': '#2b1745',
  '--input-hover': '#352052',
  '--primary': '#8000cb',
  '--primary-rgb': '128 0 203',
  '--primary-hover': '#9a26e0',
  '--primary-hover-rgb': '154 38 224',
  '--accent': '#c77dff',
  '--accent-rgb': '199 125 255',
  '--accent-foreground': '#150a24',
  '--destructive': '#da0000',
  '--destructive-rgb': '218 0 0',
  '--surface-raised': '#2b1745',
  '--surface-hover': '#352052',
  '--border-subtle': '#2e1c4a',
  '--primary-soft': '#c77dff',
  '--primary-soft-rgb': '199 125 255',
  '--lavender': '#2b1745',
  '--lavender-hover': '#352052',
  '--info': '#ffc100',
  '--info-rgb': '255 193 0',
  '--success-soft': '#6bf55c',
  '--warning-soft': '#ffd84d',
  '--danger-soft': '#ff4d4d',
  '--danger-soft-rgb': '255 77 77',
  '--info-soft': '#ffd84d',
  '--success': '#1aef06',
  '--success-rgb': '26 239 6',
  '--success-solid': 'color-mix(in srgb, #1aef06 55%, black)',
  '--warning': '#ffc100',
  '--warning-rgb': '255 193 0',
  '--danger': '#da0000',
  '--danger-rgb': '218 0 0',
  '--nav': '#400065',
  '--nav-raised': '#5a2a80',
  '--nav-active': '#ffc100',
  '--text-muted': '#b4a2d4',
  '--text-soft': '#9b86c4',
  '--app-scrollbar-track': '#1c0f30',
  '--app-scrollbar-thumb': '#45296b',
  '--app-scrollbar-thumb-hover': '#6a4b96',
}

describe('el bloque Índigo de index.css', () => {
  it('trae los valores de la paleta de antes de 85dc26c0, ni uno más ni uno menos', () => {
    expect(Object.fromEntries(INDIGO)).toEqual(BEFORE_85DC26C0)
  })

  it('va después del de Carbón y no lo reemplaza: Carbón sigue de fábrica (lo que leen los demás tests)', () => {
    expect(CSS.indexOf(":root[data-palette='indigo']")).toBeGreaterThan(CSS.indexOf('--background: #18181c;'))
    expect(CARBON.get('--background')).toBe('#18181c')
    expect(CARBON.get('--info')).toBe('#b9f500')
  })

  it('cada token (menos la lavanda del @theme) ya existe en Carbón: son los mismos nombres', () => {
    for (const name of INDIGO.keys()) {
      if (name !== '--color-lavender-light') expect(CARBON.has(name), name).toBe(true)
    }
  })
})

type Rgb = [number, number, number]

/** El token de la paleta elegida: Índigo pisa a Carbón. */
function rgbOf(name: string): Rgb {
  const value = INDIGO.get(`--${name}`) ?? CARBON.get(`--${name}`)
  const rgb = INDIGO.get(`--${name}-rgb`) ?? CARBON.get(`--${name}-rgb`)

  if (rgb) return rgb.split(' ').map(Number) as Rgb

  // El verde lleno de Índigo es el verde con 45 % de negro: `color-mix(in srgb, #hex N%, black)`.
  const mix = /^color-mix\(in srgb, (#[0-9a-f]{6}) (\d+)%, black\)$/.exec(value ?? '')
  if (mix) return [1, 3, 5].map((at) => Math.round(Number.parseInt(mix[1]!.slice(at, at + 2), 16) * (Number(mix[2]) / 100))) as Rgb
  if (!value || !value.startsWith('#')) throw new Error(`No hay un color para --${name}`)

  return [1, 3, 5].map((at) => Number.parseInt(value.slice(at, at + 2), 16)) as Rgb
}

function contrast(a: Rgb, b: Rgb): number {
  const luminance = (rgb: Rgb) => rgb.map((channel) => channel / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index]!, 0)
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]

  return (light + 0.05) / (dark + 0.05)
}

describe('con Índigo, los pares de texto se leen (WCAG AA; los mismos de ring-language.test.tsx)', () => {
  const surfaces = ['background', 'card-background', 'surface-raised', 'lavender']

  it('el texto blanco sobre el violeta de marca, el verde lleno y el rojo lleno da 4,5:1 o más', () => {
    for (const fill of ['primary', 'success-solid', 'danger']) {
      expect(contrast(rgbOf('foreground'), rgbOf(fill)), fill).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('el índigo sobre el ámbar (relleno) da 7:1 o más; el blanco sobre el ámbar no se lee', () => {
    expect(contrast(rgbOf('accent-foreground'), rgbOf('info'))).toBeGreaterThanOrEqual(7)
    expect(contrast(rgbOf('foreground'), rgbOf('info'))).toBeLessThan(3)
  })

  it.each(['foreground', 'text-muted', 'text-soft', 'primary-soft', 'success-soft', 'warning-soft', 'danger-soft', 'info-soft', 'info'])('el texto %s se lee sobre el lienzo, la tarjeta, la elevada y la lavanda', (token) => {
    for (const surface of surfaces) expect(contrast(rgbOf(token), rgbOf(surface)), `contra ${surface}`).toBeGreaterThanOrEqual(4.5)
  })

  it('el destino activo y el texto de la navegación se leen sobre el índigo de la barra', () => {
    for (const token of ['nav-active', 'foreground']) expect(contrast(rgbOf(token), rgbOf('nav')), token).toBeGreaterThanOrEqual(4.5)
  })
})

describe('guardar y aplicar la paleta', () => {
  const html = document.documentElement

  beforeEach(() => {
    localStorage.clear()
    html.removeAttribute('data-palette')
    setPalette('carbon')
  })

  afterEach(() => {
    localStorage.clear()
    html.removeAttribute('data-palette')
  })

  it('Índigo se guarda y se pone en el html; Carbón lo saca', () => {
    setPalette('indigo')
    expect(localStorage.getItem(PALETTE_KEY)).toBe('indigo')
    expect(html.getAttribute('data-palette')).toBe('indigo')

    setPalette('carbon')
    expect(localStorage.getItem(PALETTE_KEY)).toBe('carbon')
    expect(html.hasAttribute('data-palette')).toBe(false)
  })

  it('public/palette.js, el script que corre antes del primer pintado, aplica Índigo guardado y deja Carbón sin tocar', () => {
    const run = () => new Function(readFileSync(path.join(process.cwd(), 'public', 'palette.js'), 'utf8'))()

    run()
    expect(html.hasAttribute('data-palette')).toBe(false)

    localStorage.setItem(PALETTE_KEY, 'indigo')
    run()
    expect(html.getAttribute('data-palette')).toBe('indigo')
  })

  it('index.html lo carga en el head, antes del módulo de la app', () => {
    const page = readFileSync(path.join(process.cwd(), 'index.html'), 'utf8')

    expect(page.indexOf('<script src="/palette.js"></script>')).toBeGreaterThan(page.indexOf('<head>'))
    expect(page.indexOf('<script src="/palette.js"></script>')).toBeLessThan(page.indexOf('<script type="module"'))
  })
})
