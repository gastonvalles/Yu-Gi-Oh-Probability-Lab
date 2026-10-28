import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DEAL_EDGE_AT, dealFrames, type DealPose } from '../app/deal-flight'
import { EASE_IN_OUT, bezierEase } from '../app/motion'
import { riffle } from '../app/shuffle-fx'

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

  // Barajar y dar vuelta sólo se suman (`add`) a una carta que ya se mueve (otra animación de su `transform`, que tampoco se compondría): quietas van en `replace`.
  it('barajar una mano quieta va en `replace`, con la posición de cada carta delante; una que se reacomoda (robó) se suma a ese movimiento', () => {
    const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = []
    const card = (moving: boolean) =>
      ({
        animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => calls.push({ frames, options }),
        getAnimations: () => (moving ? [{ id: '', effect: { getKeyframes: () => [{ transform: 'none' }] } }] : []),
      }) as unknown as Element
    const style = globalThis.getComputedStyle
    globalThis.getComputedStyle = (() => ({ transform: 'matrix(1, 0, 0, 1, 40, 3)' })) as unknown as typeof getComputedStyle
    ;(globalThis as Record<string, unknown>).KeyframeEffect = class { get composite() { return 'replace' } }

    try {
      riffle([card(false), card(true)])
    } finally {
      globalThis.getComputedStyle = style
      delete (globalThis as Record<string, unknown>).KeyframeEffect
    }

    expect(calls[0]!.options).not.toHaveProperty('composite')
    expect(calls[0]!.frames[1]!.transform).toBe('matrix(1, 0, 0, 1, 40, 3) translate(-18px, -10px) rotate(-8deg)')
    expect(calls[1]!.options).toMatchObject({ composite: 'add', delay: 24 })
    expect(calls[1]!.frames[1]!.transform).toBe('translate(18px, -10px) rotate(8deg)')
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
      riffle([card])
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
      riffle([card('a'), card('b'), card('c')])
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

  const poses: [DealPose, DealPose, DealPose, DealPose] = [
    { x: 300, y: 260, rotate: -16, scale: 0.6, opacity: 0.9 },
    { x: 200, y: -26, rotate: -4, scale: 1.12, opacity: 1 },
    { x: 100, y: 1, rotate: -2.5, scale: 1.03, opacity: 1 },
    { x: 100, y: 8, rotate: -4, scale: 1, opacity: 1 },
  ]
  const frames = dealFrames(poses)

  it('el reparto es una sola animación de `transform` y `opacity` (la sombra va aparte), muestreada cada ~16 ms', () => {
    for (const frame of frames) expect(Object.keys(frame).sort()).toEqual(['offset', 'opacity', 'transform'])
    expect(frames.length).toBeGreaterThanOrEqual(30)
    expect(frames.map((frame) => frame.offset as number)).toEqual(frames.map((frame) => frame.offset as number).sort((a, b) => a - b))
    // El vuelo de la mano no lleva la sombra en sus cuadros.
    expect(read('components', 'probability', 'PracticeHand.tsx')).not.toMatch(/transform:[^\n]*boxShadow|boxShadow:[^\n]*transform:/)
  })

  it('pasa por las mismas poses que el camino y el giro sumados: sale de dorso, queda de canto cuando el dorso se cambia por la cara y se asienta en su lugar', () => {
    expect(frames[0]).toEqual({ offset: 0, opacity: 0.9, transform: 'perspective(700px) translate3d(300px, 260px, 0) rotate(-16deg) scale(0.6) rotateY(0deg)' })
    expect(frames.at(-1)).toEqual({ offset: 1, opacity: 1, transform: 'perspective(700px) translate3d(100px, 8px, 0) rotate(-4deg) scale(1) rotateY(0deg)' })
    // Arriba (al 42 %) está la pose del medio, con el giro que lleva la curva de los vuelos ahí.
    const top = frames.find((frame) => frame.offset === 0.42)!
    const turn = 180 * bezierEase(EASE_IN_OUT)(0.42) - 180
    expect(top.transform).toBe(`perspective(700px) translate3d(200px, -26px, 0) rotate(-4deg) scale(1.12) rotateY(${Math.round(turn * 1000) / 1000}deg)`)
    // De canto justo cuando la curva llega a la mitad (el mismo instante en que el dorso se apaga): dos cuadros en el mismo momento, de 90 a −90.
    expect(bezierEase(EASE_IN_OUT)(DEAL_EDGE_AT)).toBeCloseTo(0.5, 4)
    const edge = frames.filter((frame) => frame.offset === Math.round(DEAL_EDGE_AT * 1000) / 1000).map((frame) => /rotateY\((-?[\d.]+)deg\)/.exec(frame.transform as string)?.[1])
    expect(edge).toEqual(['90', '-90'])
  })
})
