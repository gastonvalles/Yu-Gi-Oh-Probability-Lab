import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DEAL_EDGE_AT, DEAL_LAND_AT, dealFrames, type DealPose } from '../app/deal-flight'
import { EASE_IN_OUT, bezierEase } from '../app/motion'
import { HAND_SHUFFLE_MS, SHUFFLE_ID, shuffleDeck, shuffleHand } from '../app/shuffle-fx'

// Lo que se mueve en la mesa va en la GPU (el compositor) sólo si anima `transform`/`translate`/`rotate`/`scale` y `opacity`, en `replace`: con `composite: 'add'`, o con
// una sombra en los mismos cuadros, Chromium la corre en el hilo principal y cualquier render de React la traba (los «tirones» del celular).
const SRC = path.resolve(__dirname, '..')
/** El código de un archivo, sin sus comentarios (que sí pueden nombrar lo que ya no se usa). */
const read = (...parts: string[]) =>
  readFileSync(path.join(SRC, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

describe('las animaciones de la mano, el ataque, el barajado y el dar vuelta se componen en la GPU', () => {
  it('sacudir, embestir, repartir y la mano del rival no se suman con `composite`', () => {
    for (const file of [['components', 'probability', 'AttackFx.tsx'], ['components', 'probability', 'PracticeHand.tsx'], ['components', 'duel', 'DuelTable.tsx'], ['app', 'deal-flight.ts']]) {
      expect(read(...file), file.join('/')).not.toMatch(/composite\s*:/)
    }
  })

  // Barajar va siempre en `replace`, con el lugar de la carta en el medio de sus cuadros (la GPU lo compone sola); una carta que todavía llega volando no se suma a ese vuelo: se espera.
  it('barajar va en `replace`, con la posición de cada carta en sus cuadros; si una carta todavía llega volando, se baraja cuando aterriza', async () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = []
    let land = () => {}
    const flight = { id: '', finished: new Promise<void>((resolve) => (land = resolve)), effect: { getComputedTiming: () => ({ endTime: 380 }), getKeyframes: () => [{ transform: 'none' }] } }
    const card = (arriving: boolean) => {
      let flying = arriving

      return {
        isConnected: true,
        animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => calls.push({ frames, options }),
        getAnimations: () => (flying ? ((flying = false), [flight]) : []),
      } as unknown as Element
    }
    const style = globalThis.getComputedStyle
    globalThis.getComputedStyle = (() => ({ transform: 'matrix(1, 0, 0, 1, 40, 3)' })) as unknown as typeof getComputedStyle

    try {
      shuffleHand([card(false), card(true)])
      expect(calls).toHaveLength(0)
      land()
      await flight.finished
      await Promise.resolve()
    } finally {
      globalThis.getComputedStyle = style
    }

    expect(calls).toHaveLength(2)
    for (const { frames, options } of calls) {
      expect(options).toEqual({ id: SHUFFLE_ID, duration: HAND_SHUFFLE_MS })
      expect(frames[0]!.transform).toBe('translate(0px, 0px) matrix(1, 0, 0, 1, 40, 3) rotate(0deg)')
      expect(frames.at(-1)).toMatchObject({ offset: 1, transform: frames[0]!.transform })
      for (const frame of frames) expect(String(frame.transform)).toMatch(/^translate\([^)]*\) matrix\(1, 0, 0, 1, 40, 3\) rotate\([^)]*\)$/)
    }
    // Las pares a un lado y las impares al otro: sus paquetes salen hacia lados opuestos.
    const packetX = (index: number) => Number(/^translate\((-?[\d.]+)px/.exec(String(calls[index]!.frames[2]!.transform))![1])
    expect(Math.sign(packetX(0))).not.toBe(Math.sign(packetX(1)))
  })

  // Lo que el dedo toca al arrastrar y lo que cambia con cada pregunta: un borde o una sombra que transiciona corre en el hilo principal en cada cuadro.
  // La carta que se enciende destella con `filter` (`animate-card-glow`): si el atenuado también transiciona `filter`, son dos animaciones de la misma propiedad y ninguna va en la GPU.
  it('las cartas de la mano sólo transicionan lo que se mueve y las casillas del campo no transicionan `box-shadow` ni el color del borde', () => {
    const hand = read('components', 'probability', 'PracticeHand.tsx')
    const transitions = [...hand.matchAll(/\[transition:([^\]]*)\]/g)].map((match) => match[1]!)
    expect(transitions).toHaveLength(1)
    expect(transitions[0]!.split(',').map((entry) => entry.split('_')[0])).toEqual(['transform', 'translate', 'scale'])
    expect(hand).toMatch(/'data-\[state=dragging\]:transition-none'/)
    expect(read('components', 'probability', 'PracticeMat.tsx')).toMatch(/'relative min-w-0 transition-\[color,background-color\] duration-150'/)
  })

  // Una Web Animation terminada que sigue en el elemento le saca a la GPU toda transición de `transform` que venga después («incompatible»): el abanico se abría en el hilo principal.
  it('el reparto y el barajado se cancelan al terminar', () => {
    let finish = () => {}
    const animation = { cancelled: false, cancel: () => void (animation.cancelled = true), addEventListener: (_: string, done: () => void) => void (finish = done) }
    const card = { animate: () => animation, getAnimations: () => [] } as unknown as Element
    const style = globalThis.getComputedStyle
    globalThis.getComputedStyle = (() => ({ transform: 'none' })) as unknown as typeof getComputedStyle

    try {
      shuffleDeck([card])
    } finally {
      globalThis.getComputedStyle = style
    }

    expect(animation.cancelled).toBe(false)
    finish()
    expect(animation.cancelled).toBe(true)
    expect(read('components', 'probability', 'PracticeHand.tsx')).toMatch(/const flight = cancelWhenDone\(element\.animate\(/)
  })

  // Una sola fase de lectura y después las escrituras (Gastón, 2026-10-27: tirones en el celular): leer una carta después de escribir en otra recalcula los estilos carta por carta.
  it('barajar lee las animaciones de todas las cartas antes de cortar o animar ninguna', () => {
    const log: string[] = []
    const card = (name: string) =>
      ({
        animate: () => { log.push(`animate:${name}`); return {} },
        getAnimations: () => { log.push(`read:${name}`); return [{ id: 'riffle', cancel: () => log.push(`cancel:${name}`), effect: { getKeyframes: () => [{ transform: 'none' }] } }] },
      }) as unknown as Element
    const style = globalThis.getComputedStyle
    globalThis.getComputedStyle = (() => ({ transform: 'none' })) as unknown as typeof getComputedStyle

    try {
      shuffleHand([card('a'), card('b'), card('c')])
    } finally {
      globalThis.getComputedStyle = style
    }

    expect(log.slice(0, 3)).toEqual(['read:a', 'read:b', 'read:c'])
    expect(log.slice(3)).toEqual(['cancel:a', 'cancel:b', 'cancel:c', 'animate:a', 'animate:b', 'animate:c'])
  })

  // Lo mismo para una Web Animation terminada de un vuelo entre zonas, del golpe de una pila o del giro de una carta del campo: terminadas, se cancelan.
  it('los vuelos entre zonas, el golpe de la pila y el giro de una carta del campo se cancelan al terminar', () => {
    const flights = read('app', 'use-card-flights.ts')
    expect(flights).toContain('animation: cancelWhenDone(element.animate(keyframes, timing))')
    expect(flights).toContain('const animation = cancelWhenDone(flight.element.animate(')
    expect(flights).toContain("cancelWhenDone(element.animate([{ scale: '1' }")
    expect(read('components', 'probability', 'PracticeMat.tsx')).toContain('cancelWhenDone(card.animate(flipFrames')
  })

  // La copia que vuela por encima de la mano se ubica con el plano del campo (`planeOf`): escribirle al campo `transform: none` para medir y devolvérselo recalculaba estilos dos veces en el toque.
  it('la copia que vuela por encima no le escribe al campo inclinado para medir', () => {
    expect(read('app', 'use-card-flights.ts')).not.toContain('field.style.transform =')
  })

  it('la mano del rival no anima el ancho de su caja', () => {
    expect(read('components', 'duel', 'DuelTable.tsx')).not.toMatch(/transition:width|transition-\[width/)
  })

  const from: DealPose = { x: 300, y: 260, rotate: -10, scale: 0.6, opacity: 0.9 }
  const to: DealPose = { x: 100, y: 8, rotate: -4, scale: 1, opacity: 1 }
  const frames = dealFrames(from, to, 24)
  const pose = (frame: Keyframe) => /translate3d\((-?[\d.]+)px, (-?[\d.]+)px, 0\) rotate\((-?[\d.]+)deg\) scale\((-?[\d.]+)\) rotateY\((-?[\d.]+)deg\)/.exec(String(frame.transform))!.slice(1).map(Number)

  it('el reparto es una sola animación de `transform` y `opacity` (la sombra va aparte), muestreada cada ~13 ms', () => {
    for (const frame of frames) expect(Object.keys(frame).sort()).toEqual(['offset', 'opacity', 'transform'])
    expect(frames.length).toBeGreaterThanOrEqual(30)
    expect(frames.map((frame) => frame.offset as number)).toEqual(frames.map((frame) => frame.offset as number).sort((a, b) => a - b))
    // El vuelo de la mano no lleva la sombra en sus cuadros.
    expect(read('components', 'probability', 'PracticeHand.tsx')).not.toMatch(/transform:[^\n]*boxShadow|boxShadow:[^\n]*transform:/)
  })

  it('sale del mazo de dorso, va a su lugar por un solo camino que no vuelve atrás ni rebota, queda de canto cuando el dorso se cambia por la cara y se asienta', () => {
    expect(frames[0]).toEqual({ offset: 0, opacity: 0.9, transform: 'perspective(700px) translate3d(300px, 260px, 0) rotate(-10deg) scale(0.6) rotateY(0deg)' })
    expect(frames.at(-1)).toEqual({ offset: 1, opacity: 1, transform: 'perspective(700px) translate3d(100px, 8px, 0) rotate(-4deg) scale(1) rotateY(0deg)' })
    // Hasta aterrizar, cada cuadro está más cerca de su lugar (en x) que el anterior: sin parada arriba ni rebote; la curva sube un poco (y por encima de la recta).
    const flight = frames.filter((frame) => Number(frame.offset) <= DEAL_LAND_AT).map(pose)
    for (let index = 1; index < flight.length; index += 1) expect(flight[index]![0]).toBeLessThanOrEqual(flight[index - 1]![0])
    // Aterriza en su lugar apenas más grande y, después, sólo se asienta (no se mueve más).
    const landed = frames.filter((frame) => Number(frame.offset) >= DEAL_LAND_AT).map(pose)
    expect(landed[0]!.slice(0, 4)).toEqual([100, 8, -4, 1.04])
    for (const [x, y] of landed) expect([x, y]).toEqual([100, 8])
    // De canto justo cuando el giro va por la mitad (el mismo instante en que el dorso se apaga): dos cuadros en el mismo momento, de 90 a −90.
    expect(bezierEase(EASE_IN_OUT)(DEAL_EDGE_AT / DEAL_LAND_AT)).toBeCloseTo(0.5, 2)
    const edge = frames.filter((frame) => frame.offset === DEAL_EDGE_AT).map((frame) => pose(frame)[4])
    expect(edge).toEqual([90, -90])
  })
})
