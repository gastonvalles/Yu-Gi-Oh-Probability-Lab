import type { ReactNode } from 'react'

import { t } from '../../i18n'
import { CARD_BACK } from '../probability/practice-styles'
import { Button } from '../ui/Button'

interface RoomDeckProps {
  /** Con qué deck se juega: su nombre y cuántas cartas lleva (el Main y el Extra); sin deck, `null`. */
  deck: { name: string; main: number; extra: number } | null
  /** Ya estás listo: el deck no se cambia. */
  locked: boolean
  /** Ver o armar el deck: va al builder (con «Volver a Jugar»). */
  onOpenBuilder: () => void
  /** Lo que falta para poder estar listo (el formato, el Main corto, sin deck), debajo. */
  children?: ReactNode
}

/** Un mazo de tres dorsos apilados (decoración): en escritorio acompaña el nombre del deck, como la ficha del deck de la sala de otro simulador. */
function DeckPile() {
  return (
    <span aria-hidden="true" className="relative hidden h-[3.75rem] w-12 shrink-0 @[46rem]:block">
      {[0, 1, 2].map((layer) => (
        <span key={layer} className="absolute aspect-[421/614] w-9 overflow-hidden shadow-[0_2px_6px_rgba(0,0,0,0.5)]" style={{ left: layer * 5, bottom: layer * 3 }}>
          <span className={CARD_BACK} />
        </span>
      ))}
    </span>
  )
}

/**
 * Tu deck en la sala: el del builder o el que pegaste (quien llega por un enlace no pasó por el lobby). Se cambia en la hoja «Tu deck» mientras no estés listo; si no cumple, lo que falta se dice debajo. En escritorio
 * (la columna de la izquierda) el botón va debajo del nombre y a todo el ancho; en el celular, a su lado.
 */
export function RoomDeck({ deck, locked, onOpenBuilder, children }: RoomDeckProps) {
  return (
    <section aria-label={t('duel.room.deckTitle')} className="grid gap-3">
      <div className="flex items-center gap-3 @[46rem]:flex-wrap">
        <DeckPile />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-micro font-semibold uppercase text-soft">{t('duel.room.deckTitle')}</span>
          <span className="truncate text-body font-semibold text-foreground">{deck ? t('duel.room.deckLine', { name: deck.name, main: deck.main, extra: deck.extra }) : t('duel.play.deckNone')}</span>
        </span>
        {locked ? null : deck ? (
          <Button variant="secondary" size="sm" icon="cards" className="@[46rem]:w-full" onClick={onOpenBuilder}>
            {t('duel.room.deckChange')}
          </Button>
        ) : (
          <Button variant="primary" icon="cards" className="@[46rem]:w-full" onClick={onOpenBuilder}>
            {t('duel.room.deckChoose')}
          </Button>
        )}
      </div>
      {children}
    </section>
  )
}
