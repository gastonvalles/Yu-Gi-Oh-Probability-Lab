import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { EASE_IN_OUT, EASE_OUT, EASE_SNAP, easeSnap } from '../app/motion'

// Las curvas del JS (la Web Animations API) son las de los tokens de index.css, y ningún movimiento de la interfaz usa la palabra `ease-out` de esa API
// (es otra curva). Esta regla mira el código, como `link-rules.test.ts`.
const SRC = path.join(process.cwd(), 'src')
const CSS = readFileSync(path.join(SRC, 'index.css'), 'utf8')
const FOIL = readFileSync(path.join(SRC, 'foil.css'), 'utf8')

const token = (name: string) => CSS.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1]?.trim()
const sinComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

function sourcesIn(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name)

    if (statSync(file).isDirectory()) {
      return name === '__tests__' ? [] : sourcesIn(file)
    }

    return /\.tsx?$/.test(file) ? [file] : []
  })
}

const SOURCES = sourcesIn(SRC)
const relativa = (file: string) => path.relative(SRC, file)

describe('las curvas de movimiento', () => {
  it('son las tres de index.css, espejadas en el JS', () => {
    expect(EASE_OUT).toBe(token('ease-out'))
    expect(EASE_IN_OUT).toBe(token('ease-in-out'))
    expect(EASE_SNAP).toBe(token('ease-snap'))
  })

  it('easeSnap (JS) es EASE_SNAP: el tiempo recorrido se convierte en camino como lo hace el navegador', () => {
    // Referencia por fuerza bruta, sin bisección: barre la curva en 20 001 puntos y toma el más cercano en tiempo.
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = EASE_SNAP.match(/-?[\d.]+/g)?.map(Number) ?? []
    const at = (p1: number, p2: number, t: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3
    const curve = Array.from({ length: 20001 }, (_, index) => ({ x: at(x1, x2, index / 20000), y: at(y1, y2, index / 20000) }))
    const reference = (time: number) => curve.reduce((best, point) => (Math.abs(point.x - time) < Math.abs(best.x - time) ? point : best)).y

    for (const time of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      expect(easeSnap(time)).toBeCloseTo(reference(time), 3)
    }
    expect(easeSnap(0)).toBe(0)
    expect(easeSnap(1)).toBe(1)
  })

  it('el mazo y la mano se barajan con el mismo movimiento (JS, con las curvas del proyecto), sin keyframes propios en CSS', () => {
    expect(CSS).not.toMatch(/--animate-riffle-|@keyframes riffle-/)
    const shuffle = readFileSync(path.join(SRC, 'app', 'shuffle-fx.ts'), 'utf8')

    expect(shuffle).toMatch(/export const shuffleDeck = [^\n]*shuffle\(/)
    expect(shuffle).toMatch(/export const shuffleHand = [^\n]*shuffle\(/)
    expect(shuffle).toContain('EASE_IN_OUT]')
  })

  it('dar vuelta una carta en la mesa va con una sola curva de punta a punta: no se frena de canto', () => {
    const mat = readFileSync(path.join(SRC, 'components', 'probability', 'PracticeMat.tsx'), 'utf8')

    expect(mat).toContain('const timing = { duration: FLIP_MS, easing: EASE_IN_OUT }')
    expect(mat.match(/const flipFrames = [^\n]*/)?.[0]).not.toContain('easing')
  })

  it('ningún movimiento usa la palabra ease-out de la Web Animations API', () => {
    const offenders = SOURCES.filter((file) => /easing\s*:\s*['"`](ease|ease-in|ease-out|ease-in-out)['"`]/.test(readFileSync(file, 'utf8')))

    expect(offenders.map(relativa), 'Usá EASE_OUT, EASE_IN_OUT o EASE_SNAP de app/motion.ts: la palabra ease-out de la Web Animations API es otra curva').toEqual([])
  })

  it('cada curva se escribe una sola vez: el token en index.css y su espejo en app/motion.ts', () => {
    // Los cuadros de un @keyframes llevan el valor literal de su token (el navegador ignora var() en la curva de un cuadro): sólo se aceptan esos valores.
    const VALORES = new Set([EASE_OUT, EASE_IN_OUT, EASE_SNAP, token('ease-gravedad-subida'), token('ease-gravedad-caida')])
    // En index.css, las únicas líneas con cubic-bezier( son la definición de un --ease-… (la gravedad de la moneda incluida) o un cuadro con el valor de un token.
    const cssSueltas = CSS.split('\n').filter((linea) => {
      if (!linea.includes('cubic-bezier(') || /^\s*--ease-[a-z-]+:\s*cubic-bezier\(/.test(linea)) return false

      const cuadro = /^\s*animation-timing-function:\s*(cubic-bezier\([^)]*\));/.exec(linea)

      return !(cuadro && VALORES.has(cuadro[1]!))
    })

    expect(cssSueltas, 'Las curvas se definen en el @theme de index.css (--ease-…) y se usan con var(--ease-…)').toEqual([])

    // En TS sólo app/motion.ts escribe una curva: el resto usa las constantes o `ease-(--ease-snap)` en una clase.
    const tsSueltas = SOURCES.filter((file) => !file.endsWith(path.join('app', 'motion.ts')) && /cubic-bezier\(|ease-\[/.test(readFileSync(file, 'utf8'))).map(relativa)

    expect(tsSueltas, 'Usá EASE_OUT, EASE_IN_OUT o EASE_SNAP de app/motion.ts (o ease-(--ease-snap) en una clase)').toEqual([])
  })

  it('no quedan palabras de curva sueltas en el CSS: los bucles usan ease-in-out (con infinite) y lo demás, un token', () => {
    const sueltas = [CSS, FOIL].flatMap((css) => sinComentarios(css).split('\n').filter((linea) => /(^|[\s:,(])ease(-in|-out)?(?=[\s;,)])/.test(linea)))

    expect(sueltas).toEqual([])
  })

  it('lo pasajero se va con un fundido: al 95 % de su vida la opacidad queda bajo 0,3 y termina en 0', () => {
    // El −N, el globo y el emoji se quedan y se funden en el último 15 % (del 85 % al 100 %), con la curva de salida (`--ease-out`) en el cuadro del 85 %.
    const inicio = CSS.indexOf('@keyframes linger {')
    const cuadros = [...sinComentarios(CSS.slice(inicio, CSS.indexOf('@keyframes', inicio + 1))).matchAll(/(\d+)%\s*\{([^}]*)\}/g)].map(([, pct, cuerpo]) => ({
      pct: Number(pct),
      opacidad: Number(/opacity:\s*([\d.]+)/.exec(cuerpo)![1]),
      curva: /animation-timing-function:\s*(cubic-bezier\([^)]*\))/.exec(cuerpo)?.[1],
    }))
    const desde = cuadros.find((cuadro) => cuadro.pct === 85)!
    const hasta = cuadros.find((cuadro) => cuadro.pct === 100)!

    expect(desde.curva).toBe(token('ease-out'))
    expect(hasta.opacidad).toBe(0)

    // Cubic-bezier como lo evalúa el navegador: se busca el parámetro del tramo para el x de ese instante (bisección) y se lee el y.
    const [x1, y1, x2, y2] = desde.curva!.slice('cubic-bezier('.length, -1).split(',').map(Number)
    const punto = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3
    const avance = (x: number) => {
      let bajo = 0
      let alto = 1
      for (let i = 0; i < 60; i += 1) {
        const medio = (bajo + alto) / 2

        if (punto(medio, x1!, x2!) < x) bajo = medio
        else alto = medio
      }

      return punto((bajo + alto) / 2, y1!, y2!)
    }
    const fraccion = (95 - desde.pct) / (hasta.pct - desde.pct)
    const opacidadAl95 = desde.opacidad + (hasta.opacidad - desde.opacidad) * avance(fraccion)

    expect(opacidadAl95).toBeLessThan(0.3)
  })
})
