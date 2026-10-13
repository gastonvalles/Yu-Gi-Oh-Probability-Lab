import { useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { cardSmallImageUrl, printImageUrl } from '../../app/card-prices'
import { cx } from '../ui/cx'

/**
 * La carta tal cual salió en una impresión: el escaneo de su producto en TCGplayer (así se ven las overframe, las de arte extendido y las alternativas).
 * Si esa imagen no existe, el arte de siempre de YGOPRODeck; y si tampoco, una caja vacía del mismo tamaño. El que la usa le da el tamaño con `className`.
 */
export function PrintingArt({ productId, cardId, className }: { productId: number; cardId: number; className?: string }) {
  // 0: la de la impresión · 1: la de YGOPRODeck · 2: ninguna.
  const [stage, setStage] = useState(0)

  if (stage >= 2) {
    return <span aria-hidden="true" className={cx('block bg-input', className)} />
  }

  return (
    <img
      src={stage === 0 ? printImageUrl(productId) : cardImageSrc(cardSmallImageUrl(cardId))}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      className={cx('block select-none bg-input', className)}
      onError={() => setStage((current) => current + 1)}
    />
  )
}
