import { allMatIds, FOREIGN_PREFIX, isForeignId, isFreeTakeZone, isTakeZone, isToken, locateCard, type MatAction, type MatCardKind, type MatPos, type MatState, type MatTakeZone, type Placed } from './practice-mat'

/**
 * El control de una carta en un duelo (Cambio de Corazón, Control Mental, Resurrección de Monstruos en el cementerio del rival…): cada jugador lleva SU mesa, así que cambiar de manos una carta son dos
 * jugadas, una en cada mesa, que se completan solas. Se puede tomar una carta del rival que está **en su campo** (monstruo, Mágica o Trampa a la vista, Mágica de Campo), **en su cementerio** o **en su destierro**
 * (a la vista); el monstruo queda en una zona de monstruo mía, y la Mágica o la Trampa en una de Mágicas y Trampas (o en la de Campo):
 *
 * - Quien da (o devuelve) juega `give`: la carta sale de su mesa. El otro la ve irse y juega `take`: la carta aparece en su campo con el id `f.` + el id con que su dueño la llama
 *   por la red (`f.c12`), en la primera zona libre del mismo tipo y, si venía del campo, en la misma posición.
 * - Quien toma juega `take` con esa carta ajena. El dueño ve que su carta apareció del otro lado y juega `give` para sacarla de donde esté (del campo, del cementerio o del destierro).
 * - Una carta ajena que sale del campo (al cementerio, a la mano, como material, devuelta…) no entra a las pilas de quien la tenía: vuelve a su dueño (`regain`), a la pila que
 *   se eligió (o al cementerio, si salió como sacrificio o material) o, si se devolvió con `give`, a su campo. Un Monstruo de Péndulo que iba del campo al cementerio vuelve, por regla, al Extra Deck de su
 *   dueño boca arriba (la clase la sabe sólo el dueño: `kindOf`).
 * - Un dueño que recupera su carta (`regain` al campo) hace que el otro la suelte con `give`.
 *
 * Un Xyz con materiales: si los dos lados lo saben hacer (`XYZ_MATERIALS_CAP` en el `hello`), quien empieza el cambio (`give`, `take` o `regain` al campo) le pone a su jugada los materiales que viajan
 * (`carryMaterials`) y cada respuesta copia esa lista con los ids de su mesa: el Xyz llega con ellos debajo. Viajan todos, salvo cuando vuelve a su dueño: ahí sólo los del dueño (los del otro van a su
 * cementerio), para que ninguna carta quede en una mesa que no la puede devolver (si el dueño no tiene lugar, el Xyz y sus materiales van a su cementerio). Lo decide la jugada, no la sesión: el espejo, el
 * espectador y un replay la aplican igual. Sin la lista (un lado de antes, o un Xyz sin material), los materiales van al cementerio de quien da, como siempre; un material ajeno que sale del campo vuelve a su dueño.
 *
 * Una ficha no tiene id que viaje (cada mesa cuenta las suyas, `token-N`), y es indistinguible: quien la da juega `give token-N` (sale de su campo, sin contadores) y el otro pone una ficha suya
 * (`token` con `auto`) en su primera zona de monstruo libre, en la misma posición; devolverla es lo mismo al revés. Sólo se da si el rival lo sabe hacer (`TOKEN_CONTROL_CAP`): un lado de antes no la
 * pondría. Si igual llega sin lugar, la ficha deja de existir (como al salir del campo).
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

/** Una jugada de control: las de `CONTROL_ACTIONS` y la ficha que aparece porque el rival me dio la suya (`token` con `auto`). */
export const isControlAction = (action: MatAction) => CONTROL_ACTIONS.has(action.type) || (action.type === 'token' && action.auto === true)

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
  /** De qué clase es una carta mía (por su id real): sin esto, un Monstruo de Péndulo que vuelve del campo del rival va al cementerio como cualquiera. */
  kindOf?: (realId: string) => MatCardKind
}

const isPendulum = (real: string, kindOf: ControlContext['kindOf']) => {
  const kind = kindOf?.(real)

  return kind !== undefined && kind.monster && kind.pendulum
}

/** Si una carta mía (`real`) que el rival tenía (`id` en su espejo `before`) era un Monstruo de Péndulo en su campo: en una zona de monstruo o en una de Péndulo (como `pendulumOnField`). */
function pendulumLeftField(before: MatState, id: string, real: string, kindOf: ControlContext['kindOf']): boolean {
  const where = locateCard(before, id)

  return where?.kind === 'spot' && isPendulum(real, kindOf) && (where.spot === 'mz' || where.spot === 'emz' || (where.spot === 'st' && (where.index === 0 || where.index === 4)))
}

/** La capacidad que anuncia el `hello` de quien sabe pasar un Xyz con sus materiales (ver la cabecera). */
export const XYZ_MATERIALS_CAP = 'xyz-materials'

/** La capacidad que anuncia el `hello` de quien sabe recibir una ficha (ver la cabecera). */
export const TOKEN_CONTROL_CAP = 'token-control'

/** Un id como lo dice el rival (su carta, o una mía con `f.`), con el id de mi mesa: la suya con `f.`, la mía con su id real (o nada, si no la conozco). */
function inMine(ids: readonly string[], ownIds: ControlContext['ownIds']): string[] {
  return ids.flatMap((id) => (isForeignId(id) ? (ownIds[opaqueOfForeign(id)] ?? []) : [foreignOf(id)]))
}

/** La lista de materiales de una respuesta: sólo si la jugada del rival trajo la suya (sin ella, como siempre). */
const withList = (materials: string[] | undefined) => (materials === undefined ? {} : { materials })

/**
 * Mi jugada de control (`give`, `take` o `regain` al campo) con los materiales que viajan con la carta, cuando el rival también lo sabe hacer: los de la carta en mi mesa (al dar) o en su espejo (al
 * tomar o recuperar), con los ids de mi mesa. Al devolver una carta a su dueño, sólo los del dueño. Sin materiales, la jugada no cambia.
 */
export function carryMaterials(action: MatAction, { mine, theirs, ownIds }: { mine: MatState; theirs: MatState | null; ownIds: ControlContext['ownIds'] }): MatAction {
  const under = (state: MatState, id: string) => fieldCard(state, id)?.placed.materials.filter((card) => !isToken(card)) ?? []
  // Sólo se llama con `give`, `take` o `regain`, que llevan `materials`.
  const add = (materials: string[]) => (materials.length > 0 ? ({ ...action, materials } as MatAction) : action)

  if (action.type === 'give') {
    return add(isForeignId(action.id) ? under(mine, action.id).filter(isForeignId) : under(mine, action.id))
  }

  if (action.type === 'take' && theirs) {
    return add(inMine(under(theirs, opaqueOfForeign(action.id)), ownIds))
  }

  if (action.type === 'regain' && theirs && isTakeZone(action.to)) {
    const opaque = Object.keys(ownIds).find((key) => ownIds[key] === action.id)

    return opaque === undefined ? action : add(inMine(under(theirs, foreignOf(opaque)), ownIds).filter((id) => !isForeignId(id)))
  }

  return action
}

/** Mis jugadas de respuesta a la jugada del rival, para que mi mesa y la suya cuenten lo mismo (vacío si no hace falta ninguna). */
export function controlReactions({ mine, ownIds, before, after, action, kindOf }: ControlContext): MatAction[] {
  // Una respuesta del rival a una mía no se contesta.
  if ((action.type === 'give' || action.type === 'take' || action.type === 'regain') && action.auto) {
    return []
  }

  const reactions: MatAction[] = []
  // Los materiales que viajan con la carta (con los ids del rival): no vuelven sueltos a mí.
  let traveling: readonly string[] = []

  // El rival me da una ficha (suya o la que le di): pongo una mía en mi primera zona de monstruo libre, en su posición. Sin lugar, la ficha deja de existir (no hay a quién devolverla).
  if (action.type === 'give' && isToken(action.id)) {
    const given = fieldCard(before, action.id)
    const index = firstFreeMonsterZone(mine)

    if (given && !fieldCard(after, action.id) && index !== null) {
      reactions.push({ type: 'token', zone: 'mz', index, pos: given.placed.pos === 'def' ? 'def' : 'atk', auto: true })
    }
  } else if (action.type === 'give' && !isForeignId(action.id)) {
    // El rival me da una carta suya: la tomo en la primera zona libre de su tipo, con sus materiales; sin lugar, se la devuelvo (ella vuelve a su cementerio y lo mío que tenía debajo, al mío).
    const given = fieldCard(before, action.id)

    if (given && !fieldCard(after, action.id)) {
      const index = firstFreeZone(mine, given.zone)
      const materials = action.materials && inMine(action.materials, ownIds)

      if (index === null) {
        reactions.push({ type: 'give', id: foreignOf(action.id), ...withList(materials?.filter(isForeignId)) })
      } else {
        reactions.push({ type: 'take', id: foreignOf(action.id), zone: given.zone, index, pos: given.placed.pos, ...withList(materials), auto: true })
        traveling = action.materials ?? []
      }
    }
  }

  // El rival toma una carta mía (del campo, del cementerio o del destierro): la suelto, y con ella los materiales míos que se lleva.
  if (action.type === 'take' && isForeignId(action.id)) {
    const real = ownIds[opaqueOfForeign(action.id)]

    if (real !== undefined && isTakeable(mine, real)) {
      reactions.push({ type: 'give', id: real, ...withList(action.materials && inMine(action.materials, ownIds).filter((id) => !isForeignId(id))), auto: true })
    }
  }

  // El rival recupera una carta suya que yo tenía: la suelto (con los materiales suyos que se lleva).
  if (action.type === 'regain' && locateCard(mine, foreignOf(action.id))) {
    reactions.push({ type: 'give', id: foreignOf(action.id), ...withList(action.materials && inMine(action.materials, ownIds).filter(isForeignId)), auto: true })
  }

  // Una carta mía que el rival tenía y ya no tiene (la mandó a una pila, la devolvió, la usó de material): vuelve a mí.
  if (action.type === 'give' && isForeignId(action.id)) {
    traveling = action.materials ?? []
  }

  const gone = allMatIds(before).filter((id) => isForeignId(id) && !allMatIds(after).includes(id) && !traveling.includes(id))

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

    if (action.type === 'give' && id === action.id) {
      const returned = fieldCard(before, id)
      const zone = returned?.zone ?? 'mz'
      // Los materiales míos que vuelven con ella (si la jugada los trae).
      const materials = withList(action.materials && inMine(action.materials, ownIds).filter((card) => !isForeignId(card)))

      // Devuelta con `give`: vuelve a mi campo, a la zona de su tipo (o a mi cementerio, si no tengo lugar).
      const index = slots[zone].shift()

      reactions.push(index === undefined ? { type: 'regain', id: real, to: 'gy', ...materials, auto: true } : { type: 'regain', id: real, to: zone, index, pos: returned?.placed.pos ?? 'atk', ...materials, auto: true })
    } else if (action.type === 'move' && action.id === id && action.to !== 'gy') {
      // Un Monstruo de Péndulo que va al Extra Deck va siempre boca arriba (como `extraToward`).
      const faceUp = action.faceUp || (action.to === 'extra' && isPendulum(real, kindOf)) || undefined

      reactions.push({ type: 'regain', id: real, to: action.to, faceDown: action.faceDown, faceUp, auto: true })
    } else {
      // Al cementerio (mandada, como sacrificio o material, o de cualquier otra forma): al de su dueño; un Monstruo de Péndulo que estaba en el campo, por regla, a su Extra Deck boca arriba.
      // Material Xyz: por regla queda debajo del Xyz y al desprenderse va al cementerio (la mesa no puede dejar debajo una carta ajena): al cementerio, no al Extra.
      const xyzMaterial = action.type === 'summon' && action.how === 'xyz' && action.materials.includes(id)

      reactions.push(!xyzMaterial && pendulumLeftField(before, id, real, kindOf) ? { type: 'regain', id: real, to: 'extra', faceUp: true, auto: true } : { type: 'regain', id: real, to: 'gy', auto: true })
    }
  }

  return reactions
}
