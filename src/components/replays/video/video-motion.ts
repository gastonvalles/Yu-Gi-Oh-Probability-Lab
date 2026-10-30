import { easeInOut } from '../../../app/motion'
import { cardRect, type Rect, type Scene, type SceneCard, type SceneSlot } from './video-scene'

/**
 * Las transiciones del video entre dos escenas seguidas (puro): cada carta se busca por su lado y su id en las dos, y la que cambió de lugar vuela (del campo al
 * cementerio, del deck a la mano, de la mano al campo, la mano que se reacomoda), la que aparece de la nada (una ficha) entra con un fundido y la que cambia de cara (se
 * muestra, se voltea, sale del deck de dorso y llega boca arriba) se da vuelta, en su lugar o en el camino. Cada carta en vuelo se dibuja con la cara que muestra la
 * escena de después, o la de antes si después queda escondida en una pila: nunca algo que ninguna de las dos mostraba. Cuándo y cuánto vuela cada una: `video-fx.ts`.
 */

/** Dónde está una carta: su centro, su tamaño parada y su giro (acostada, π/2; la del rival, de cabeza, π más). */
export interface Pose {
  x: number
  y: number
  w: number
  h: number
  angle: number
}

export interface Motion {
  /** `lado:id`. */
  key: string
  card: SceneCard
  /** null: aparece (fundido). */
  from: Pose | null
  to: Pose
  /** Se da vuelta (en su lugar o volando): la cara de antes. */
  fromCard?: SceneCard
}

export function poseOf(rect: Rect, card: Pick<SceneCard, 'sideways' | 'upsideDown' | 'tilt'>): Pose {
  const r = cardRect(rect, card.sideways)
  const [w, h] = card.sideways ? [r.h, r.w] : [r.w, r.h]
  return { x: r.x + r.w / 2, y: r.y + r.h / 2, w, h, angle: (card.sideways ? Math.PI / 2 : 0) + (card.upsideDown ? Math.PI : 0) + (card.tilt ?? 0) }
}

interface Place {
  pose: Pose
  /** La cara que se ve; sin ella, la carta está en la casilla pero tapada (una del medio de una pila, un material Xyz). */
  card?: SceneCard
}

/** Dónde está cada carta de una escena, por `lado:id`: las que se ven y las que están debajo de otra (en una pila o como material). */
export function placesOf(scene: Scene): Map<string, Place> {
  const places = new Map<string, Place>()
  scene.sides.forEach((side, index) => {
    const upsideDown = index === 1
    for (const slot of [...side.slots, ...side.hand]) {
      if (slot.card) places.set(`${index}:${slot.card.id}`, { pose: poseOf(slot.rect, slot.card), card: slot.card })
      for (const id of slot.ids) if (id !== slot.card?.id) places.set(`${index}:${id}`, { pose: poseOf(slot.rect, { sideways: false, upsideDown }) })
    }
  })
  return places
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5
const samePose = (a: Pose, b: Pose) => near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && Math.abs(a.angle - b.angle) < 0.01
const sameFace = (a: SceneCard, b: SceneCard) => a.faceDown === b.faceDown && a.art === b.art

/** Lo que se mueve de `before` a `after`. */
export function transitionOf(before: Scene, after: Scene): Motion[] {
  const from = placesOf(before)
  const to = placesOf(after)
  const motions: Motion[] = []
  for (const [key, place] of to) {
    const was = from.get(key)
    if (place.card) {
      if (!was) motions.push({ key, card: place.card, from: null, to: place.pose })
      else if (was.card && !sameFace(was.card, place.card)) motions.push({ key, card: place.card, from: was.pose, to: place.pose, fromCard: was.card })
      else if (!samePose(was.pose, place.pose)) motions.push({ key, card: place.card, from: was.pose, to: place.pose })
    } else if (was?.card && !samePose(was.pose, place.pose)) {
      // Se va a quedar tapada (al fondo del deck, debajo de un monstruo Xyz): vuela con la cara que tenía, y desaparece al llegar.
      motions.push({ key, card: was.card, from: was.pose, to: place.pose })
    }
  }
  return motions
}

/** Dónde va la carta en el momento `t` (0 a 1) de su vuelo: con la curva de los vuelos de la mesa (`EASE_IN_OUT`), arranca suave y llega suave. */
export function poseAt(motion: Motion, t: number): Pose {
  const { from, to } = motion
  if (!from) return to
  const e = easeInOut(t)
  const mix = (a: number, b: number) => a + (b - a) * e
  return { x: mix(from.x, to.x), y: mix(from.y, to.y), w: mix(from.w, to.w), h: mix(from.h, to.h), angle: mix(from.angle, to.angle) }
}

/** Las cartas que dibuja una transición y no la escena de abajo (en su casilla de destino se ve lo que había antes hasta que llega). */
export const movingKeys = (motions: readonly Motion[]) => new Set(motions.map((motion) => motion.key))

/** La casilla de `before` en el mismo lugar que `slot` (para dibujarla mientras la carta nueva viaja hacia ahí). */
export const slotUnder = (before: Scene, side: 0 | 1, slot: SceneSlot) => before.sides[side].slots.find((other) => other.rect.x === slot.rect.x && other.rect.y === slot.rect.y)
