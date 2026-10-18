import { allMatIds, FOREIGN_PREFIX, isForeignId, locateCard, type MatAction, type MatState, type Placed } from './practice-mat'

/**
 * El control de un monstruo en un duelo (Cambio de Corazón, Control Mental, Intercambio de Criaturas…): cada jugador lleva SU mesa, así que cambiar de manos una carta son dos
 * jugadas, una en cada mesa, que se completan solas:
 *
 * - Quien da (o devuelve) juega `give`: el monstruo sale de su campo. El otro lo ve irse y juega `take`: la carta aparece en su campo con el id `f.` + el id con que su dueño la llama
 *   por la red (`f.c12`), en la primera zona de monstruo libre y en la misma posición.
 * - Quien toma juega `take` con esa carta ajena. El dueño ve que su carta apareció del otro lado y juega `give` para sacarla de su campo.
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

/** La primera zona de monstruo libre, o null si están las cinco ocupadas. */
export function firstFreeMonsterZone(state: MatState): number | null {
  const index = state.mz.findIndex((placed) => placed === null)

  return index < 0 ? null : index
}

/** Las jugadas que cambian de manos una carta: no se pueden deshacer (la otra mesa ya las completó). */
export const CONTROL_ACTIONS: ReadonlySet<MatAction['type']> = new Set(['give', 'take', 'regain'])

/** Un monstruo en el campo (zona de monstruo o Extra Monster Zone) con su posición, o null. */
function monsterOnField(state: MatState, id: string): Placed | null {
  const where = locateCard(state, id)

  return where?.kind === 'spot' && (where.spot === 'mz' || where.spot === 'emz') ? where.placed : null
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

  // El rival me da una carta suya: la tomo en la primera zona libre; sin lugar, se la devuelvo (ella vuelve a su cementerio).
  if (action.type === 'give' && !isForeignId(action.id)) {
    const placed = monsterOnField(before, action.id)

    if (placed && !monsterOnField(after, action.id)) {
      const index = firstFreeMonsterZone(mine)

      reactions.push(index === null ? { type: 'give', id: foreignOf(action.id) } : { type: 'take', id: foreignOf(action.id), zone: 'mz', index, pos: placed.pos, auto: true })
    }
  }

  // El rival toma una carta mía: la suelto.
  if (action.type === 'take' && isForeignId(action.id)) {
    const real = ownIds[opaqueOfForeign(action.id)]

    if (real !== undefined && monsterOnField(mine, real)) {
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
  const slots = mine.mz.flatMap((placed, index) => (placed === null ? [index] : []))

  for (const id of gone) {
    const real = ownIds[opaqueOfForeign(id)]

    if (real === undefined || locateCard(mine, real)) {
      continue
    }

    if (action.type === 'give') {
      const placed = monsterOnField(before, id)

      // Devuelta con `give`: vuelve a mi campo (o a mi cementerio, si no tengo lugar).
      const index = slots.shift()

      reactions.push(index === undefined ? { type: 'regain', id: real, to: 'gy', auto: true } : { type: 'regain', id: real, to: 'mz', index, pos: placed?.pos ?? 'atk', auto: true })
    } else if (action.type === 'move' && action.id === id) {
      reactions.push({ type: 'regain', id: real, to: action.to, faceDown: action.faceDown, auto: true })
    } else {
      // Como sacrificio o material, o de cualquier otra forma: al cementerio de su dueño.
      reactions.push({ type: 'regain', id: real, to: 'gy', auto: true })
    }
  }

  return reactions
}
