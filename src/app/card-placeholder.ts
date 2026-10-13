import type { ApiCardReference } from '../types'

/**
 * Una carta con lo mínimo (su id y una imagen chica) para abrir el detalle sin esperar: el marco muestra la imagen chica hasta que llega la
 * carta completa (arte grande, tipo, banlist), que se pide al abrir.
 */
export function placeholderCard(ygoprodeckId: number, imageUrlSmall: string | null): ApiCardReference {
  return {
    ygoprodeckId,
    cardType: '',
    frameType: '',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}
