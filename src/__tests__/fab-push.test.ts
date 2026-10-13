import { describe, expect, it } from 'vitest'

import { moveClearOf, pushFabApart, resolveFabGroup, type FabBounds, type FabPosition } from '../app/fab-position'

// Un celular de 375×812 con la barra de pasos abajo.
const BOUNDS = (size: number): FabBounds => ({ width: 375, height: 812, size, margin: 12, bottomInset: 76, leftInset: 0 })
const GAP = 8

/** ¿Se tocan dos cuadrados (posición de la esquina y lado) a menos de `GAP`? */
const touch = (a: FabPosition, aSize: number, b: FabPosition, bSize: number) => pushFabApart(a, aSize, b, bSize, GAP) !== null

describe('empujón entre botones flotantes', () => {
  it('no toca al otro si no se enciman', () => {
    expect(pushFabApart({ x: 0, y: 0 }, 56, { x: 200, y: 0 }, 56, 8)).toBeNull()
    // Justo a la distancia mínima tampoco.
    expect(pushFabApart({ x: 0, y: 0 }, 56, { x: 64, y: 0 }, 56, 8)).toBeNull()
  })

  it('corre al otro en la dirección entre los centros hasta dejar el hueco', () => {
    const pushed = pushFabApart({ x: 100, y: 100 }, 56, { x: 120, y: 110 }, 56, 8)!

    expect(Math.hypot(pushed.x - 100, pushed.y - 100)).toBeCloseTo(64, 1)
    expect(pushed.x).toBeGreaterThan(120)
    expect(pushed.y).toBeGreaterThan(110)
  })

  it('si están justo encimados, lo manda para arriba', () => {
    expect(pushFabApart({ x: 50, y: 200 }, 56, { x: 50, y: 200 }, 56, 8)).toEqual({ x: 50, y: 136 })
  })
})

describe('salir del paso sin salirse de la pantalla', () => {
  it('con el botón clavado contra el costado, se corre hacia arriba o abajo en vez de quedarse encima', () => {
    // Botón en el borde derecho; la mascota (96) llega desde la izquierda y queda a medio camino.
    const body = { position: { x: 307, y: 300 }, size: 56 }
    const mascot = { position: { x: 267, y: 290 }, size: 96 }

    const next = moveClearOf(body, mascot, BOUNDS(56), GAP)

    expect(next.x).toBeLessThanOrEqual(307)
    expect(touch(mascot.position, 96, next, 56)).toBe(false)
  })

  it('si no se tocan devuelve la misma posición', () => {
    const body = { position: { x: 307, y: 600 }, size: 56 }

    expect(moveClearOf(body, { position: { x: 12, y: 100 }, size: 96 }, BOUNDS(56), GAP)).toBe(body.position)
  })
})

describe('un grupo de botones y mascota', () => {
  it('dos botones apilados contra el borde, con la mascota encima: ninguno queda tocando a otro', () => {
    const mascot = { position: { x: 267, y: 252 }, size: 96 }
    const life = { position: { x: 307, y: 260 }, size: 56, bounds: BOUNDS(56) }
    const practice = { position: { x: 307, y: 324 }, size: 56, bounds: BOUNDS(56) }

    const [lifeNext, practiceNext] = resolveFabGroup(mascot, [life, practice], GAP)

    expect(touch(mascot.position, 96, lifeNext!, 56)).toBe(false)
    expect(touch(mascot.position, 96, practiceNext!, 56)).toBe(false)
    expect(touch(lifeNext!, 56, practiceNext!, 56)).toBe(false)
    // Siguen dentro de la pantalla.
    for (const position of [lifeNext!, practiceNext!]) {
      expect(position.x).toBeGreaterThanOrEqual(12)
      expect(position.x).toBeLessThanOrEqual(307)
      expect(position.y).toBeGreaterThanOrEqual(12)
      expect(position.y).toBeLessThanOrEqual(812 - 56 - 12 - 76)
    }
  })

  it('lo que ya está libre queda igual (mismo objeto)', () => {
    const mascot = { position: { x: 12, y: 600 }, size: 96 }
    const far = { position: { x: 307, y: 100 }, size: 56, bounds: BOUNDS(56) }

    expect(resolveFabGroup(mascot, [far], GAP)[0]).toBe(far.position)
  })
})
