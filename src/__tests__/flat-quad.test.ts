import { flatTransform, type Point } from '../app/flat-quad'

/** La mesa en 3D como la arma el CSS (`perspective` y `rotateX` desde el borde de abajo, `scaleY` y el zoom): de un punto de la mano (en px, con el origen en ese borde) a la pantalla. */
function tilted({ tilt, perspective, stretch, zoom, x0, y0 }: { tilt: number; perspective: number; stretch: number; zoom: number; x0: number; y0: number }) {
  const rad = (tilt * Math.PI) / 180

  return ([x, y]: Point): Point => {
    const sy = (y0 + y) * stretch
    const w = 1 - (sy * Math.sin(rad)) / perspective

    return [(zoom * (x0 + x)) / w + 500, (zoom * sy * Math.cos(rad)) / w + 800]
  }
}

/** Lo que pone `flatTransform`, como homografía: de un punto del rectángulo a su lugar corregido (todavía sin la mesa). */
function apply(css: string, [x, y]: Point): Point {
  const m = /matrix3d\(([^)]+)\)/.exec(css)![1]!.split(',').map(Number)
  const w = m[3]! * x + m[7]! * y + m[15]!

  return [(m[0]! * x + m[4]! * y + m[12]!) / w, (m[1]! * x + m[5]! * y + m[13]!) / w]
}

describe('flatTransform: la mano del rival, derecha sobre la mesa inclinada', () => {
  const W = 232
  const H = 112

  it.each([
    { tilt: 30, perspective: 1100, stretch: 1 / Math.cos(Math.PI / 6), zoom: 1.2, x0: -W / 2, y0: -720 },
    { tilt: 26, perspective: 900, stretch: 1, zoom: 1, x0: -W / 2, y0: -560 },
    { tilt: 14, perspective: 900, stretch: 1 / Math.cos((14 * Math.PI) / 180), zoom: 1, x0: -W / 2, y0: -500 },
  ])('a $tilt° queda con su proporción, apoyada en el mismo punto y del ancho de su borde de abajo', (mesa) => {
    const screen = tilted(mesa)
    const corners = [screen([0, 0]), screen([W, 0]), screen([W, H]), screen([0, H])] as [Point, Point, Point, Point]
    const css = flatTransform(W, H, corners)!
    const [tl, tr, br, bl] = ([[0, 0], [W, 0], [W, H], [0, H]] as Point[]).map((point) => screen(apply(css, point)))
    const bottom = Math.hypot(corners[2][0] - corners[3][0], corners[2][1] - corners[3][1])

    // Derecha: los lados son horizontales y verticales, y mide lo mismo arriba que abajo.
    expect(tl![1]).toBeCloseTo(tr![1], 6)
    expect(bl![1]).toBeCloseTo(br![1], 6)
    expect(tl![0]).toBeCloseTo(bl![0], 6)
    expect(tr![0]).toBeCloseTo(br![0], 6)
    // Con su proporción (antes, aplastada) y del ancho de su borde de abajo, apoyada en el centro de ese borde.
    expect((tr![0] - tl![0]) / (bl![1] - tl![1])).toBeCloseTo(W / H, 6)
    expect(Math.abs((corners[1][0] - corners[0][0]) / (corners[3][1] - corners[0][1]) - W / H)).toBeGreaterThan(0.1)
    expect(br![0] - bl![0]).toBeCloseTo(bottom, 6)
    expect((bl![0] + br![0]) / 2).toBeCloseTo((corners[2][0] + corners[3][0]) / 2, 6)
    expect(bl![1]).toBeCloseTo(screen([W / 2, H])[1], 6)
  })

  it('sin inclinación (la vista de arriba, un zoom o un corrimiento) no le pone nada', () => {
    const corners: [Point, Point, Point, Point] = [[10, 20], [10 + W * 1.5, 20], [10 + W * 1.5, 20 + H * 1.5], [10, 20 + H * 1.5]]

    expect(flatTransform(W, H, corners)).toBeNull()
    expect(flatTransform(0, H, corners)).toBeNull()
  })
})
