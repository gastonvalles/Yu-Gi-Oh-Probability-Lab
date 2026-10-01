import { forwardRef } from 'react'

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
}

/** Mazo: se reparte desde acá; con "+1" se roba la carta que convierte la mano en yendo 2º. */
export const PracticeDeckPile = forwardRef<HTMLButtonElement, PracticeDeckPileProps>(function PracticeDeckPile(
  { canDraw, isSecond, shuffleKey, dealt, onDraw },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className="practice-pile"
      data-ready={canDraw ? 'true' : 'false'}
      data-second={isSecond ? 'true' : 'false'}
      disabled={!canDraw}
      aria-label={isSecond ? 'Yendo 2º' : 'Robar una carta (ir 2º)'}
      title={isSecond ? 'Yendo 2º' : 'Robar una carta (ir 2º)'}
      onClick={onDraw}
    >
      <span key={shuffleKey} className="practice-pile-stack" data-shuffle={shuffleKey > 0 ? 'true' : 'false'}>
        <span className="practice-card-back practice-pile-card" />
        <span className="practice-card-back practice-pile-card" />
        <span key={dealt} className="practice-card-back practice-pile-card practice-pile-top" />
      </span>
      {canDraw ? <span className="practice-pile-label">+1</span> : null}
      {isSecond ? <span className="practice-pile-badge">2º</span> : null}
    </button>
  )
})
