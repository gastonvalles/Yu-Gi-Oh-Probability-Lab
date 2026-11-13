import { duelReplayAt, walkReplay, type DuelReplay, type ReplayFrame, type ReplaySide } from '../../../app/duel-replay'
import { cardImageSrc } from '../../../app/card-image-source'
import { replayCodes } from '../../../app/duel-replay-share'
import { matEffects, type MatEffects, type ShowcaseKind, type SpotlightKind } from '../../../app/mat-effects'
import { describeStep } from '../../../app/mat-step-info'
import { KIND_KEY, ORIGIN_KEY, routeOf } from '../../../app/mat-step-text'
import { FOREIGN_PREFIX, isToken, type MatAction, type MatPhase, type MatPile, type MatState, type Placed } from '../../../app/practice-mat'
import { t } from '../../../i18n'
import { artOfDrawId, passcodeOfDrawId } from '../../duel/duel-art'
import { phoneDuelLayout } from '../../probability/compact-field'
import type { FxTone } from '../../probability/practice-styles'
import { cardName, playerName, realOf, stepText } from '../duel-replay-text'

/**
 * Qué se dibuja en un cuadro del video de un replay, sin dibujar nada: dónde va cada casilla (en un lienzo vertical 9:16, la mesa del celular de `phoneDuelLayout`: siete columnas, las
 * pilas a los costados, el rival arriba y espejado, como en `DuelTable`) y qué carta hay en cada una, de qué lado se ve y qué hay que resaltar. Puro: `video-draw.ts` lo pinta. Las casillas de un
 * lado (`sideSlots`) y la mano (`handSlots`) las usa también el video de un combo (`video-combo.ts`), que es de un solo jugador.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** El lienzo de referencia: todo se mide en él y se escala al tamaño del video (720×1280, o 1080×1920 ×1,5). */
const BASE_W = 720
const BASE_H = 1280

/** Una carta a la vista: su arte (por el proxy, del mismo origen: el lienzo se puede leer) o, si no carga, el nombre; de dorso, sin nada. */
export interface SceneCard {
  id: string
  art: string | null
  name: string
  faceDown: boolean
  /** En defensa (o colocada en una zona de monstruo): acostada. */
  sideways: boolean
  /** Del rival: mira hacia él, de cabeza (como en la mesa). */
  upsideDown: boolean
  counters: number
  materials: number
  /** Atenuada: una handtrap del rival que ya usó (el simulador de «Jugar solo»). */
  dim?: boolean
  /** Su giro en el abanico de la mano (radianes), como `fanAngle` de la mesa. */
  tilt?: number
  /** Marcada como objetivo (`MatState.targeted`): lleva la mira de la mesa (`drawTargetMark`). */
  targeted?: boolean
}

export interface SceneSlot {
  rect: Rect
  /** El rótulo de una pila vacía o de una casilla de pila («GY», «Deck»…). */
  label?: string
  /** Cuántas cartas hay (sólo las pilas). */
  count?: number
  card?: SceneCard
  /** Todos los ids que hay en la casilla (una pila entera): para saber qué resaltar. */
  ids: string[]
  /** Es una pila (el deck se baraja ahí). */
  pile?: MatPile
}

export interface SceneSide {
  name: string
  lp: number
  slots: SceneSlot[]
  hand: SceneSlot[]
  /** El arte recortado de su Magia de Campo boca arriba (`fieldArtUrl`), de fondo de su mitad del campo (`half`), como `FieldArt` de la mesa. */
  fieldArt?: string | null
  half?: Rect
}

/**
 * Lo que explica la franja de abajo, sólo con lo que la jugada dice (`describeStep`, lo mismo que el panel de Pasos): su clase (el chip, en el color de su destello), de dónde
 * sale la carta, «Qué se mueve» (una línea por carta; la que se paga como costo, marcada: sólo si la jugada lo dice, `activate.cost`) y si se barajó el Deck.
 */
export interface Explain {
  kind: string
  tone: FxTone | null
  origin: string | null
  lines: { name: string; route: string; tag?: string }[]
  /** Cuántas cartas se mueven en total (las de más, «y N cartas más»). */
  total: number
  note: string | null
}

export interface Scene {
  width: number
  height: number
  /** Abajo, quien grabó (lado 0); arriba, el rival. */
  sides: [SceneSide, SceneSide]
  turn: ReplaySide
  turnText: string
  /** La fase de quien tiene el turno: no se dibuja siempre, sólo el cartel cuando cambia (`video-fx.ts`). */
  phase: MatPhase
  /** Quién hizo la jugada de este cuadro, cuál fue y lo que la mesa muestra con ella (`matEffects`: la carta grande del centro, el destello, el cartel de la fase…). */
  actor: ReplaySide | null
  action: MatAction | null
  effects: MatEffects | null
  /** Cómo se ve lo que se activa, se muestra o se declara en esta jugada, aunque esté en una mano tapada (activarlo lo muestra): la carta grande del centro. */
  spotlit?: Record<string, { art: string | null; name: string }>
  /** La jugada en texto (o «La mesa al empezar»), y su número. */
  stepLabel: string
  stepText: string
  /** La marca del sitio, abajo. */
  footer: string
  /** Lo que se movió o se activó en esta jugada: un aro ámbar. */
  focus: Rect[]
  /** Las casillas de la mesa (sus líneas tenues, con carta o sin ella). */
  cells: Rect[]
  /** Un combo: su nombre y el del deck arriba, en vez de las vidas y el turno. */
  heading?: { title: string; subtitle: string }
  /** La franja que explica la jugada (null al empezar). */
  explain: Explain | null
  /** Un rótulo chico (la «Mano del rival» del simulador de handtraps en un combo). */
  caption?: { text: string; rect: Rect }
  layout: VideoLayout
}

export interface VideoLayout {
  scale: number
  /** Cuántos px del lienzo mide un px del celular de referencia (`PHONE_WIDTH`): la banda de fase y lo que copia medidas de la mesa del celular. */
  unit: number
  score: Rect
  theirHand: Rect
  myHand: Rect
  text: Rect
  footer: Rect
  /** El ancho de una casilla del centro. */
  cell: number
  /**
   * La casilla de la fila `row` (0 = la de arriba) y la columna `col` (0 a 6), como la grilla de `DuelTable`: las del centro (1 a 5) con forma de carta (el alto de la fila); las de los costados
   * (0 y 6, las pilas y la Zona de campo), de una carta del ancho de su columna, centradas en la fila.
   */
  cellAt: (row: number, col: number) => Rect
  /** La fila del medio (el Banish de cada uno a su costado, las Zonas Extra y la caja de la fase): ahí van el título, el cierre y la banda de fase. */
  middle: number
}

/** El celular de referencia: el campo del video es el de la mesa a 390 px (`phoneDuelLayout`, con filas del alto de una carta), escalado al ancho del lienzo. */
export const PHONE_WIDTH = 390
const PHONE = phoneDuelLayout(PHONE_WIDTH, 844, { tilted: false, bar: 0, bottom: 0 })
/** El hueco entre casillas (`max-sm:gap-0.75`) y el ancho de una columna de los costados (0,6857 de una del centro). */
const PHONE_GAP = 3
const SIDE_COLUMN = 0.6857
/** Una carta: 421 × 614. */
const CARD_ASPECT = 614 / 421

/** La grilla de siete columnas de la mesa del celular, `unit` px por px del celular, centrada a lo ancho de `width` y con el borde de arriba de su primera fila en `top`. */
export function fieldGrid(width: number, top: number, unit = width / PHONE_WIDTH): Pick<VideoLayout, 'unit' | 'cell' | 'cellAt'> {
  const cell = PHONE.cell * unit
  const row = PHONE.row * unit
  const gap = PHONE_GAP * unit
  const side = cell * SIDE_COLUMN
  const x0 = (width - PHONE.fieldWidth * unit) / 2
  const xOf = (col: number) => x0 + (col === 0 ? 0 : side + gap + (col - 1) * (cell + gap))
  return {
    unit,
    cell,
    cellAt: (r, col) => {
      const y = top + r * (row + gap)
      if (col > 0 && col < 6) return { x: xOf(col), y, w: cell, h: row }
      const h = side * CARD_ASPECT
      return { x: xOf(col), y: y + (row - h) / 2, w: side, h }
    },
  }
}

/** El diseño del lienzo: medidas en el de referencia (720×1280) por la escala. Un alto distinto de 16:9 deja aire abajo o lo recorta: el video es siempre 9:16. */
export function videoLayout(width: number): VideoLayout {
  const s = width / BASE_W
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x * s, y: y * s, w: w * s, h: h * s })
  // Entre las vidas (hasta 104) y el texto (desde 1120, con 4 de aire): la mano del rival, 6 px del celular, el campo, 8 y tu mano, cada mano con lo que suben o bajan las puntas
  // de su abanico (`handSlots`: 1/16 de su alto). El campo se angosta lo que haga falta para que entren las manos del tamaño de la mesa.
  const handPerUnit = (HAND_PER_CELL * PHONE.cell * 86) / 59
  const unit = (1012 / (PHONE.fieldHeight + 6 + 8 + handPerUnit * (1 + RIVAL_HAND) * (17 / 16))) * s
  const hand = handPerUnit * unit
  const rival = hand * RIVAL_HAND
  const fieldTop = 104 * s + (rival * 17) / 16 + 6 * unit

  return {
    scale: s,
    score: box(24, 20, 672, 84),
    theirHand: { x: 64 * s, y: fieldTop - 6 * unit - rival, w: 592 * s, h: rival },
    myHand: { x: 64 * s, y: fieldTop + PHONE.fieldHeight * unit + 8 * unit, w: 592 * s, h: hand },
    text: box(24, 1120, 672, 120),
    footer: box(24, 1244, 672, 28),
    ...fieldGrid(width, fieldTop, unit),
    middle: 2,
  }
}

/**
 * La carta de tu mano mide 1,53 casillas de ancho, como en la mesa del celular (a 369×800: carta de 82 px, casilla de 54); la del rival, 0,8 de la tuya (`RIVAL_SCALE` de la mesa).
 * Así el video es la mesa del celular entera (con márgenes a los costados: el lienzo 9:16 es más ancho que un celular) y no un campo grande con manos chicas.
 */
const HAND_PER_CELL = 1.53
const RIVAL_HAND = 0.8

/** El rectángulo de la mesa (todas sus casillas): ahí van la placa, la carta grande y el cartel. */
export function fieldRect(cells: readonly Rect[]): Rect {
  const xs = cells.flatMap((cell) => [cell.x, cell.x + cell.w])
  const ys = cells.flatMap((cell) => [cell.y, cell.y + cell.h])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** La mitad del campo de un lado: su fila de monstruos y la de sus Mágicas y Trampas, de punta a punta (`FIELD_HALF` de la mesa). */
export function halfOf(layout: VideoLayout, rows: Rows): Rect {
  const top = layout.cellAt(Math.min(rows.st, rows.mz), 1)
  const bottom = layout.cellAt(Math.max(rows.st, rows.mz), 1)
  const left = layout.cellAt(rows.mz, 0).x
  const right = layout.cellAt(rows.mz, 6)
  return { x: left, y: top.y, w: right.x + right.w - left, h: bottom.y + bottom.h - top.y }
}

/** El arte recortado de la Magia de Campo boca arriba (`real`: su id real), por el proxy a 512 px, como `fieldArtSrc` de la mesa; null boca abajo o si no se sabe cuál es. */
export function fieldArtUrl(field: Placed | null, real: string | null | undefined): string | null {
  if (!field || field.pos === 'set' || !real) return null
  const passcode = passcodeOfDrawId(real)
  return passcode === null ? null : cardImageSrc(`https://images.ygoprodeck.com/images/cards_cropped/${passcode}.jpg`, 512)
}

/** El color de la carta grande y del destello, como `STAGE_TONE` de `MatFx.tsx` (el test lo vigila); también el del chip de la franja (`stepTone` de la mesa). */
export const STAGE_TONE: Record<SpotlightKind | ShowcaseKind, FxTone> = {
  activate: 'gold', target: 'red', reveal: 'cyan', declare: 'violet', attack: 'red',
  normal: 'gold', special: 'cyan', fusion: 'violet', synchro: 'white', xyz: 'indigo', link: 'teal',
  hand: 'cyan', gy: 'violet', banish: 'amber', extra: 'cyan', deck: 'cyan', attach: 'indigo',
}

/** Cuántas cartas nombra «Qué se mueve» en el video; las demás, «y N cartas más». */
const MAX_LINES = 4

/** La franja de una jugada (`before`: la mesa de quien jugó, antes). */
export function explainOf(before: MatState, action: MatAction, effects: MatEffects, nameOf: (id: string) => string): Explain {
  const info = describeStep(before, action)
  const cost = action.type === 'activate' && action.cost ? action.id : null
  const tone = effects.spotlight ? STAGE_TONE[effects.spotlight.kind] : effects.landing ? STAGE_TONE[effects.landing.tone] : effects.showcase ? STAGE_TONE[effects.showcase.kind] : effects.quiet ? STAGE_TONE[effects.quiet.kind] : null
  return {
    kind: t(KIND_KEY[info.kind]),
    tone: action.type === 'phase' ? null : tone,
    origin: info.origin ? t(ORIGIN_KEY[info.origin]) : null,
    lines: info.moves.slice(0, MAX_LINES).map((move) => ({ name: nameOf(move.id), route: routeOf(move, nameOf), ...(move.id === cost ? { tag: t('meta.duels.video.cost') } : {}) })),
    total: info.moves.length,
    note: effects.shuffle ? t('meta.duels.video.shuffled') : null,
  }
}

/**
 * Las casillas de `rows` filas de 7, como `DuelTable`: en la fila del medio no son casillas las de las fases (columnas 1, 3 y 5) y, con un solo jugador (`both` falso, el combo), tampoco el
 * Banish del rival (columna 0).
 */
export const cellsOf = (layout: VideoLayout, rows: number, both = true) =>
  Array.from({ length: rows * 7 }, (_, index) => [Math.floor(index / 7), index % 7] as const)
    .filter(([row, col]) => row !== layout.middle || (col % 2 === 0 && (both || col > 0)))
    .map(([row, col]) => layout.cellAt(row, col))

export const VIDEO_HEIGHT_OF = (width: number) => Math.round((width * BASE_H) / BASE_W)

/** La carta dentro de su casilla: parada (59×86) o acostada, centrada; la más grande que entra a lo alto y a lo ancho, con un margen (en defensa pisa a las vecinas, como en la mesa). */
export function cardRect(cell: Rect, sideways: boolean): Rect {
  const long = Math.min(cell.h, (cell.w * 86) / 59) * 0.96
  const short = long * (59 / 86)
  const [w, h] = sideways ? [long, short] : [short, long]
  return { x: cell.x + (cell.w - w) / 2, y: cell.y + (cell.h - h) / 2, w, h }
}

/** Las cartas de una mano en su franja, encimadas si no entran (de izquierda a derecha, en su orden). */
export function handRects(area: Rect, count: number): Rect[] {
  if (count === 0) return []
  const h = area.h
  const w = h * (59 / 86)
  const room = (area.w - w) / Math.max(1, count - 1)
  const step = Math.min(w + area.h * 0.08, room)
  const used = w + step * (count - 1)
  const x0 = area.x + (area.w - used) / 2
  return Array.from({ length: count }, (_, index) => ({ x: x0 + index * step, y: area.y, w, h }))
}

/** El arte de una carta por su id real (o una ficha), por el proxy (chico: 128 px alcanzan para una casilla del video). */
export const artOfId = (id: string | undefined) => {
  const url = artOfDrawId(id)
  return url ? cardImageSrc(url, 128) : null
}

/** Cómo se ve una carta que está boca arriba: su arte y su nombre; null si no se sabe cuál es (se dibuja de dorso). */
export type Look = (id: string) => { art: string | null; name: string } | null

/** En el replay de un duelo: lo que se sabe de cada lado en ese momento (`realOf`). */
const duelLook = (replay: DuelReplay, frame: ReplayFrame, side: ReplaySide): Look => (id) => {
  if (!isToken(id) && !realOf(replay, frame, side, id)) return null
  return { art: artOfId(isToken(id) ? id : realOf(replay, frame, side, id)), name: cardName(replay, frame, side)(id) }
}


/** En qué fila de `layout` van los monstruos y las Mágicas y Trampas de un lado (las Zonas Extra y su Banish, en `layout.middle`). */
export interface Rows {
  mz: number
  st: number
}

// Las pilas y la Zona de campo, en las columnas de los costados como en `DuelTable` (`MINE_ROWS`, `THEIR_ROWS`, `middleRow`): la fila (de monstruos, de Mágicas y Trampas o la del medio) y la columna.
const PILE_AT: Record<ReplaySide, Record<MatPile | 'field', readonly [keyof Rows | 'middle', number]>> = {
  // Abajo: Campo · monstruos · GY, Extra · Mágicas y Trampas · Deck, y el Banish a la derecha del medio.
  0: { field: ['mz', 0], gy: ['mz', 6], extra: ['st', 0], deck: ['st', 6], banished: ['middle', 6], hand: ['middle', -1] },
  // Arriba, espejado: Deck · Mágicas y Trampas · Extra, GY · monstruos · Campo, y el Banish a la izquierda del medio.
  1: { deck: ['st', 0], extra: ['st', 6], gy: ['mz', 0], field: ['mz', 6], banished: ['middle', 0], hand: ['middle', -1] },
}

/** Las filas de cada lado en el video de un duelo: el rival arriba (Mágicas y Trampas, monstruos), quien grabó abajo. */
export const duelRows = (side: ReplaySide): Rows => (side === 1 ? { st: 0, mz: 1 } : { mz: 3, st: 4 })

/**
 * La casilla de un lugar de la mesa de un duelo, con las claves de los medallones de la cadena (`medalPlaceOf`: `mz:0`, `st:2`, `emz:1`, `field`, las pilas y `hand`), en el mismo
 * lugar que pone `sideSlots` a cada carta; la mano, su franja. Null si la clave no es de la mesa.
 */
export function placeRect(layout: VideoLayout, side: ReplaySide, place: string): Rect | null {
  const rows = duelRows(side)
  const [zone, at] = place.split(':')
  const index = Number(at)
  if (zone === 'mz' || zone === 'st') return layout.cellAt(rows[zone], side === 1 ? 5 - index : 1 + index)
  if (zone === 'emz') return layout.cellAt(layout.middle, side === 1 ? 4 - 2 * index : 2 + 2 * index)
  if (zone === 'hand') return side === 0 ? layout.myHand : layout.theirHand
  const pile = PILE_AT[side][zone as MatPile | 'field']
  return pile ? layout.cellAt(pile[0] === 'middle' ? layout.middle : rows[pile[0]], pile[1]) : null
}

/**
 * Las casillas de un lado con lo que tienen. `rows`: en qué fila de `layout` van sus monstruos y sus Mágicas y Trampas (las Zonas Extra, en `layout.middle`);
 * `top`: es el de arriba, espejado y de cabeza. `shown`: la carta que se muestra en esta jugada (una colocada que se revela se ve boca arriba en ese cuadro).
 */
export function sideSlots(state: MatState, layout: VideoLayout, rows: Rows, top: boolean, look: Look, shown: string | null): SceneSlot[] {
  const side: ReplaySide = top ? 1 : 0
  // El rival, espejado: su zona 1 queda a la derecha. Las cinco del centro van en las columnas 1 a 5.
  const col = (index: number) => (top ? 5 - index : 1 + index)
  const pileRect = (name: MatPile | 'field') => {
    const [row, column] = PILE_AT[side][name]
    return layout.cellAt(row === 'middle' ? layout.middle : rows[row], column)
  }
  // En una zona de monstruo, lo que no está en ataque va acostado (en defensa, o colocado).
  const card = (id: string, placed?: Placed, faceUp = true, monster = false): SceneCard => {
    const face = id !== shown && (!faceUp || placed?.pos === 'set') ? null : look(id)
    return {
      id,
      art: face?.art ?? null,
      name: face?.name ?? '',
      faceDown: !face,
      sideways: monster && placed !== undefined && placed.pos !== 'atk',
      upsideDown: top,
      counters: placed?.counters ?? 0,
      materials: placed?.materials.length ?? 0,
      ...(state.targeted.includes(id) ? { targeted: true } : {}),
    }
  }
  const zone = (placed: Placed | null, rect: Rect, monster = false): SceneSlot =>
    placed ? { rect, card: card(placed.id, placed, true, monster), ids: [placed.id, ...placed.materials] } : { rect, ids: [] }
  const pile = (name: MatPile, ids: readonly string[], faceUp: (id: string) => boolean): SceneSlot => {
    // Arriba, la marcada como objetivo si hay una (como la mesa); si no, la de arriba.
    const last = ids.filter((id) => state.targeted.includes(id)).at(-1) ?? (name === 'deck' ? ids[0] : ids.at(-1))
    return {
      rect: pileRect(name),
      pile: name,
      label: t(`practice.pile.short.${name}`),
      count: ids.length,
      ids: [...ids],
      ...(last ? { card: card(last, undefined, faceUp(last)) } : {}),
    }
  }

  return [
    ...state.mz.map((placed, index) => zone(placed, layout.cellAt(rows.mz, col(index)), true)),
    ...state.st.map((placed, index) => zone(placed, layout.cellAt(rows.st, col(index)))),
    { ...zone(state.field, pileRect('field')), ...(state.field ? {} : { label: t('practice.zone.fieldLabel') }) },
    // Las Zonas Extra son de los dos: la 0 tuya es la 1 del rival (`SharedZone`). Están en las columnas 2 y 4 del medio.
    ...state.emz.flatMap((placed, index) => (placed ? [zone(placed, layout.cellAt(layout.middle, top ? 4 - 2 * index : 2 + 2 * index), true)] : [])),
    pile('deck', state.deck, () => false),
    pile('extra', state.extra, (id) => state.extraUp.includes(id)),
    pile('gy', state.gy, () => true),
    pile('banished', state.banished, (id) => !state.facedown.includes(id)),
  ]
}

/** Las cartas que nombra una jugada (en un lote, las de todas sus partes); `other` las que son del otro lado (a quién ataca; la que se le da, ya en su campo). */
export function actionIds(action: MatAction): { own: string[]; other: string[] } {
  if (action.type === 'batch') {
    const parts = action.actions.map(actionIds)
    return { own: parts.flatMap((part) => part.own), other: parts.flatMap((part) => part.other) }
  }
  const own = [
    ...('id' in action ? [action.id] : []),
    ...(action.type === 'draw' && action.ids ? action.ids : []),
    ...(action.type === 'tribute' ? action.tributes : []),
    ...(action.type === 'summon' ? action.materials : []),
    ...(action.type === 'attach' ? [action.to] : []),
  ]
  return { own, other: action.type === 'attack' && action.target ? [action.target] : action.type === 'give' ? [`${FOREIGN_PREFIX}${action.id}`] : [] }
}

/**
 * Dónde está, después de la jugada, lo que la jugada tocó: las casillas (o las cartas de la mano) que tienen alguna de sus cartas. Robar sin `ids` resalta lo que entró a la mano;
 * una ficha nueva, su zona; mandar al cementerio desde el deck, el cementerio.
 */
export function focusOf(action: MatAction, before: MatState, state: MatState, mine: SceneSide, theirs: SceneSide): Rect[] {
  const { own, other } = actionIds(action)
  if (action.type === 'draw' && !action.ids) own.push(...state.hand.filter((id) => !before.hand.includes(id)))
  if (action.type === 'mill') own.push(...state.gy.filter((id) => !before.gy.includes(id)))
  if (action.type === 'token') {
    const placed = state[action.zone][action.index]
    if (placed) own.push(placed.id)
  }
  const find = (scene: SceneSide, ids: readonly string[]) =>
    [...scene.slots, ...scene.hand].filter((slot) => slot.ids.some((id) => ids.includes(id))).map((slot) => slot.rect)
  return [...find(mine, own), ...find(theirs, other)]
}

/** Las mismas cartas de una mano en su franja: boca arriba lo que `look` conoce y `open` deja ver (o la que se muestra en esta jugada). */
export function handSlots(ids: readonly string[], area: Rect, look: Look, open: (id: string) => boolean, top = false, targeted: readonly string[] = []): SceneSlot[] {
  const rects = handRects(area, ids.length)
  // El abanico de la mesa (`restTransform` de `PracticeHand`): 2,2° por carta desde el medio y las de los costados un poco más abajo (1,6 px por carta², en una de ~96 px de alto). La de arriba (`top`),
  // espejada como `TheirHand`: las puntas suben.
  const middle = (ids.length - 1) / 2
  const dip = (area.h / 96) * (top ? -1 : 1)
  return ids.map((id, index) => {
    const face = open(id) ? look(id) : null
    const rect = rects[index]!
    return {
      rect: { ...rect, y: rect.y + Math.min(6, (index - middle) ** 2 * 1.6) * dip },
      ids: [id],
      card: { id, art: face?.art ?? null, name: face?.name ?? '', faceDown: !face, sideways: false, upsideDown: false, counters: 0, materials: 0, tilt: (((index - middle) * FAN_DEGREES * Math.PI) / 180) * (top ? -1 : 1), ...(targeted.includes(id) ? { targeted: true } : {}) },
    }
  })
}

/** Los grados por carta del abanico de la mano (`fanDegrees` de la mesa). */
export const FAN_DEGREES = 2.2

/** La escena de un cuadro: la mesa después de `cursor` jugadas. `before` (la mesa del lado que jugó, antes) hace falta para el texto y el resaltado de la jugada. */
export function sceneAt(replay: DuelReplay, frame: ReplayFrame, cursor: number, before: MatState | null, width: number): Scene {
  const layout = videoLayout(width)
  const step = cursor > 0 ? replay.steps[cursor - 1] : undefined
  const sides = ([0, 1] as const).map((side): SceneSide => {
    const state = frame.states[side]
    const look = duelLook(replay, frame, side)
    // La mano de quien grabó, boca arriba sólo con «mi mano»; la del rival, de dorso. La carta que se muestra en esta jugada, boca arriba en la mano de cualquiera.
    const shown = step?.[0] === side && step[1].type === 'reveal' ? step[1].id : null
    const rows = duelRows(side)
    return {
      name: playerName(replay, side),
      lp: frame.lp[side],
      fieldArt: state.field ? fieldArtUrl(state.field, realOf(replay, frame, side, state.field.id)) : null,
      half: halfOf(layout, rows),
      slots: sideSlots(state, layout, rows, side === 1, look, shown),
      hand: handSlots(state.hand, side === 0 ? layout.myHand : layout.theirHand, look, (id) => (side === 0 && replay.view === 'mine') || id === shown, side === 1, state.targeted),
    }
  }) as [SceneSide, SceneSide]
  // Un cambio de fase no resalta ninguna casilla: lo dice su cartel.
  const action = step?.[1]
  const focus = action?.type !== 'phase' && step && before ? focusOf(step[1], before, frame.states[step[0]], sides[step[0]], sides[1 - step[0]]!) : []
  const effects = step && before ? matEffects(before, step[1]) : null
  const lit = effects?.spotlight ? (effects.spotlight.ids ?? [effects.spotlight.id]) : []
  const spotlit = Object.fromEntries(lit.flatMap((id) => {
    const face = duelLook(replay, frame, step![0])(id)
    return face ? [[id, face] as const] : []
  }))

  return {
    width,
    height: VIDEO_HEIGHT_OF(width),
    sides,
    turn: frame.turn,
    turnText: t('meta.duels.turn', { turn: frame.turnNumber, name: playerName(replay, frame.turn) }),
    phase: frame.states[frame.turn].phase,
    actor: step?.[0] ?? null,
    action: action ?? null,
    effects,
    spotlit,
    stepLabel: cursor === 0 ? t('meta.duels.start') : t('meta.duels.step', { n: cursor, total: replay.steps.length }),
    stepText: step && before ? stepText(replay, step, before, frame) : '',
    explain: step && before && effects ? explainOf(before, step[1], effects, cardName(replay, frame, step[0])) : null,
    focus,
    footer: VIDEO_FOOTER(),
    cells: cellsOf(layout, 5),
    layout,
  }
}

export const VIDEO_FOOTER = () => 'YGOUltraLab'

/** Las imágenes que puede pedir el video: el arte de cada carta que aparece (por su passcode: un enlace no trae los nombres) y el de la ficha. Se cargan antes del primer cuadro. */
export const artUrls = (replay: DuelReplay) =>
  [...replayCodes(replay).map((code) => `card-${code}-1`), 'token-0'].flatMap((id) => {
    const url = artOfDrawId(id)
    return url ? [cardImageSrc(url, 128)] : []
  })

/** La escena de cada cursor, en orden (0 = la mesa al empezar): cada una sale de la foto más cercana de `walkReplay`, como cuando se salta en el reproductor. */
export function* replayScenes(replay: DuelReplay, width: number): Generator<Scene> {
  const shots = walkReplay(replay)
  let frame = duelReplayAt(replay, 0, shots)
  yield sceneAt(replay, frame, 0, null, width)
  for (let cursor = 1; cursor <= replay.steps.length; cursor += 1) {
    const before = frame.states[replay.steps[cursor - 1]![0]]
    frame = duelReplayAt(replay, cursor, shots)
    yield sceneAt(replay, frame, cursor, before, width)
  }
}
