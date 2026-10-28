import { cardImageSrc } from '../../app/card-image-source'
import { coverArtUrl, type MetaDeck } from '../../app/meta'
import { countReplaysOfDeck } from '../../app/replays'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { ListRow } from '../ui/ListRow'
import { Skeleton } from '../ui/Skeleton'
import { deckKindCounts, formatMetaDate, placementLook } from './meta-format'

interface MetaDeckTileProps {
  deck: MetaDeck
  /** row: una fila del celular (la portada chica, el nombre y el puesto; va dentro de un `ListGroup`) · card: la tarjeta de escritorio (desde 560 px). */
  layout: 'row' | 'card'
  onOpen: () => void
}

/**
 * La portada que eligió YGOPRODeck para el deck; sin ella, un ícono del mismo tamaño (la grilla no salta), blanco como todo ícono que sólo adorna. El que la usa le da el
 * tamaño con `className`; `width`, el ancho que se le pide al proxy: 320 para la portada chica de la fila del celular (44 px, con DPR 3 son 183 px de alto), que con 512 bajaba y
 * decodificaba casi el triple de píxeles por fila al desplazar la lista.
 */
function DeckCover({ cover, className, width }: { cover: number | null; className: string; width: 320 | 512 }) {
  return cover ? (
    <img src={cardImageSrc(coverArtUrl(cover), width)} alt="" aria-hidden="true" loading="lazy" decoding="async" className={`${className} object-cover`} />
  ) : (
    <span aria-hidden="true" className={`${className} grid place-items-center text-foreground`}>
      <Icon name="layers" size={20} />
    </span>
  )
}

/**
 * Cuántos replays tiene el deck (se ven al abrirlo); nada si no tiene. Es un dato, así que va sin color; sobre la portada (`onImage`) lleva el fondo oscuro para que se lea
 * (el tinte violeta de antes se perdía en la imagen).
 */
function ReplaysBadge({ deckId, onImage = false }: { deckId: number; onImage?: boolean }) {
  const replays = countReplaysOfDeck(deckId)

  if (replays === 0) {
    return null
  }

  const label = t('meta.tournaments.hasReplays', { count: replays })

  return (
    <Badge onImage={onImage} icon="play" size="sm" title={label}>
      <span aria-hidden="true">{replays}</span>
      <span className="sr-only">{label}</span>
    </Badge>
  )
}

/**
 * Un deck de torneo. En el celular es una fila (`ListRow`) de la única tarjeta de la lista: la portada chica, el nombre, «puesto · torneo · fecha» y la flecha.
 * Desde 1101 px es una tarjeta con el orden del lenguaje de tarjetas (`docs/ux-ui-guidelines.md`, G): nombre y quién lo jugó, la portada, lo que da contexto
 * (torneo y fecha, cuántos hand traps y boardbreakers lleva) y, abajo, el puesto —lo que decide— con el botón que abre el deck.
 */
export function MetaDeckTile({ deck, layout, onOpen }: MetaDeckTileProps) {
  return layout === 'card' ? <MetaDeckCard deck={deck} onOpen={onOpen} /> : <MetaDeckRow deck={deck} onOpen={onOpen} />
}

/**
 * El lugar vacío de un deck (lo que se ve al traer más y al cambiar de filtro): las mismas medidas de la tarjeta (cuatro filas: nombre, portada, contexto, puesto y botón; comparten las filas de la grilla
 * como las tarjetas de verdad) o de la fila del celular, así nada salta cuando llega el contenido.
 */
export function MetaDeckSkeleton({ layout, className }: { layout: 'row' | 'card'; className?: string }) {
  return layout === 'card' ? (
    <div aria-hidden="true" className={cx('row-span-4 grid min-w-0 grid-rows-subgrid rounded-card border border-border-subtle bg-card-background p-3', className)}>
      <div className="grid min-w-0 content-start gap-1.5">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <Skeleton radius="control" className="aspect-[16/10] w-full" />
      <div className="grid content-start gap-1.5">
        <Skeleton className="h-3 w-3/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
        <div className="grid gap-1.5">
          <Skeleton radius="chip" className="h-6 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-11 w-24" />
      </div>
    </div>
  ) : (
    // Una fila de la lista (`ListRow`), con el mismo alto: la portada recta, el nombre y el puesto.
    <li aria-hidden="true" className={cx('flex min-h-16 min-w-0 items-center gap-3 py-3', className)}>
      <Skeleton radius="none" className="h-12 w-9 shrink-0" />
      <span className="grid flex-1 gap-1.5">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-3 w-4/5" />
      </span>
    </li>
  )
}

function MetaDeckRow({ deck, onOpen }: Omit<MetaDeckTileProps, 'layout'>) {
  const context = [deck.tournament, formatMetaDate(deck.date)].filter(Boolean).join(' · ')

  return (
    <ListRow
      title={deck.name}
      // La portada es una carta: recta (regla 8).
      media={
        <span className="block h-12 w-9 overflow-hidden bg-input">
          <DeckCover cover={deck.cover} className="size-full" width={320} />
        </span>
      }
      // El puesto primero y en claro: es lo que se busca en la fila; el torneo y la fecha lo completan (en dos renglones, sin cortar el torneo).
      subtitle={
        <>
          {deck.placement ? <strong className="font-semibold text-foreground">{deck.placement}</strong> : null}
          {deck.placement && context ? ' · ' : null}
          {context}
        </>
      }
      value={<ReplaysBadge deckId={deck.id} />}
      onClick={onOpen}
    />
  )
}

function MetaDeckCard({ deck, onOpen }: Omit<MetaDeckTileProps, 'layout'>) {
  const context = [deck.tournament, formatMetaDate(deck.date)].filter(Boolean).join(' · ')
  const kinds = deckKindCounts(deck)
  const look = placementLook(deck.placement)

  return (
    // Cuatro filas (nombre, portada, contexto, puesto y botón) que comparten las tarjetas de la misma fila de la grilla (`grid-rows-subgrid`): el nombre de dos líneas de una no corre la portada de las demás.
    // Al pasar el mouse o con el foco del teclado en su botón, el borde se enciende en ámbar (el énfasis y el hover son ámbar; el violeta, el fondo).
    <article className="row-span-4 grid min-w-0 grid-rows-subgrid rounded-card border border-border-subtle bg-card-background p-3 transition-colors duration-150 hover:border-info/60 has-focus-visible:border-info/60">
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
          <DeckCover cover={deck.cover} className="size-full" width={512} />
        </button>
        <span className="absolute right-2 top-2">
          <ReplaysBadge deckId={deck.id} onImage />
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
        {/* La única acción de la tarjeta: con borde fino (la lavanda no se veía sobre la tarjeta) y en ámbar al apuntarla, como el borde de la tarjeta. */}
        <Button variant="outline" icon="layers" aria-label={t('meta.tournaments.viewDeckLabel', { name: deck.name })} onClick={onOpen}>
          {t('meta.tournaments.viewDeck')}
        </Button>
      </div>
    </article>
  )
}
