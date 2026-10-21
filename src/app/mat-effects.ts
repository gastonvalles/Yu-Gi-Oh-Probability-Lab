import { isToken, locateCard, matReducer, type MatAction, type MatPhase, type MatSpot, type MatState } from './practice-mat'

/** Cómo llega un monstruo al campo: da el color del destello de su zona (Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua…). */
export type LandingTone = 'normal' | 'special' | 'fusion' | 'synchro' | 'xyz' | 'link'

/** Para qué se resalta una carta: activar su efecto, marcarla como objetivo, mostrarla, declarar su nombre o atacar con ella. */
export type SpotlightKind = 'activate' | 'target' | 'reveal' | 'declare' | 'attack'

/** A dónde van las cartas de un paso al reproducir un combo (las invocaciones, cómo llegan): da el color del cartel del centro. */
export type ShowcaseKind = 'hand' | 'gy' | 'banish' | 'extra' | 'deck' | 'attach' | LandingTone

/** A dónde van las cartas que se mandan en silencio: al cementerio o al destierro. */
export type QuietKind = 'gy' | 'banish'

/** Lo que se ve además del movimiento de las cartas cuando se hace una jugada (los vuelos los dibuja `use-card-flights`). */
export interface MatEffects {
  /** La carta que destella. Salvo la que se marca como objetivo, se muestra además grande en el centro de la pantalla. Un lote (`batch`) que destaca varias las trae todas en `ids` (la primera sigue en `id`). */
  spotlight?: { id: string; kind: SpotlightKind; ids?: string[] }
  /** Sólo al reproducir un combo: las cartas que cambian de lugar en este paso, grandes en el centro con lo que pasó; `flip` si salen del deck o del Extra (se dan vuelta en 3D desde el dorso). */
  showcase?: { ids: string[]; kind: ShowcaseKind; flip?: true }
  /**
   * Cartas que van al cementerio o al destierro: es la única jugada que **no** se muestra grande (ni en un combo ni en el duelo). La mesa las anima viajando a su pila y el
   * registro las anota; el rival, que no las ve en el centro, las lee en su registro.
   */
  quiet?: { ids: string[]; kind: QuietKind }
  /** Una carta que cae en una zona de monstruo: `flies` es que llega volando desde otro lado (el destello espera a que aterrice). */
  landing?: { spot: MatSpot; index: number; tone: LandingTone; flies: boolean }
  /** Cambio de fase: el cartel. `turn` sólo cuando empieza otro turno. */
  banner?: { phase: MatPhase; turn: number | null }
  /** Una carta entró a la mano (robada, buscada o devuelta): la mano se enmarca un instante. */
  hand?: true
  /**
   * La jugada barajó el deck (Barajar, buscar una carta, devolverla al azar) o sumó una carta a la mano (robar también): el deck y la mano se barajan a la vista.
   * Mandar cartas del deck al cementerio o al destierro, o devolver una arriba o abajo, no baraja: se ve volar la carta y la pila da su golpe (`use-card-flights`).
   */
  shuffle?: true
}

const isMonsterZone = (spot: MatSpot) => spot === 'mz' || spot === 'emz'

/** A qué pila va una carta movida (menos el cementerio y el destierro, que no se muestran: ver `quiet`), para el color del cartel del centro. */
const SHOWCASE_OF_PILE = { hand: 'hand', extra: 'extra', deck: 'deck', 'deck-bottom': 'deck' } as const

/**
 * Qué efectos acompañan a una jugada. Es puro (lo usa la mesa con cada paso que avanza, jugado o reproducido) y mira el estado de
 * antes: una jugada que no cambió nada (zona ocupada, carta que no existe) no destella. Una Mágica o Trampa que pasa boca arriba
 * se activa; un monstruo que sale boca arriba a una zona de monstruo se invoca (una carta que sólo cambia de zona no); colocar boca abajo no hace ruido.
 */
export function matEffects(before: MatState, action: MatAction): MatEffects {
  if (action.type === 'batch') return batchEffects(before, action.actions)

  const after = matReducer(before, action)
  const effects = effectsOf(before, after, action)
  const handGained = after.hand.length > before.hand.length
  // Barajar de verdad: «Barajar», o una jugada con la semilla de lo que se sacó o se metió mirando el deck (buscar una carta, devolverla «Al azar»).
  const shuffled = action.type === 'shuffle' || (after !== before && 'shuffle' in action && action.shuffle !== undefined)

  return { ...effects, ...(handGained ? { hand: true as const } : {}), ...(handGained || shuffled ? { shuffle: true as const } : {}) }
}

/**
 * Los efectos de un lote: los de cada parte (contra la mesa que dejó la anterior), juntos. Las cartas que destacan, se muestran o van en silencio se suman a las de la primera parte que lo
 * hizo (las de otra clase, en un lote mezclado, no); lo demás (la mano, el barajado) queda si alguna parte lo tuvo. Un lote dentro de otro no hace nada.
 */
function batchEffects(before: MatState, actions: readonly MatAction[]): MatEffects {
  let state = before
  let joined: MatEffects = {}

  for (const part of actions) {
    if (part.type === 'batch') continue

    const effects = matEffects(state, part)
    const { spotlight, showcase, quiet } = joined

    state = matReducer(state, part)
    joined = {
      ...effects,
      ...joined,
      ...(spotlight && effects.spotlight?.kind === spotlight.kind ? { spotlight: { ...spotlight, ids: [...(spotlight.ids ?? [spotlight.id]), effects.spotlight.id] } } : {}),
      ...(showcase && effects.showcase?.kind === showcase.kind ? { showcase: { ...showcase, ids: [...showcase.ids, ...effects.showcase.ids], ...(effects.showcase.flip ? { flip: true as const } : {}) } } : {}),
      ...(quiet && effects.quiet?.kind === quiet.kind ? { quiet: { ...quiet, ids: [...quiet.ids, ...effects.quiet.ids] } } : {}),
    }
  }

  return joined
}

function effectsOf(before: MatState, after: MatState, action: MatAction): MatEffects {
  const exists = (id: string) => locateCard(before, id) !== null
  const changed = after !== before
  /** Las cartas del paso para mostrar; las que salen del deck o del Extra estaban boca abajo, así que se muestran dándose vuelta. */
  const quiet = (ids: string[], kind: QuietKind): Pick<MatEffects, 'quiet'> => ({ quiet: { ids, kind } })
  const show = (ids: string[], kind: ShowcaseKind): Pick<MatEffects, 'showcase'> => {
    const hidden = ids.some((id) => {
      const where = locateCard(before, id)

      return where?.kind === 'pile' && (where.pile === 'deck' || where.pile === 'extra')
    })

    return { showcase: { ids, kind, ...(hidden ? { flip: true as const } : {}) } }
  }

  switch (action.type) {
    case 'activate':
      return exists(action.id) ? { spotlight: { id: action.id, kind: 'activate' } } : {}

    case 'reveal':
    case 'declare':
    case 'attack':
      return exists(action.id) ? { spotlight: { id: action.id, kind: action.type } } : {}

    case 'target':
      return exists(action.id) && !before.targeted.includes(action.id) ? { spotlight: { id: action.id, kind: 'target' } } : {}

    case 'draw': {
      const drawn = after.hand.slice(before.hand.length)

      return drawn.length > 0 ? show(drawn, 'hand') : {}
    }

    case 'mill': {
      const milled = after.gy.slice(before.gy.length)

      return milled.length > 0 ? quiet(milled, 'gy') : {}
    }

    case 'move':
      // Una ficha que deja el campo desaparece: no hay carta que mostrar.
      if (!changed || isToken(action.id)) return {}

      // Al cementerio o al destierro no se muestra grande: va al registro.
      return action.to === 'gy' || action.to === 'banished' ? quiet([action.id], action.to === 'gy' ? 'gy' : 'banish') : show([action.id], SHOWCASE_OF_PILE[action.to])

    case 'attach':
      return changed ? show([action.id], 'attach') : {}

    case 'place': {
      const where = locateCard(before, action.id)

      // Una carta que ya estaba en el campo sólo cambia de lugar.
      if (!changed || where?.kind === 'spot') return {}
      // Boca arriba en la zona de Mágicas y Trampas o en la de campo = activar (también la escala de un monstruo de Péndulo).
      if (!isMonsterZone(action.zone)) return action.pos === 'atk' ? { spotlight: { id: action.id, kind: 'activate' } } : {}

      // Boca abajo es Colocar.
      if (action.pos === 'set') return {}

      const normal = action.how === 'normal' || (action.how === undefined && where?.kind === 'pile' && where.pile === 'hand')
      const tone = normal ? 'normal' : 'special'

      return { landing: { spot: action.zone, index: action.index, tone, flies: true }, ...show([action.id], tone) }
    }

    case 'tribute':
      // Invocar por Sacrificio es una Invocación Normal; boca abajo, un Colocar.
      return action.pos !== 'set' && changed ? { landing: { spot: action.zone, index: action.index, tone: 'normal', flies: true }, ...show([action.id], 'normal') } : {}

    case 'summon':
      return changed ? { landing: { spot: action.zone, index: action.index, tone: action.how, flies: true }, ...show([action.id], action.how) } : {}

    case 'token':
      // La ficha aparece de la nada: no hay vuelo que esperar.
      return changed ? { landing: { spot: action.zone, index: action.index, tone: 'special', flies: false } } : {}

    // Un monstruo que cambia de manos aparece en su zona con un destello (no vuela: viene del campo del otro, que ya lo vio salir).
    case 'take':
      return changed ? { landing: { spot: 'mz', index: action.index, tone: 'special', flies: false } } : {}

    case 'regain':
      return changed && action.to === 'mz' && action.index !== undefined ? { landing: { spot: 'mz', index: action.index, tone: 'special', flies: false } } : {}

    case 'position': {
      const where = locateCard(before, action.id)

      if (where?.kind !== 'spot' || action.pos !== 'atk' || where.placed.pos !== 'set') return {}

      // Dar vuelta una Mágica o Trampa colocada es activarla; un monstruo boca abajo que pasa a ataque es la Invocación por Volteo.
      return isMonsterZone(where.spot)
        ? { landing: { spot: where.spot, index: where.index, tone: 'normal', flies: false }, ...show([action.id], 'normal') }
        : { spotlight: { id: action.id, kind: 'activate' } }
    }

    case 'phase': {
      if (!changed) return {}

      // Al empezar otro turno se roba sola la carta del tope: también se muestra.
      const drawn = after.hand.slice(before.hand.length)

      return { banner: { phase: action.phase, turn: after.turn !== before.turn ? after.turn : null }, ...(drawn.length > 0 ? show(drawn, 'hand') : {}) }
    }

    default:
      return {}
  }
}
