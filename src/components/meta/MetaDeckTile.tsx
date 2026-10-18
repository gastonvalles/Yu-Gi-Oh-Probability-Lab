import { cardImageSrc } from '../../app/card-image-source'
import { coverArtUrl, type MetaDeck } from '../../app/meta'
import { countReplaysOfDeck } from '../../app/replays'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { deckKindCounts, formatMetaDate, placementLook } from './meta-format'

interface MetaDeckTileProps {
  deck: MetaDeck
  /** row: una fila del celular (la portada chica, el nombre y el puesto) · card: la tarjeta de escritorio (desde 1101 px). */
  layout: 'row' | 'card'
  onOpen: () => void
}

/** La portada que eligió YGOPRODeck para el deck; sin ella, un ícono del mismo tamaño (la grilla no salta). El que la usa le da el tamaño con `className`. */
function DeckCover({ cover, className }: { cover: number | null; className: string }) {
  return cover ? (
    <img src={cardImageSrc(coverArtUrl(cover), 512)} alt="" aria-hidden="true" loading="lazy" decoding="async" className={`${className} object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${className} grid place-items-center text-primary-soft/70`}>
      <Icon name="layers" size={20} />
    </span>
  )
}

/** Cuántos replays tiene el deck, sobre la portada (se ven al abrirlo); nada si no tiene. */
function ReplaysBadge({ deckId }: { deckId: number }) {
  const replays = countReplaysOfDeck(deckId)

  if (replays === 0) {
    return null
  }

  const label = t('meta.tournaments.hasReplays', { count: replays })

  return (
    <Badge tone="brand" icon="play" size="sm" title={label}>
      <span aria-hidden="true">{replays}</span>
      <span className="sr-only">{label}</span>
    </Badge>
  )
}

/**
 * Un deck de torneo. Una sola caja por deck, sobre el lienzo. En el celular es una fila: la portada chica, el nombre, «puesto · torneo · fecha» y el chevron.
 * Desde 1101 px es una tarjeta con el orden del lenguaje de tarjetas (`docs/ux-ui-guidelines.md`, G): nombre y quién lo jugó, la portada, lo que da contexto
 * (torneo y fecha, cuántos hand traps y boardbreakers lleva) y, abajo, el puesto —lo que decide— con el botón que abre el deck.
 */
export function MetaDeckTile({ deck, layout, onOpen }: MetaDeckTileProps) {
  return layout === 'card' ? <MetaDeckCard deck={deck} onOpen={onOpen} /> : <MetaDeckRow deck={deck} onOpen={onOpen} />
}

function MetaDeckRow({ deck, onOpen }: Omit<MetaDeckTileProps, 'layout'>) {
  const context = [deck.tournament, formatMetaDate(deck.date)].filter(Boolean).join(' · ')

  return (
    <button
      type="button"
      className="group grid min-w-0 grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-card border border-border-subtle bg-card-background p-3 text-left transition-colors duration-150 hover:border-primary/60 focus-visible:outline-none focus-visible:shadow-focus"
      onClick={onOpen}
    >
      <span className="block h-[3.8rem] w-11 overflow-hidden rounded-tag bg-input">
        <DeckCover cover={deck.cover} className="size-full" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <strong className="truncate text-body font-semibold text-foreground">{deck.name}</strong>
        {/* El puesto primero y en claro: es lo que se busca en la fila; el torneo y la fecha lo completan. */}
        <span className="truncate text-micro text-muted">
          {deck.placement ? <strong className="font-semibold text-foreground">{deck.placement}</strong> : null}
          {deck.placement && context ? ' · ' : null}
          {context}
        </span>
      </span>
      <span className="flex items-center gap-2">
        <ReplaysBadge deckId={deck.id} />
        <Icon name="chevron-right" size={18} className="text-muted" />
      </span>
    </button>
  )
}

function MetaDeckCard({ deck, onOpen }: Omit<MetaDeckTileProps, 'layout'>) {
  const context = [deck.tournament, formatMetaDate(deck.date)].filter(Boolean).join(' · ')
  const kinds = deckKindCounts(deck)
  const look = placementLook(deck.placement)

  return (
    // Cuatro filas (nombre, portada, contexto, puesto y botón) que comparten las tarjetas de la misma fila de la grilla (`grid-rows-subgrid`): el nombre de dos líneas de una no corre la portada de las demás.
    <article className="row-span-4 grid min-w-0 grid-rows-subgrid rounded-card border border-border-subtle bg-card-background p-3 transition-colors duration-150 hover:border-primary/60">
      {/* Quién es: el nombre del deck y, pegado a él, quién lo jugó. */}
      <div className="grid min-w-0 gap-0.5">
        <Heading level="card" className="line-clamp-2">
          {deck.name}
        </Heading>
        {deck.player ? <p className="m-0 truncate text-micro text-muted">{deck.player}</p> : null}
      </div>

      {/* La portada abre el deck con el mouse; para el teclado y los lectores de pantalla está el botón de abajo. */}
      <div className="relative">
        <button type="button" tabIndex={-1} aria-hidden="true" className="block aspect-[16/10] w-full overflow-hidden rounded-tag bg-input" onClick={onOpen}>
          <DeckCover cover={deck.cover} className="size-full" />
        </button>
        <span className="absolute right-2 top-2">
          <ReplaysBadge deckId={deck.id} />
        </span>
      </div>

      {/* Lo que da contexto, en un grupo: dónde y cuándo, y lo que lleva en el Main (el Side, al abrir el deck). */}
      <div className="grid gap-1 text-micro text-muted">
        {context ? (
          <p className="m-0 truncate" title={context}>
            {context}
          </p>
        ) : null}
        {kinds.length > 0 ? (
          <p className="m-0 tabular-nums" title={t('meta.deck.mainCopies')}>
            {kinds.map(({ kind, count }, at) => (
              <span key={kind}>
                {at > 0 ? ' · ' : null}
                <strong className="font-semibold text-foreground">{formatInteger(count)}</strong> {t(kind === 'handtrap' ? 'meta.deck.kindHandtraps' : 'meta.deck.kindBoardbreakers')}
              </span>
            ))}
          </p>
        ) : null}
      </div>

      {/* El dato que decide y la acción que le sigue, juntos y abajo: el puesto, con entre cuántos jugadores fue (le da sentido), y el botón. */}
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <div className="grid min-w-0 justify-items-start gap-1">
          {deck.placement ? (
            <Badge tone={look.tone} icon={look.icon}>
              {deck.placement}
            </Badge>
          ) : null}
          {deck.players !== null ? (
            <span className="text-micro text-muted tabular-nums">
              {tRich('meta.deck.ofPlayers', { b: (text) => <strong className="font-semibold text-foreground">{text}</strong> }, { players: formatInteger(deck.players) })}
            </span>
          ) : null}
        </div>
        <Button variant="secondary" icon="layers" aria-label={t('meta.tournaments.viewDeckLabel', { name: deck.name })} onClick={onOpen}>
          {t('meta.tournaments.viewDeck')}
        </Button>
      </div>
    </article>
  )
}
