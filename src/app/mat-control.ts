import { allMatIds, FOREIGN_PREFIX, isForeignId, isFreeTakeZone, locateCard, type MatAction, type MatPos, type MatState, type MatTakeZone, type Placed } from './practice-mat'

/**
 * El control de una carta en un duelo (Cambio de Corazón, Control Mental, Resurrección de Monstruos en el cementerio del rival…): cada jugador lleva SU mesa, así que cambiar de manos una carta son dos
 * jugadas, una en cada mesa, que se completan solas. Se puede tomar una carta del rival que está **en su campo** (monstruo, Mágica o Trampa a la vista, Mágica de Campo), **en su cementerio** o **en su destierro**
 * (a la vista); el monstruo queda en una zona de monstruo mía, y la Mágica o la Trampa en una de Mágicas y Trampas (o en la de Campo):
 *
 * - Quien da (o devuelve) juega `give`: la carta sale de su mesa. El otro la ve irse y juega `take`: la carta aparece en su campo con el id `f.` + el id con que su dueño la llama
 *   por la red (`f.c12`), en la primera zona libre del mismo tipo y, si venía del campo, en la misma posición.
 * - Quien toma juega `take` con esa carta ajena. El dueño ve que su carta apareció del otro lado y juega `give` para sacarla de donde esté (del campo, del cementerio o del destierro).
 * - Una carta ajena que sale del campo (al cementerio, a la mano, como material, devuelta…) no entra a las pilas de quien la tenía: vuelve a su dueño (`regain`), a la pila que
 *   se eligió (o al cementerio, si salió como sacrificio o material) o, si se devolvió con `give`, a su campo.
 * - Un dueño que recupera su carta (`regain` al campo) hace que el otro la suelte con `give`.
 *
 * Las jugadas de respuesta llevan `auto`: no provocan otra respuesta (si no, dos mesas se contestarían para siempre). Todo es puro; la sesión (`duel-session.ts`) las juega.
 */

/** El id de una carta mía en la mesa del rival: `f.` + el id opaco con que la llamo yo por la red. */
export const foreignOf = (opaque: string) => `${FOREIGN_PREFIX}${opaque}`

/** El id opaco (el de la red) de una carta ajena. */
export const opaqueOfForeign = (id: string) => id.slice(FOREIGN_PREFIX.length)

/** Los lugares libres de una zona (de monstruo, de Mágicas y Trampas o la de Campo), de primero a último. */
function freeIndexes(state: MatState, zone: MatTakeZone): number[] {
  const size = zone === 'field' ? 1 : zone === 'mz' ? state.mz.length : state.st.length

  return Array.from({ length: size }, (_, index) => index).filter((index) => isFreeTakeZone(state, zone, index))
}

/** La primera zona libre de ese tipo, o null si no queda ninguna. */
export function firstFreeZone(state: MatState, zone: MatTakeZone): number | null {
  return freeIndexes(state, zone)[0] ?? null
}

/** La primera zona de monstruo libre, o null si están las cinco ocupadas. */
export const firstFreeMonsterZone = (state: MatState) => firstFreeZone(state, 'mz')

/** Las jugadas que cambian de manos una carta: no se pueden deshacer (la otra mesa ya las completó). */
export const CONTROL_ACTIONS: ReadonlySet<MatAction['type']> = new Set(['give', 'take', 'regain'])

/** Una carta en el campo con la zona en la que la tomaría el otro (la Extra Monster Zone cuenta como zona de monstruo), o null. */
function fieldCard(state: MatState, id: string): { zone: MatTakeZone; placed: Placed } | null {
  const where = locateCard(state, id)

  return where?.kind === 'spot' ? { zone: where.spot === 'emz' ? 'mz' : where.spot, placed: where.placed } : null
}

/** Una carta mía que el rival puede tomar: en el campo, en el cementerio o en el destierro (no en la mano, el deck ni el Extra Deck, ni como material). */
function isTakeable(state: MatState, id: string): boolean {
  const where = locateCard(state, id)

  return where?.kind === 'spot' || (where?.kind === 'pile' && (where.pile === 'gy' || where.pile === 'banished'))
}

/** Qué es una carta, para saber dónde queda al tomarla de un cementerio o del destierro: un monstruo o una Mágica o Trampa. */
export type TakenKind = 'monster' | 'spellTrap'

/** Dónde quedaría una carta del rival que yo tomo: la zona, el lugar libre y la posición. */
export interface TakeOffer {
  zone: MatTakeZone
  index: number
  pos: MatPos
}

/**
 * Lo que ofrece «Tomar el control» de una carta del rival (`id`, el que tiene en su espejo): de su campo, sólo lo que está a la vista (una carta boca abajo no se sabe qué es), en su misma zona y posición;
 * de su cementerio o su destierro (a la vista), un monstruo a una zona de monstruo mía en ataque y una Mágica o Trampa a una de Mágicas y Trampas boca arriba (`kind` es lo que se sabe de la carta: sin saberlo
 * todavía, no se ofrece). Sin un lugar libre de ese tipo en mi campo, tampoco (null).
 */
export function takeOffer(rival: MatState, mine: MatState, id: string, kind: TakenKind | null): TakeOffer | null {
  const where = locateCard(rival, id)
  let zone: MatTakeZone
  let pos: MatPos

  if (where?.kind === 'spot') {
    if (where.placed.pos === 'set') return null

    zone = where.spot === 'emz' ? 'mz' : where.spot
    pos = where.placed.pos
  } else if (where?.kind === 'pile' && (where.pile === 'gy' || (where.pile === 'banished' && !rival.facedown.includes(id)))) {
    if (kind === null) return null

    zone = kind === 'monster' ? 'mz' : 'st'
    pos = 'atk'
  } else {
    return null
  }

  const index = firstFreeZone(mine, zone)

  return index === null ? null : { zone, index, pos }
}

interface ControlContext {
  /** Mi mesa. */
  mine: MatState
  /** Mis ids reales por el id opaco con que los llamo por la red. */
  ownIds: Readonly<Record<string, string>>
  /** La mesa del rival (su espejo) antes y después de su jugada. */
  before: MatState
  after: MatState
  /** La jugada del rival, tal como llegó por la red (mis cartas con su id opaco). */
  action: MatAction
}

/** Mis jugadas de respuesta a la jugada del rival, para que mi mesa y la suya cuenten lo mismo (vacío si no hace falta ninguna). */
export function controlReactions({ mine, ownIds, before, after, action }: ControlContext): MatAction[] {
  // Una respuesta del rival a una mía no se contesta.
  if ((action.type === 'give' || action.type === 'take' || action.type === 'regain') && action.auto) {
    return []
  }

  const reactions: MatAction[] = []

  // El rival me da una carta suya: la tomo en la primera zona libre de su tipo; sin lugar, se la devuelvo (ella vuelve a su cementerio).
  if (action.type === 'give' && !isForeignId(action.id)) {
    const given = fieldCard(before, action.id)

    if (given && !fieldCard(after, action.id)) {
      const index = firstFreeZone(mine, given.zone)

      reactions.push(index === null ? { type: 'give', id: foreignOf(action.id) } : { type: 'take', id: foreignOf(action.id), zone: given.zone, index, pos: given.placed.pos, auto: true })
    }
  }

  // El rival toma una carta mía (del campo, del cementerio o del destierro): la suelto.
  if (action.type === 'take' && isForeignId(action.id)) {
    const real = ownIds[opaqueOfForeign(action.id)]

    if (real !== undefined && isTakeable(mine, real)) {
      reactions.push({ type: 'give', id: real, auto: true })
    }
  }

  // El rival recupera una carta suya que yo tenía: la suelto.
  if (action.type === 'regain' && locateCard(mine, foreignOf(action.id))) {
    reactions.push({ type: 'give', id: foreignOf(action.id), auto: true })
  }

  // Una carta mía que el rival tenía y ya no tiene (la mandó a una pila, la devolvió, la usó de material): vuelve a mí.
  const gone = allMatIds(before).filter((id) => isForeignId(id) && !allMatIds(after).includes(id))

  if (action.type === 'give' && isForeignId(action.id) && !gone.includes(action.id)) {
    gone.push(action.id)
  }

  // Las zonas libres de mi campo, para las cartas que vuelven a él (una por carta).
  const slots: Record<MatTakeZone, number[]> = { mz: freeIndexes(mine, 'mz'), st: freeIndexes(mine, 'st'), field: freeIndexes(mine, 'field') }

  for (const id of gone) {
    const real = ownIds[opaqueOfForeign(id)]

    if (real === undefined || locateCard(mine, real)) {
      continue
    }

    if (action.type === 'give') {
      const returned = fieldCard(before, id)
      const zone = returned?.zone ?? 'mz'

      // Devuelta con `give`: vuelve a mi campo, a la zona de su tipo (o a mi cementerio, si no tengo lugar).
      const index = slots[zone].shift()

      reactions.push(index === undefined ? { type: 'regain', id: real, to: 'gy', auto: true } : { type: 'regain', id: real, to: zone, index, pos: returned?.placed.pos ?? 'atk', auto: true })
    } else if (action.type === 'move' && action.id === id) {
      reactions.push({ type: 'regain', id: real, to: action.to, faceDown: action.faceDown, faceUp: action.faceUp, auto: true })
    } else {
      // Como sacrificio o material, o de cualquier otra forma: al cementerio de su dueño.
      reactions.push({ type: 'regain', id: real, to: 'gy', auto: true })
    }
  }

  return reactions
}
