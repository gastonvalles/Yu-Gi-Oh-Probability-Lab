import { allMatIds, isToken, matReducer, replayMat, type MatAction, type MatState, type Placed } from './practice-mat'

/**
 * Mesa pública: cómo se espeja la mesa de un jugador en el dispositivo del rival (duelo por enlace)
 * sin mostrarle la mano, el deck ni las cartas boca abajo.
 *
 * Los ids de la mesa llevan la identidad de la carta (`card-123-2`), así que por la red las cartas
 * viajan con ids opacos (`c1`, `c2`…). El rival sólo sabe qué carta es una cuando está donde puede
 * verla (campo boca arriba, cementerio, destierro boca arriba, materiales Xyz) o cuando se la muestran
 * (`reveal`, `declare`, `activate`). Es para jugar con amigos: no impide que alguien mire el tráfico.
 *
 * Todo es puro y el espejo usa el mismo `matReducer`: la jugada se aplica igual de los dos lados, con
 * las mismas semillas de mezcla, y por eso el espejo queda idéntico a la mesa de quien juega.
 */

/** Lo que viaja por cada jugada: la jugada con ids opacos y las cartas que dejan de ser secretas. */
export interface WireAct {
  action: MatAction
  /** id opaco → id real de las cartas que el rival ve por primera vez con esta jugada. */
  reveal: Record<string, string>
}

type IdMap = (id: string) => string

/** Un id opaco (`c1`, `c2`…): así llama el rival a sus cartas por la red. Los ids reales (`card-123-2`) y las fichas (`token-1`) no lo son. */
export const isOpaqueId = (id: string) => /^c[0-9]+$/.test(id)

const MAX_ID_LENGTH = 100

function mapPlaced(placed: Placed | null, map: IdMap): Placed | null {
  return placed && { ...placed, id: map(placed.id), materials: placed.materials.map(map) }
}

/** La misma mesa con cada carta renombrada. */
export function mapMatIds(state: MatState, map: IdMap): MatState {
  return {
    ...state,
    deck: state.deck.map(map),
    extra: state.extra.map(map),
    hand: state.hand.map(map),
    gy: state.gy.map(map),
    banished: state.banished.map(map),
    mz: state.mz.map((placed) => mapPlaced(placed, map)),
    emz: state.emz.map((placed) => mapPlaced(placed, map)),
    st: state.st.map((placed) => mapPlaced(placed, map)),
    field: mapPlaced(state.field, map),
    facedown: state.facedown.map(map),
    extraUp: state.extraUp.map(map),
    targeted: state.targeted.map(map),
    ...(state.held ? { held: Object.fromEntries(Object.entries(state.held).map(([xyz, materials]) => [map(xyz), materials.map(map)])) } : {}),
  }
}

/**
 * La misma jugada con cada carta renombrada. El `switch` es exhaustivo a propósito: una jugada nueva
 * no compila hasta decir qué ids lleva (si no, viajaría con la identidad de la carta).
 */
export function mapActionIds(action: MatAction, map: IdMap): MatAction {
  switch (action.type) {
    case 'draw':
      return action.ids ? { ...action, ids: action.ids.map(map) } : action

    case 'mill':
    case 'shuffle':
    case 'token':
    case 'phase':
      return action

    case 'move':
    case 'place':
    case 'position':
    case 'counter':
    case 'activate':
    case 'reveal':
    case 'declare':
    case 'target':
      return { ...action, id: map(action.id) }

    // El `target` de un ataque es una carta del rival, que ya viaja con el id que él le dio: sólo el atacante se renombra.
    case 'attack':
      return { ...action, id: map(action.id) }

    case 'tribute':
      return { ...action, id: map(action.id), tributes: action.tributes.map(map) }

    case 'summon':
      return { ...action, id: map(action.id), materials: action.materials.map(map) }

    case 'attach':
      return { ...action, id: map(action.id), to: map(action.to) }

    // Control: una carta mía viaja con su id opaco; una del rival ya lleva el id con que su dueño la llama (`f.c12`) y no se renombra (`map` sólo conoce mis cartas).
    case 'give':
    case 'take':
    case 'regain':
      return { ...action, id: map(action.id) }

    case 'batch':
      return { ...action, actions: action.actions.map((part) => mapActionIds(part, map)) }

    // El simulador de handtraps es de «Jugar solo»: en un duelo no hay mano del rival simulada, y quien la recibiera la descarta (`duel-protocol`).
    case 'rivalUse':
      return action

    default: {
      const unreachable: never = action
      return unreachable
    }
  }
}

/** Las cartas que el rival puede ver en la mesa: lo que no es secreto sin que nadie lo muestre. */
export function publicIds(state: MatState): Set<string> {
  // Lo que está a la vista: el cementerio, el destierro boca arriba y las cartas boca arriba del Extra Deck (los Monstruos de Péndulo).
  const seen = new Set<string>([...state.gy, ...state.banished.filter((id) => !state.facedown.includes(id)), ...state.extraUp])

  for (const placed of [...state.mz, ...state.emz, ...state.st, state.field]) {
    // Boca abajo (y lo que tenga debajo) sigue siendo secreto.
    if (placed && placed.pos !== 'set') {
      seen.add(placed.id)
      placed.materials.forEach((id) => seen.add(id))
    }
  }

  return seen
}

/**
 * Cartas que se muestran aunque la mesa no cambie: la jugada sólo queda anotada. Agregar a la mano una carta que no estaba en ella —buscarla en el deck, devolverla del campo (también boca abajo), traerla del cementerio o del
 * destierro— también la muestra (Gastón, 2026-10-20: «si el oponente añade algo a la mano el oponente debe verlo, solo no lo ve si es un robo»): el rival la ve entrar, con su nombre, y queda en su detalle. Robar sigue siendo
 * secreto (no es una jugada de `move`) y una carta que ya estaba en la mano no se muestra al «agregarla» de nuevo. Un lote muestra lo de sus partes (uno dentro de otro no hace nada).
 */
function shownBy(before: MatState, action: MatAction): string[] {
  if (action.type === 'batch') return action.actions.flatMap((part) => (part.type === 'batch' ? [] : shownBy(before, part)))
  if (action.type === 'reveal' || action.type === 'declare' || action.type === 'activate') return [action.id]

  return action.type === 'move' && action.to === 'hand' && !before.hand.includes(action.id) ? [action.id] : []
}

/** Lado de quien juega: qué id opaco tiene cada carta y qué cartas ya conoce el rival. */
export interface PublicSender {
  /** id real → id opaco. */
  readonly opaque: Readonly<Record<string, string>>
  /** Ids reales ya revelados: una carta se manda una sola vez, aunque vuelva a esconderse. */
  readonly sent: ReadonlySet<string>
}

/** De las cartas visibles, las que el rival todavía no conoce (las fichas no dicen qué carta son). */
function newlyVisible(sender: PublicSender, visible: Iterable<string>): { reveal: Record<string, string>; sent: Set<string> } {
  const sent = new Set(sender.sent)
  const reveal: Record<string, string> = {}

  for (const id of visible) {
    const opaque = sender.opaque[id]

    if (opaque !== undefined && !sent.has(id)) {
      sent.add(id)
      reveal[opaque] = id
    }
  }

  return { reveal, sent }
}

/**
 * Prepara el duelo de quien juega: la mesa inicial enmascarada (lo que se manda en `init`), lo que ya es
 * visible en ella (casi nunca nada: la mano es secreta) y el estado para codificar las jugadas.
 */
export function openPublic(initial: MatState): { sender: PublicSender; masked: MatState; reveal: Record<string, string> } {
  const opaque: Record<string, string> = {}
  let count = 0

  for (const id of allMatIds(initial)) {
    if (!isToken(id) && !Object.hasOwn(opaque, id)) {
      count += 1
      opaque[id] = `c${count}`
    }
  }

  const base: PublicSender = { opaque, sent: new Set() }
  const { reveal, sent } = newlyVisible(base, publicIds(initial))

  return { sender: { opaque, sent }, masked: mapMatIds(initial, (id) => opaque[id] ?? id), reveal }
}

/**
 * La jugada tal como viaja: ids opacos y la revelación de lo que la jugada deja a la vista. `before` es
 * la mesa de quien juega antes de la jugada. Se calcula contra el estado resultante, no contra el tipo
 * de jugada: así una jugada nueva queda cubierta sin tocar nada acá.
 */
export function encodeAct(sender: PublicSender, before: MatState, action: MatAction): { sender: PublicSender; wire: WireAct } {
  const visible = publicIds(matReducer(before, action))
  shownBy(before, action).forEach((id) => visible.add(id))

  const { reveal, sent } = newlyVisible(sender, visible)
  const wire: WireAct = { action: mapActionIds(action, (id) => sender.opaque[id] ?? id), reveal }

  return { sender: { opaque: sender.opaque, sent }, wire }
}

/** Todo lo que el rival ya sabe (para dárselo a quien se reconecta). */
export function senderKnown(sender: PublicSender): Record<string, string> {
  return Object.fromEntries([...sender.sent].flatMap((id) => (sender.opaque[id] === undefined ? [] : [[sender.opaque[id], id] as const])))
}

/**
 * Lado del rival: la mesa de quien juega con ids opacos, las jugadas recibidas (para deshacer) y las
 * cartas que ya se le revelaron. Lo revelado no se olvida al deshacer: quien juega tampoco lo vuelve a mandar.
 */
export interface Mirror {
  initial: MatState
  acts: readonly MatAction[]
  state: MatState
  /** id opaco → id real. */
  known: Readonly<Record<string, string>>
}

/** Suma lo revelado que sea válido: la carta existe en la mesa, el id es razonable y la primera revelación manda. */
function acceptKnown(known: Mirror['known'], state: MatState, reveal: Record<string, string>): Mirror['known'] {
  const present = new Set(allMatIds(state))
  let next = known

  for (const [opaque, real] of Object.entries(reveal)) {
    if (present.has(opaque) && typeof real === 'string' && real.length > 0 && real.length <= MAX_ID_LENGTH && !Object.hasOwn(next, opaque)) {
      next = { ...next, [opaque]: real }
    }
  }

  return next
}

export function openMirror(masked: MatState, known: Record<string, string> = {}): Mirror {
  return { initial: masked, acts: [], state: masked, known: acceptKnown({}, masked, known) }
}

/**
 * Cuántas jugadas del rival se guardan para poder deshacerlas. Cada jugada nueva copia la lista y cada deshacer rejuega toda: sin tope, un rival que manda jugadas a toda velocidad
 * (el relay le deja 30 por segundo) congelaría la pestaña de quien lo recibe. Pasado el tope se parte de la mesa de ahora; si después deshace una más vieja, no se puede volver
 * a ella desde acá y se le pide su mesa (que es lo que ya pasa cuando se pierde una jugada).
 */
export const MAX_MIRROR_ACTS = 400

export function mirrorApply(mirror: Mirror, wire: WireAct): Mirror {
  const state = matReducer(mirror.state, wire.action)
  const known = acceptKnown(mirror.known, state, wire.reveal)

  if (mirror.acts.length >= MAX_MIRROR_ACTS) {
    return { initial: state, acts: [], state, known }
  }

  return { ...mirror, acts: [...mirror.acts, wire.action], state, known }
}

/** El rival deshizo su última jugada: la mesa vuelve atrás, lo que ya se le reveló se queda. */
export function mirrorUndo(mirror: Mirror): Mirror {
  if (mirror.acts.length === 0) {
    return mirror
  }

  const acts = mirror.acts.slice(0, -1)
  return { ...mirror, acts, state: replayMat(mirror.initial, acts) }
}
