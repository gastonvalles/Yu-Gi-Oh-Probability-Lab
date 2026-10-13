import { locateCard, matReducer, type MatAction, type MatPhase, type MatSpot, type MatState } from './practice-mat'

/** Cómo llega un monstruo al campo: da el color del destello de su zona (Fusión violeta, Sincronía blanca, Xyz azul, Enlace celeste…). */
export type LandingTone = 'normal' | 'special' | 'fusion' | 'synchro' | 'xyz' | 'link'

/** Para qué se resalta una carta: activar su efecto, marcarla como objetivo, mostrarla o declarar su nombre. */
export type SpotlightKind = 'activate' | 'target' | 'reveal' | 'declare'

/** Lo que se ve además del movimiento de las cartas cuando se hace una jugada (los vuelos los dibuja `use-card-flights`). */
export interface MatEffects {
  /** La carta que destella. Salvo la que se marca como objetivo, se muestra además grande en el centro de la pantalla. */
  spotlight?: { id: string; kind: SpotlightKind }
  /** Una carta que cae en una zona de monstruo: `flies` es que llega volando desde otro lado (el destello espera a que aterrice). */
  landing?: { spot: MatSpot; index: number; tone: LandingTone; flies: boolean }
  /** Cambio de fase: el cartel. `turn` sólo cuando empieza otro turno. */
  banner?: { phase: MatPhase; turn: number | null }
}

const isMonsterZone = (spot: MatSpot) => spot === 'mz' || spot === 'emz'

/**
 * Qué efectos acompañan a una jugada. Es puro (lo usa la mesa con cada paso que avanza, jugado o reproducido) y mira el estado de
 * antes: una jugada que no cambió nada (zona ocupada, carta que no existe) no destella. Una Mágica o Trampa que pasa boca arriba
 * se activa; un monstruo que sale boca arriba a una zona de monstruo se invoca (una carta que sólo cambia de zona no); colocar boca abajo no hace ruido.
 */
export function matEffects(before: MatState, action: MatAction): MatEffects {
  const exists = (id: string) => locateCard(before, id) !== null
  const changed = () => matReducer(before, action) !== before

  switch (action.type) {
    case 'activate':
      return exists(action.id) ? { spotlight: { id: action.id, kind: 'activate' } } : {}

    case 'reveal':
    case 'declare':
      return exists(action.id) ? { spotlight: { id: action.id, kind: action.type } } : {}

    case 'target':
      return exists(action.id) && !before.targeted.includes(action.id) ? { spotlight: { id: action.id, kind: 'target' } } : {}

    case 'place': {
      if (!changed()) return {}
      // Boca arriba en la zona de Mágicas y Trampas o en la de campo = activar (también la escala de un monstruo de Péndulo).
      if (!isMonsterZone(action.zone)) return action.pos === 'atk' ? { spotlight: { id: action.id, kind: 'activate' } } : {}

      const where = locateCard(before, action.id)

      // Boca abajo es Colocar, y una carta que ya estaba en el campo sólo cambia de lugar.
      if (action.pos === 'set' || where?.kind === 'spot') return {}

      const normal = action.how === 'normal' || (action.how === undefined && where?.kind === 'pile' && where.pile === 'hand')

      return { landing: { spot: action.zone, index: action.index, tone: normal ? 'normal' : 'special', flies: true } }
    }

    case 'tribute':
      // Invocar por Sacrificio es una Invocación Normal; boca abajo, un Colocar.
      return action.pos !== 'set' && changed() ? { landing: { spot: action.zone, index: action.index, tone: 'normal', flies: true } } : {}

    case 'summon':
      return changed() ? { landing: { spot: action.zone, index: action.index, tone: action.how, flies: true } } : {}

    case 'token':
      // La ficha aparece de la nada: no hay vuelo que esperar.
      return changed() ? { landing: { spot: action.zone, index: action.index, tone: 'special', flies: false } } : {}

    case 'position': {
      const where = locateCard(before, action.id)

      if (where?.kind !== 'spot' || action.pos !== 'atk' || where.placed.pos !== 'set') return {}

      // Dar vuelta una Mágica o Trampa colocada es activarla; un monstruo boca abajo que pasa a ataque es la Invocación por Volteo.
      return isMonsterZone(where.spot)
        ? { landing: { spot: where.spot, index: where.index, tone: 'normal', flies: false } }
        : { spotlight: { id: action.id, kind: 'activate' } }
    }

    case 'phase': {
      const after = matReducer(before, action)

      return after === before ? {} : { banner: { phase: action.phase, turn: after.turn !== before.turn ? after.turn : null } }
    }

    default:
      return {}
  }
}
