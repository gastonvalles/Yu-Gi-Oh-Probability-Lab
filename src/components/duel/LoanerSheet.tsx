import type { ReactNode } from 'react'

import { botDeckList } from '../../app/bot-deck-lists'
import { cardSmallImageUrl } from '../../app/card-prices'
import { MAIN_MINIMUM } from '../../app/duel-siding'
import type { LoanerDeck } from '../../app/loaner-deck'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { ListGroup, ListRow } from '../ui/ListRow'
import { Modal } from '../ui/Modal'
import { overline, textLink } from '../ui/typography'
import type { Loaners } from './use-loaners'

/**
 * El recuadro de un mazo de bot: su primera carta (la que lo define, por el proxy de imágenes), recta como toda carta. Es decorativo: el nombre ya va en texto. Sin imagen, las
 * iniciales de `CardArt`. Lo usan los rivales de Solo y el mazo prestado.
 */
export function DeckArt({ deck, large = false }: { deck: { id: string; name: string }; large?: boolean }) {
  const face = botDeckList(deck.id)?.main[0]?.[0]

  return (
    <span aria-hidden="true" className={cx('block aspect-[421/614] shrink-0 overflow-hidden rounded-none bg-input', large ? 'w-16' : 'w-10')}>
      <CardArt remoteUrl={face ? cardSmallImageUrl(face) : null} name={deck.name} className="block h-full w-full object-cover" />
    </span>
  )
}

/**
 * La fila «Tu deck» de Online y de Solo: el deck con que entrás y «Cambiar». Con un prestado, su carta, el chip «Prestado» y su nombre con las cartas del Main
 * («Sky Striker · 40»); con tu deck, como siempre. `name` es la línea de abajo (el deck, «Sin deck» o por qué no hay prestado).
 */
export function PlayDeckRow({ name, loan, popup = false, onChange }: { name: string; loan: LoanerDeck | null; /** «Cambiar» abre la hoja de los prestados (sin deck propio completo); si no, va al builder. */ popup?: boolean; onChange: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {loan ? <DeckArt deck={loan.list} /> : null}
      <span className="grid min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5 text-micro text-muted">
          {t('duel.room.deckTitle')}
          {loan ? (
            <Badge tone="brand" size="sm">
              {t('duel.loaner.chip')}
            </Badge>
          ) : null}
        </span>
        <span className="truncate text-body font-semibold text-foreground">{name}</span>
      </span>
      <button type="button" aria-label={t(popup ? 'duel.loaner.change' : 'duel.room.deckChange')} aria-haspopup={popup ? 'dialog' : undefined} className={cx('inline-flex min-h-11 shrink-0 items-center rounded-control px-1 text-body', textLink)} onClick={onChange}>
        {t('duel.play.deckChange')}
      </button>
    </div>
  )
}

interface LoanerSheetProps {
  isOpen: boolean
  onClose: () => void
  loaners: Loaners
  /** El que se juega ahora (`null`: ninguno se puede). */
  current: string | null
  /** Por qué no se puede elegir uno, en una línea (no vale en el formato de la sala, es el del bot rival); `null` si se puede. */
  blocked?: (deck: LoanerDeck) => string | null
  /** Elegir uno: queda elegido y se recuerda. */
  onPick: (id: string) => void
  /** Las cartas del Main de tu deck: con alguna, «El tuyo» dice cuántas le faltan (una pista, no un error: todavía no intentaste jugar con él). */
  own: number
  /** Cuántas hacen falta para lo que vas a hacer: el Main de un duelo en Online (de entrada), la mano en Solo. La pista sale sólo si no alcanza. */
  need?: number
  onOpenBuilder: () => void
  /** La acción principal, abajo («Jugar con Sky Striker»). */
  footer: ReactNode
}

/**
 * «¿Con qué mazo jugás?»: la hoja de «Cambiar» cuando no tenés un deck propio completo. Arriba, «Listos para jugar», los mazos de los bots (uno elegido, con la línea de qué hace
 * cada uno; apagado y con el porqué el que no se puede); abajo, «El tuyo», que lleva al builder (armar, cargar uno de torneo o importar). Una sola acción principal al pie.
 * Elegir no juega: lo hace el botón de abajo. Estados: cargando (esqueleto de la lista), error con «Reintentar», elegido. Teclado: la lista es un `radiogroup` de `ListRow`.
 * Usos: la portada de Online (`PlayHome`), la fila «Tu deck» de Solo y su muestra en `/playground`.
 */
export function LoanerSheet({ isOpen, onClose, loaners, current, blocked = () => null, onPick, own, need = MAIN_MINIMUM, onOpenBuilder, footer }: LoanerSheetProps) {
  const missing = Math.max(0, need - own)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="keypad" title={t('duel.loaner.title')} footer={footer}>
      <div className="grid min-w-0 gap-4">
        <section className="grid min-w-0 gap-2">
          <h3 className={cx(overline, 'm-0 px-1')}>{t('duel.loaner.ready')}</h3>
          {loaners.status === 'error' ? (
            <Callout
              tone="danger"
              title={t('duel.loaner.error')}
              action={
                <Button variant="secondary" size="sm" icon="refresh" onClick={loaners.retry}>
                  {t('duel.loaner.retry')}
                </Button>
              }
            />
          ) : (
            <div role="radiogroup" aria-label={t('duel.loaner.ready')}>
              <ListGroup loading={loaners.status !== 'ready'}>
                {loaners.decks.map((deck) => {
                  const why = blocked(deck)

                  return (
                    <ListRow
                      key={deck.list.id}
                      choice
                      title={deck.list.name}
                      subtitle={why ?? t(deck.list.line)}
                      media={<DeckArt deck={deck.list} />}
                      selected={deck.list.id === current}
                      disabled={why !== null}
                      onClick={() => onPick(deck.list.id)}
                    />
                  )
                })}
              </ListGroup>
            </div>
          )}
        </section>
        <section className="grid min-w-0 gap-2">
          <h3 className={cx(overline, 'm-0 px-1')}>{t('duel.loaner.yours')}</h3>
          <ListGroup>
            <ListRow
              title={own > 0 ? t('duel.loaner.keep') : t('duel.loaner.build')}
              subtitle={own > 0 && missing > 0 ? t('duel.loaner.missing', { count: missing, have: own }) : t('duel.loaner.buildHint')}
              icon="cards"
              onClick={onOpenBuilder}
            />
          </ListGroup>
        </section>
      </div>
    </Modal>
  )
}
