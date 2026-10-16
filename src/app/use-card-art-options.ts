import { useMemo } from 'react'

import { printImageUrl, type PrintingPrice } from './card-prices'
import { useCardArts } from './use-card-arts'
import { useCardPrices } from './use-card-prices'

/** Cuánto está una edición de una impresión (1st Edition, Unlimited…) en TCGplayer. */
export interface ArtEdition {
  edition: string
  market: number | null
}

/** De qué impresión es el escaneo de un arte: lo que cambia de una a otra (la rareza, el set y el código, el arte especial) y a cuánto está cada edición. */
export interface ArtPrinting {
  set: string
  code: string
  rarity: string
  /** De qué arte es, si es distinto («Extended Art», «Alternate Art»); vacío si es el de siempre. */
  variant: string
  editions: ArtEdition[]
}

/** Un arte que se puede elegir en el detalle de una carta: uno de YGOPRODeck o el escaneo de una de sus impresiones. */
export interface ArtChoice {
  id: string
  imageUrl: string
  imageUrlSmall: string | null
  /** Qué es, para el tooltip ("Magnificent Monsters · MAMO-EN003 · Ultra Rare · Extended Art"); vacío en los de YGOPRODeck. */
  label: string
  /** La impresión de la que sale el escaneo; sin ella en los de YGOPRODeck (son sólo otro dibujo de la misma carta). */
  printing?: ArtPrinting
}

const NONE: readonly PrintingPrice[] = []

/** El id del arte de una impresión (por su producto en TCGplayer). */
export const printArtId = (productId: number) => `print-${productId}`

/**
 * Todos los artes de la carta: primero los de YGOPRODeck (el original y los alternativos que tenga cargados) y después el escaneo de cada impresión que salió
 * (las más nuevas primero), que es donde se ven las overframe, las de arte extendido y las alternativas. Las dos impresiones de un mismo producto (1ª edición
 * y Unlimited) son un solo arte. Se van sumando a medida que llegan.
 */
export function useCardArtOptions(cardId: number | null, name: string): readonly ArtChoice[] {
  const arts = useCardArts(cardId, name)
  const prices = useCardPrices(cardId)
  const printings = prices.status === 'ready' ? prices.prices : NONE

  return useMemo(() => {
    const options: ArtChoice[] = arts.map((art) => ({ id: `art-${art.id}`, imageUrl: art.imageUrl, imageUrlSmall: art.imageUrlSmall, label: '' }))
    const seen = new Set<number>()

    for (const printing of printings) {
      if (seen.has(printing.productId)) {
        continue
      }

      seen.add(printing.productId)
      // Las ediciones de un mismo producto (1ª edición, Unlimited) comparten el arte pero no el precio.
      const editions = printings
        .filter((other) => other.productId === printing.productId)
        .filter((other, index, same) => same.findIndex((candidate) => candidate.edition === other.edition) === index)
        .map((other) => ({ edition: other.edition, market: other.market }))

      options.push({
        id: printArtId(printing.productId),
        imageUrl: printImageUrl(printing.productId, '400w'),
        imageUrlSmall: printImageUrl(printing.productId),
        label: [printing.set, printing.code, printing.rarity, printing.variant].filter(Boolean).join(' · '),
        printing: { set: printing.set, code: printing.code, rarity: printing.rarity, variant: printing.variant, editions },
      })
    }

    return options
  }, [arts, printings])
}
