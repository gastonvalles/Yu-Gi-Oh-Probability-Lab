import { isToken, locateCard, matReducer, type MatAction, type MatPhase, type MatSpot, type MatState } from './practice-mat'

/** Cómo llega un monstruo al campo: da el color del destello de su zona (Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua…). */
export type LandingTone = 'normal' | 'special' | 'fusion' | 'synchro' | 'xyz' | 'link'

/** Para qué se resalta una carta: activar su efecto, marcarla como objetivo, mostrarla, declarar su nombre o atacar con ella. */
export type SpotlightKind = 'activate' | 'target' | 'reveal' | 'declare' | 'attack'

/** A dónde van las cartas de un paso al reproducir un combo (las invocaciones, cómo llegan): da el color del cartel del centro. */
export type ShowcaseKind = 'hand' | 'gy' | 'banish' | 'extra' | 'deck' | 'attach' | LandingTone

/** Lo que se ve además del movimiento de las cartas cuando se hace una jugada (los vuelos los dibuja `use-card-flights`). */
export interface MatEffects {
  /** La carta que destella. Salvo la que se marca como objetivo, se muestra además grande en el centro de la pantalla. */
  spotlight?: { id: string; kind: SpotlightKind }
  /** Sólo al reproducir un combo: las cartas que cambian de lugar en este paso, grandes en el centro con lo que pasó; `flip` si salen del deck o del Extra (se dan vuelta en 3D desde el dorso). */
  showcase?: { ids: string[]; kind: ShowcaseKind; flip?: true }
  /** Una carta que cae en una zona de monstruo: `flies` es que llega volando desde otro lado (el destello espera a que aterrice). */
  landing?: { spot: MatSpot; index: number; tone: LandingTone; flies: boolean }
  /** Cambio de fase: el cartel. `turn` sólo cuando empieza otro turno. */
  banner?: { phase: MatPhase; turn: number | null }
  /** Una carta entró a la mano (robada, buscada o devuelta): la mano se enmarca un instante. */
  hand?: true
  /** La jugada tocó el deck (barajar, robar, buscar, mandar o devolver cartas) o sumó una carta a la mano: el deck y la mano se barajan a la vista. */
  shuffle?: true
}

const isMonsterZone = (spot: MatSpot) => spot === 'mz' || spot === 'emz'

/** A qué pila va una carta movida, para el color del cartel del centro. */
const SHOWCASE_OF_PILE = { hand: 'hand', gy: 'gy', banished: 'banish', extra: 'extra', deck: 'deck', 'deck-bottom': 'deck' } as const

/**
 * Qué efectos acompañan a una jugada. Es puro (lo usa la mesa con cada paso que avanza, jugado o reproducido) y mira el estado de
 * antes: una jugada que no cambió nada (zona ocupada, carta que no existe) no destella. Una Mágica o Trampa que pasa boca arriba
 * se activa; un monstruo que sale boca arriba a una zona de monstruo se invoca (una carta que sólo cambia de zona no); colocar boca abajo no hace ruido.
 */
export function matEffects(before: MatState, action: MatAction): MatEffects {
  const after = matReducer(before, action)
  const effects = effectsOf(before, after, action)
  const handGained = after.hand.length > before.hand.length
  const touchedDeck = action.type === 'shuffle' || after.deck.length !== before.deck.length

  return { ...effects, ...(handGained ? { hand: true as const } : {}), ...(handGained || touchedDeck ? { shuffle: true as const } : {}) }
}

function effectsOf(before: MatState, after: MatState, action: MatAction): MatEffects {
  const exists = (id: string) => locateCard(before, id) !== null
  const changed = after !== before
  /** Las cartas del paso para mostrar; las que salen del deck o del Extra estaban boca abajo, así que se muestran dándose vuelta. */
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

      return milled.length > 0 ? show(milled, 'gy') : {}
    }

    case 'move':
      // Una ficha que deja el campo desaparece: no hay carta que mostrar.
      return changed && !isToken(action.id) ? show([action.id], SHOWCASE_OF_PILE[action.to]) : {}

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
