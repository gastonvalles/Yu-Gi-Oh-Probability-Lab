import { duelReplayAt, walkReplay, type DuelReplay, type ReplayFrame, type ReplaySide } from '../../../app/duel-replay'
import { cardImageSrc } from '../../../app/card-image-source'
import { matEffects, type MatEffects, type ShowcaseKind, type SpotlightKind } from '../../../app/mat-effects'
import { describeStep } from '../../../app/mat-step-info'
import { KIND_KEY, ORIGIN_KEY, routeOf } from '../../../app/mat-step-text'
import { isToken, type MatAction, type MatPhase, type MatPile, type MatState, type Placed } from '../../../app/practice-mat'
import { t } from '../../../i18n'
import { artOfDrawId, passcodeOfDrawId } from '../../duel/duel-art'
import type { FxTone } from '../../probability/practice-styles'
import { cardName, playerName, realOf, stepText } from '../duel-replay-text'

/**
 * Qué se dibuja en un cuadro del video de un replay, sin dibujar nada: dónde va cada casilla (en un lienzo vertical 9:16, la mesa compacta del celular: las pilas del rival arriba,
 * espejadas, y las tuyas abajo, como en `DuelTable`) y qué carta hay en cada una, de qué lado se ve y qué hay que resaltar. Puro: `video-draw.ts` lo pinta. Las casillas de un
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
  score: Rect
  theirHand: Rect
  myHand: Rect
  text: Rect
  footer: Rect
  cell: number
  /** La casilla de la fila `row` (0 = la de arriba, la de las pilas del rival) y la columna `col` (0 = izquierda). */
  cellAt: (row: number, col: number) => Rect
  /** La fila del medio (las Zonas Extra): ahí va el título y el cierre. */
  middle: number
}

/** El diseño del lienzo: medidas en el de referencia (720×1280) por la escala. Un alto distinto de 16:9 deja aire abajo o lo recorta: el video es siempre 9:16. */
export function videoLayout(width: number): VideoLayout {
  const s = width / BASE_W
  const cell = 112 * s
  const gap = 8 * s
  const fieldW = 5 * cell + 4 * gap
  const x0 = (width - fieldW) / 2
  const y0 = 196 * s
  const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x * s, y: y * s, w: w * s, h: h * s })

  return {
    scale: s,
    score: box(24, 20, 672, 84),
    theirHand: box(64, 116, 592, 70),
    myHand: box(64, 1040, 592, 104),
    text: box(24, 1150, 672, 90),
    footer: box(24, 1244, 672, 28),
    cell,
    cellAt: (row, col) => ({ x: x0 + col * (cell + gap), y: y0 + row * (cell + gap), w: cell, h: cell }),
    middle: 3,
  }
}

/** El rectángulo de la mesa (todas sus casillas): ahí van la placa, la carta grande y el cartel. */
export function fieldRect(cells: readonly Rect[]): Rect {
  const xs = cells.flatMap((cell) => [cell.x, cell.x + cell.w])
  const ys = cells.flatMap((cell) => [cell.y, cell.y + cell.h])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }
}

/** La mitad del campo de un lado: de su fila de monstruos a la de sus pilas, de punta a punta (`FIELD_HALF` de la mesa). */
export function halfOf(layout: VideoLayout, rows: { piles: number; mz: number }): Rect {
  const top = layout.cellAt(Math.min(rows.piles, rows.mz), 0)
  const bottom = layout.cellAt(Math.max(rows.piles, rows.mz), 4)
  return { x: top.x, y: top.y, w: bottom.x + bottom.w - top.x, h: bottom.y + bottom.h - top.y }
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

/** Las casillas de `rows` filas de 5, sin las tres de la fila del medio que no son Zonas Extra (columnas 0, 2 y 4). */
export const cellsOf = (layout: VideoLayout, rows: number) =>
  Array.from({ length: rows * 5 }, (_, index) => [Math.floor(index / 5), index % 5] as const)
    .filter(([row, col]) => !(row === layout.middle && col % 2 === 0))
    .map(([row, col]) => layout.cellAt(row, col))

export const VIDEO_HEIGHT_OF = (width: number) => Math.round((width * BASE_H) / BASE_W)

/** La carta dentro de su casilla: parada (59×86) o acostada, centrada. */
export function cardRect(cell: Rect, sideways: boolean): Rect {
  const long = cell.h * 0.96
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


// Las filas de la mesa compacta: 0 pilas del rival, 1 sus Mágicas y Trampas, 2 sus monstruos, 3 el medio, 4 tus monstruos, 5 tus Mágicas y Trampas, 6 tus pilas.
const PILE_COLS: Record<ReplaySide, Record<MatPile | 'field', number>> = {
  // Abajo: Extra · Banish · Campo · GY · Deck (el Deck y el Extra en sus extremos).
  0: { extra: 0, banished: 1, field: 2, gy: 3, deck: 4, hand: -1 },
  // Arriba, espejado: Deck · GY · Campo · Banish · Extra.
  1: { deck: 0, gy: 1, field: 2, banished: 3, extra: 4, hand: -1 },
}

/**
 * Las casillas de un lado con lo que tienen. `rows`: en qué fila de `layout` van sus pilas, sus Mágicas y Trampas y sus monstruos (las Zonas Extra, en `layout.middle`);
 * `top`: es el de arriba, espejado y de cabeza. `shown`: la carta que se muestra en esta jugada (una colocada que se revela se ve boca arriba en ese cuadro).
 */
export function sideSlots(state: MatState, layout: VideoLayout, rows: { piles: number; st: number; mz: number }, top: boolean, look: Look, shown: string | null): SceneSlot[] {
  const side: ReplaySide = top ? 1 : 0
  // El rival, espejado: su zona 1 queda a la derecha.
  const col = (index: number) => (top ? 4 - index : index)
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
    }
  }
  const zone = (placed: Placed | null, rect: Rect, monster = false): SceneSlot =>
    placed ? { rect, card: card(placed.id, placed, true, monster), ids: [placed.id, ...placed.materials] } : { rect, ids: [] }
  const pile = (name: MatPile, ids: readonly string[], faceUp: (id: string) => boolean): SceneSlot => {
    const last = name === 'deck' ? ids[0] : ids.at(-1)
    return {
      rect: layout.cellAt(rows.piles, PILE_COLS[side][name]),
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
    { ...zone(state.field, layout.cellAt(rows.piles, PILE_COLS[side].field)), ...(state.field ? {} : { label: t('practice.zone.fieldLabel') }) },
    // Las Zonas Extra son de los dos: la 0 tuya es la 1 del rival (`SharedZone`). Están en las columnas 1 y 3 del medio.
    ...state.emz.flatMap((placed, index) => (placed ? [zone(placed, layout.cellAt(layout.middle, top ? 3 - 2 * index : 1 + 2 * index), true)] : [])),
    pile('deck', state.deck, () => false),
    pile('extra', state.extra, (id) => state.extraUp.includes(id)),
    pile('gy', state.gy, () => true),
    pile('banished', state.banished, (id) => !state.facedown.includes(id)),
  ]
}

/** Las cartas que nombra una jugada (en un lote, las de todas sus partes); `other` las que son del otro lado (a quién ataca). */
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
  return { own, other: action.type === 'attack' && action.target ? [action.target] : [] }
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
export function handSlots(ids: readonly string[], area: Rect, look: Look, open: (id: string) => boolean): SceneSlot[] {
  const rects = handRects(area, ids.length)
  // El abanico de la mesa (`restTransform` de `PracticeHand`): 2,2° por carta desde el medio y las de los costados un poco más abajo (1,6 px por carta², en una de ~96 px de alto).
  const middle = (ids.length - 1) / 2
  const dip = area.h / 96
  return ids.map((id, index) => {
    const face = open(id) ? look(id) : null
    const rect = rects[index]!
    return {
      rect: { ...rect, y: rect.y + Math.min(6, (index - middle) ** 2 * 1.6) * dip },
      ids: [id],
      card: { id, art: face?.art ?? null, name: face?.name ?? '', faceDown: !face, sideways: false, upsideDown: false, counters: 0, materials: 0, tilt: ((index - middle) * FAN_DEGREES * Math.PI) / 180 },
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
    const rows = side === 1 ? { piles: 0, st: 1, mz: 2 } : { piles: 6, st: 5, mz: 4 }
    return {
      name: playerName(replay, side),
      lp: frame.lp[side],
      fieldArt: state.field ? fieldArtUrl(state.field, realOf(replay, frame, side, state.field.id)) : null,
      half: halfOf(layout, rows),
      slots: sideSlots(state, layout, rows, side === 1, look, shown),
      hand: handSlots(state.hand, side === 0 ? layout.myHand : layout.theirHand, look, (id) => (side === 0 && replay.view === 'mine') || id === shown),
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
    cells: cellsOf(layout, 7),
    layout,
  }
}

export const VIDEO_FOOTER = () => 'YGOUltraLab'

/** Las imágenes que puede pedir el video: el arte de cada carta que aparece (por su passcode) y el de la ficha. Se cargan antes de dibujar el primer cuadro. */
export const artUrls = (replay: Pick<DuelReplay, 'cards'>) =>
  [...Object.keys(replay.cards).map((code) => `card-${code}-1`), 'token-0'].flatMap((id) => {
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
