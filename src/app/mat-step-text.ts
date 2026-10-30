import { t } from '../i18n'
import type { StepKind, StepMove, StepOrigin, StepPlace } from './mat-step-info'
import type { MatPile } from './practice-mat'

/** Las palabras de la lista de pasos (el chip, de dónde sale, «Qué se mueve»): las usan el panel de Pasos y el video de un combo. */

/** El chip de cada clase de jugada: las palabras del menú de la carta (Invocación Normal, Colocar, Activar…). */
export const KIND_KEY = {
  draw: 'practice.kind.draw',
  mill: 'practice.kind.mill',
  shuffle: 'practice.kind.shuffle',
  normal: 'practice.kind.normal',
  special: 'practice.kind.special',
  fusion: 'practice.kind.fusion',
  synchro: 'practice.kind.synchro',
  xyz: 'practice.kind.xyz',
  link: 'practice.kind.link',
  flip: 'practice.kind.flip',
  set: 'practice.kind.set',
  activate: 'practice.kind.activate',
  target: 'practice.kind.target',
  reveal: 'practice.kind.reveal',
  declare: 'practice.kind.declare',
  attack: 'practice.kind.attack',
  position: 'practice.kind.position',
  counter: 'practice.kind.counter',
  token: 'practice.kind.token',
  toHand: 'practice.kind.toHand',
  toGy: 'practice.kind.toGy',
  banish: 'practice.kind.banish',
  toExtra: 'practice.kind.toExtra',
  toDeck: 'practice.kind.toDeck',
  attach: 'practice.kind.attach',
  zone: 'practice.kind.zone',
  control: 'practice.kind.control',
  phase: 'practice.kind.phase',
  turn: 'practice.kind.turn',
  other: 'practice.kind.other',
} as const satisfies Record<StepKind, string>

export const ORIGIN_KEY = {
  deck: 'practice.origin.deck',
  extra: 'practice.origin.extra',
  hand: 'practice.origin.hand',
  gy: 'practice.origin.gy',
  banished: 'practice.origin.banished',
  field: 'practice.origin.field',
} as const satisfies Record<StepOrigin, string>

export const PLACE_KEY = {
  deck: 'practice.place.deck',
  extra: 'practice.place.extra',
  hand: 'practice.place.hand',
  gy: 'practice.place.gy',
  banished: 'practice.place.banished',
} as const satisfies Record<MatPile, string>

export const ZONE_KEY = { mz: 'practice.zone.mz', emz: 'practice.zone.emz', st: 'practice.zone.st' } as const

/** Un lugar de la mesa dicho con palabras: «Mano», «Zona de monstruo 3», «Debajo de Zeus». */
export function placeName(place: StepPlace, nameOf: (id: string) => string): string {
  if (place.kind === 'pile') return t(PLACE_KEY[place.pile])
  if (place.kind === 'material') return t('practice.place.material', { name: nameOf(place.of) })

  return place.spot === 'field' ? t('practice.zone.field') : t('practice.zone.numbered', { zone: t(ZONE_KEY[place.spot]), n: place.n })
}

/** De dónde a dónde va una carta; una ficha aparece de la nada o desaparece. */
export function routeOf(move: StepMove, nameOf: (id: string) => string): string {
  if (move.from && move.to) return t('practice.moves.route', { from: placeName(move.from, nameOf), to: placeName(move.to, nameOf) })

  return move.to ? t('practice.moves.appears', { to: placeName(move.to, nameOf) }) : move.from ? t('practice.moves.leaves', { from: placeName(move.from, nameOf) }) : ''
}

