import { useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { setImageUrl } from '../../app/card-prices'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/**
 * La imagen del sobre (o la caja) de una expansión, la de YGOPRODeck por el prefijo de sus códigos ("LOB" de "LOB-EN001"). Algunas expansiones no la tienen:
 * ahí queda una caja de ícono en el mismo lugar, así la lista no salta. El que la usa le da el tamaño y las esquinas con `className`.
 */
export function PackArt({ code, className }: { code: string; className?: string }) {
  const [broken, setBroken] = useState(false)

  if (!code || broken) {
    return (
      <span aria-hidden="true" className={cx('grid shrink-0 place-items-center bg-input text-primary-soft/70', className)}>
        <Icon name="package" size={20} />
      </span>
    )
  }

  return (
    <img
      src={cardImageSrc(setImageUrl(code), 128)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      // Las imágenes de los sobres traen fondo blanco: se ven enteras, sobre un tablero blanco, sin recortarlas.
      className={cx('shrink-0 select-none bg-white object-contain', className)}
      onError={() => setBroken(true)}
    />
  )
}
