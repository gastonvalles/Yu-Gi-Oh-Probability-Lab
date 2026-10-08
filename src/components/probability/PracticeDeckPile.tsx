import { forwardRef } from 'react'

import { cx } from '../ui/cx'
import { CARD_BACK } from './practice-styles'

interface PracticeDeckPileProps {
  /** Se puede robar la carta para ir 2º. */
  canDraw: boolean
  /** Ya se robó: se va 2º. */
  isSecond: boolean
  /** Cambia en cada reparto: dispara la animación de barajado. */
  shuffleKey: number
  /** Cantidad de cartas repartidas: da el pulso al mazo con cada una. */
  dealt: number
  onDraw: () => void
  className?: string
}

const PILE_CARD = 'shadow-[0_6px_12px_rgba(0,0,0,0.45)]'

/** Mazo: se reparte desde acá; con "+1" se roba la carta que convierte la mano en yendo 2º. */
export const PracticeDeckPile = forwardRef<HTMLButtonElement, PracticeDeckPileProps>(function PracticeDeckPile(
  { canDraw, isSecond, shuffleKey, dealt, onDraw, className },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cx(
        'group relative aspect-[421/614] w-[3.4rem] cursor-pointer border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-hover disabled:cursor-default',
        canDraw && 'before:pointer-events-none before:absolute before:-inset-1 before:animate-pile-ring before:rounded-lg before:shadow-[0_0_0_2px_rgb(var(--accent-rgb)/0.8)] motion-reduce:before:animate-none',
        className,
      )}
      disabled={!canDraw}
      aria-label={isSecond ? 'Yendo 2º' : 'Robar una carta (ir 2º)'}
      title={isSecond ? 'Yendo 2º' : 'Robar una carta (ir 2º)'}
      onClick={onDraw}
    >
      <span key={shuffleKey} className="absolute inset-0 transition-transform duration-150 group-enabled:group-active:scale-[0.94] motion-reduce:transition-none">
        <span className={cx(CARD_BACK, PILE_CARD, '[transform:translate(-3px,3px)]', shuffleKey > 0 && 'animate-riffle-left motion-reduce:animate-none')} />
        <span className={cx(CARD_BACK, PILE_CARD, '[transform:translate(-1.5px,1.5px)]', shuffleKey > 0 && 'animate-riffle-right motion-reduce:animate-none')} />
        {/* Cada carta repartida le da un tirón a la de arriba. */}
        <span key={dealt} className={cx(CARD_BACK, PILE_CARD, 'animate-pile-draw motion-reduce:animate-none')} />
      </span>
      {canDraw ? (
        <span className="pointer-events-none absolute -bottom-[0.55rem] left-1/2 z-2 -translate-x-1/2 rounded-full bg-accent px-[0.6rem] py-[0.1rem] text-body font-extrabold text-[#06140e] shadow-[0_0_16px_rgb(var(--accent-rgb)/0.55)]">
          +1
        </span>
      ) : null}
      {isSecond || canDraw ? (
        <span
          key={isSecond ? 'second' : 'first'}
          className={cx(
            'pointer-events-none absolute -right-[0.45rem] -top-[0.45rem] z-2 animate-pop rounded-full px-[0.4rem] py-[0.05rem] text-micro font-extrabold motion-reduce:animate-none',
            isSecond ? 'bg-warning text-[#1a1204]' : 'bg-primary-hover text-white',
          )}
        >
          {isSecond ? '2º' : '1º'}
        </span>
      ) : null}
    </button>
  )
})
