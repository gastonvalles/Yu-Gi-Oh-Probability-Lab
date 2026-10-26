/** Un punto de la pantalla, en píxeles. */
export type Point = readonly [x: number, y: number]
type Matrix = [number, number, number, number, number, number, number, number, number]

/** La homografía (3×3, por filas) que lleva el rectángulo `width` × `height` a sus esquinas en la pantalla: arriba a la izquierda, arriba a la derecha, abajo a la derecha, abajo a la izquierda (Heckbert). */
function rectToQuad(width: number, height: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: readonly [Point, Point, Point, Point]): Matrix {
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const den = (x1 - x2) * (y3 - y2) - (x3 - x2) * (y1 - y2)
  const g = (sx * (y3 - y2) - (x3 - x2) * sy) / den
  const h = ((x1 - x2) * sy - sx * (y1 - y2)) / den

  return [(x1 - x0 + g * x1) / width, (x3 - x0 + h * x3) / height, x0, (y1 - y0 + g * y1) / width, (y3 - y0 + h * y3) / height, y0, g / width, h / height, 1]
}

function multiply(a: Matrix, b: Matrix): Matrix {
  const out = [0, 0, 0, 0, 0, 0, 0, 0, 0] as Matrix

  for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) out[r * 3 + c] = a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!
  return out
}

function invert([a, b, c, d, e, f, g, h, i]: Matrix): Matrix {
  const A = e * i - f * h
  const B = f * g - d * i
  const C = d * h - e * g
  const det = a * A + b * B + c * C

  return [A / det, (c * h - b * i) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, (c * d - a * f) / det, C / det, (b * g - a * h) / det, (a * e - b * d) / det]
}

/**
 * Lo que hay que ponerle a un rectángulo (`transform` con `transform-origin: 0 0`) que un ancestro inclina en 3D (la mesa en perspectiva) para que en la pantalla se vea derecho y sin
 * aplastar: con su proporción, del ancho que tiene ahora su borde de abajo y apoyado en el mismo punto (el centro de ese borde). `corners` son sus esquinas en la pantalla sin
 * `transform` propio. Sin nada que corregir (ni inclinado ni aplastado), `null`.
 */
export function flatTransform(width: number, height: number, corners: readonly [Point, Point, Point, Point]): string | null {
  if (width <= 0 || height <= 0) return null
  const quad = rectToQuad(width, height, corners)
  const [m11, m12, , m21, m22, , m31, m32] = quad

  // Sin medidas (las cuatro esquinas en el mismo punto, como en jsdom): nada.
  if (!quad.every(Number.isFinite)) return null
  // Ya derecho: sin perspectiva, sin giro y con la misma escala a lo ancho y a lo alto.
  if (Math.abs(m31) < 1e-7 && Math.abs(m32) < 1e-7 && Math.abs(m12) < 1e-4 && Math.abs(m21) < 1e-4 && Math.abs(m11 - m22) < 1e-3 * Math.abs(m11)) return null
  const [bl, br] = [corners[3], corners[2]]
  const scale = Math.hypot(br[0] - bl[0], br[1] - bl[1]) / width
  const project = (x: number, y: number): Point => {
    const w = m31 * x + m32 * y + 1

    return [(quad[0] * x + quad[1] * y + quad[2]) / w, (quad[3] * x + quad[4] * y + quad[5]) / w]
  }
  const [ax, ay] = project(width / 2, height)
  const local = multiply(invert(quad), [scale, 0, ax - (scale * width) / 2, 0, scale, ay - scale * height, 0, 0, 1])
  const n = local.map((value) => value / local[8]!)

  return `matrix3d(${[n[0], n[3], 0, n[6], n[1], n[4], 0, n[7], 0, 0, 1, 0, n[2], n[5], 0, 1].map((value) => Number(value!.toPrecision(10))).join(', ')})`
}
