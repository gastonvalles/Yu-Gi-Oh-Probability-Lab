import type { ReactNode } from 'react'

import { t } from '../../i18n'
import { CARD_BACK } from '../probability/practice-styles'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/**
 * La carta grande, dada vuelta: el frente y, del otro lado, el dorso de YGOPRODeck (el mismo de la mesa). Gira en 3D sobre su eje vertical (la perspectiva es la
 * del elemento que la contiene: `TILT_PERSPECTIVE` o `[perspective:900px]`); con movimiento reducido cambia sin girar. No tiene tamaño propio: llena a quien la contiene.
 */
export function CardFlip({ flipped, children }: { flipped: boolean; children: ReactNode }) {
  return (
    <div
      className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
      style={{ transform: flipped ? 'rotateY(180deg)' : undefined }}
      data-flipped={flipped ? 'true' : 'false'}
    >
      <div className="absolute inset-0 [backface-visibility:hidden]" aria-hidden={flipped || undefined}>
        {children}
      </div>
      <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]" aria-hidden={flipped ? undefined : true}>
        <span className={cx(CARD_BACK, 'z-0')} />
      </div>
    </div>
  )
}

/**
 * El botón para dar vuelta la carta grande (abajo a la derecha de la carta): con el mouse y con el dedo, porque en el celular no hay otra forma de mirar el dorso.
 * Frena el clic: tocarlo no agranda la carta.
 */
export function CardFlipButton({ flipped, onToggle, className }: { flipped: boolean; onToggle: () => void; className?: string }) {
  return (
    <IconButton
      tone="raised"
      size="md"
      aria-pressed={flipped}
      aria-label={flipped ? t('search.flip.front') : t('search.flip.back')}
      title={flipped ? t('search.flip.front') : t('search.flip.back')}
      className={cx('pointer-events-auto absolute bottom-2 right-2 z-2 rounded-full bg-background/70 backdrop-blur-sm', className)}
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      <Icon name="flip" />
    </IconButton>
  )
}
