import { useEffect, useMemo, useState } from 'react'

import { META_DECKS, buildMetaDeckHash } from '../../app/meta-handtraps'
import {
  REPLAYS,
  buildReplaysHash,
  getReplayEntries,
  hasMetaDeck,
  playsDeck,
  readReplaysHash,
  thumbnailUrl,
  type ReplayChannel,
  type ReplayEntry,
} from '../../app/replays'
import { formatInteger, normalizeSearchText } from '../../app/utils'
import { formatMetaDateFull } from '../meta/meta-format'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { field, filterChip } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { ReplayModal } from './ReplayModal'

type Scope = 'meta' | 'all'

const REPLAYS_PER_PAGE = 12
const CHANNEL_BADGE: Record<ReplayChannel, string> = { eu: 'EU', tcg: 'TCG' }

export function ReplaysScreen() {
  const entries = useMemo(getReplayEntries, [])
  const [scope, setScope] = useState<Scope>('meta')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(REPLAYS_PER_PAGE)
  // El replay abierto y el deck filtrado viven en el hash (`#replays?video=…&deck=…`): se pueden copiar y pegar.
  const [link, setLink] = useState(() => readReplaysHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => setLink(readReplaysHash(window.location.hash))

    window.addEventListener('hashchange', handleHashChange)

    return () => {
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  const filterDeck = useMemo(() => (link.deck === null ? null : (META_DECKS.decks.find((deck) => deck.id === link.deck) ?? null)), [link.deck])
  const metaCount = useMemo(() => entries.filter(hasMetaDeck).length, [entries])
  const visible = useMemo(() => {
    const searched = normalizeSearchText(query).split(' ').filter(Boolean)

    return entries.filter(
      (entry) => (filterDeck ? playsDeck(entry, filterDeck.id) : scope === 'all' || hasMetaDeck(entry)) && searched.every((word) => entry.search.includes(word)),
    )
  }, [entries, filterDeck, scope, query])
  const opened = useMemo(() => entries.find((entry) => entry.video.id === link.video) ?? null, [entries, link.video])

  const navigate = (next: { video?: string | null; deck?: number | null }) => {
    const target = { video: link.video, deck: filterDeck?.id ?? null, ...next }

    setLink({ video: target.video ?? null, deck: target.deck ?? null })
    window.history.replaceState(null, '', buildReplaysHash(target))
  }

  const description = filterDeck
    ? `${formatInteger(visible.length)} replays de ${filterDeck.name}${filterDeck.tournament ? ` en ${filterDeck.tournament}` : ''}, de lo más nuevo a lo más viejo.`
    : scope === 'meta'
      ? `${formatInteger(visible.length)} replays con al menos un deck de la pestaña Meta, de lo más nuevo a lo más viejo. Tocá uno para verlo.`
      : `${formatInteger(visible.length)} replays de los canales, de lo más nuevo a lo más viejo. Tocá uno para verlo.`

  return (
    <StepPage as="article">
      <StepHero
        title="Replays"
        icon="play"
        subtitle="Los duelos de torneo de los decks del Meta, en video."
        help={
          <div className="grid gap-1">
            <strong className="text-foreground">De dónde salen</strong>
            <ul className="m-0 grid list-disc gap-1 pl-4">
              <li>Son los duelos de torneo de los canales de YouTube Yu-Gi-Oh! TCG Europe y Yu-Gi-Oh! TCG. Se actualizan todos los días.</li>
              <li>
                Cada replay se cruza con los decks de la pestaña Meta por torneo y jugador: los canales sólo ponen la inicial del apellido, y si ese jugador llevó
                uno de esos decks lo ves debajo y lo podés abrir.
              </li>
              <li>Muchos duelos son de jugadores cuyo deck no está en el Meta: con “Todos” los ves igual.</li>
            </ul>
          </div>
        }
        side={
          <Badge icon="refresh" title="Fecha de la última actualización de los replays">
            <span className="sr-only min-[1101px]:not-sr-only">Actualizado el </span>
            {formatMetaDateFull(REPLAYS.fetchedAt)}
          </Badge>
        }
      />

      <Card id="replays-list">
        <SectionHeader
          icon="play"
          title="Replays de torneo"
          description={description}
          actions={
            <>
              {filterDeck ? (
                <button type="button" className={filterChip} onClick={() => navigate({ deck: null })} aria-label={`Quitar el filtro ${filterDeck.name}`}>
                  <span className="truncate">{filterDeck.name}</span>
                  <Icon name="x" size={12} strokeWidth={2.2} />
                </button>
              ) : (
                <Segmented
                  value={scope}
                  onChange={(next) => {
                    setScope(next)
                    setLimit(REPLAYS_PER_PAGE)
                  }}
                  options={[
                    { value: 'meta', label: 'Con deck del Meta', count: metaCount },
                    { value: 'all', label: 'Todos', count: entries.length },
                  ]}
                  label="Qué replays mostrar"
                  size="sm"
                  className="max-[1100px]:w-full"
                />
              )}
              <label className="relative block min-w-[14rem] flex-1 max-[1100px]:w-full">
                <span className="sr-only">Buscar replays</span>
                <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
                <input
                  type="search"
                  value={query}
                  placeholder="Torneo, jugador o deck"
                  autoComplete="off"
                  className={cx(field, 'h-9 w-full pl-9 pr-3 text-body')}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setLimit(REPLAYS_PER_PAGE)
                  }}
                />
              </label>
            </>
          }
        />

        {visible.length > 0 ? (
          // `xl` (no `min-[1101px]`): con `sm:grid-cols-2` el arbitrario queda antes en el CSS y pierde, así que no pasaba de dos columnas.
          <ul className="m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, limit).map((entry) => (
              <li key={entry.video.id} className="min-w-0">
                <ReplayCard entry={entry} onOpen={() => navigate({ video: entry.video.id })} />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <EmptyState icon="play" title="Todavía no hay replays">
            Aparecen cuando los canales suben los duelos de un torneo. Se actualizan todos los días.
          </EmptyState>
        ) : (
          <EmptyState icon="search" title="Ningún replay con eso">
            {scope === 'meta' && !filterDeck && query.trim() === ''
              ? 'Ningún replay de los canales tiene un deck del Meta. Probá con “Todos”.'
              : 'Probá con otro torneo, jugador o deck.'}
          </EmptyState>
        )}

        {visible.length > limit ? (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((current) => current + REPLAYS_PER_PAGE)}>
              Ver {formatInteger(Math.min(REPLAYS_PER_PAGE, visible.length - limit))} más
            </Button>
          </div>
        ) : null}

        <p className="m-0 mt-4 text-micro text-soft">
          Los videos son de los canales oficiales{' '}
          {(Object.keys(REPLAYS.channels) as ReplayChannel[]).map((key, index) => (
            <span key={key}>
              {index > 0 ? ' y ' : null}
              <a href={REPLAYS.channels[key].url} target="_blank" rel="noreferrer" className="font-semibold text-primary-soft underline-offset-2 hover:underline">
                {REPLAYS.channels[key].name}
              </a>
            </span>
          ))}{' '}
          en YouTube.
        </p>
      </Card>

      <ReplayModal entry={opened} onClose={() => navigate({ video: null })} />
    </StepPage>
  )
}

/** La miniatura y el título abren el replay; los decks de cada jugador llevan a la pestaña Meta (por eso van aparte, no dentro del botón). */
function ReplayCard({ entry, onOpen }: { entry: ReplayEntry; onOpen: () => void }) {
  const { video, event, stage, players } = entry
  const label = `${players[0].name} vs. ${players[1].name}`
  const heading = [event, stage?.label].filter(Boolean).join(' · ')

  return (
    <article className="group grid h-full min-w-0 content-start overflow-hidden rounded-card border border-border-subtle bg-card-background transition-colors duration-150 hover:border-primary/60">
      <button
        type="button"
        className="relative block aspect-video w-full overflow-hidden bg-input focus-visible:outline-none focus-visible:shadow-focus"
        aria-label={`Ver el replay ${label}${heading ? `, ${heading}` : ''}`}
        onClick={onOpen}
      >
        {/* La miniatura de YouTube es 4:3 con barras negras arriba y abajo: `object-cover` en 16:9 las recorta. */}
        <img src={thumbnailUrl(video.id)} alt="" loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/15 transition-colors duration-150 group-hover:bg-black/35">
          <span className="grid size-11 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-brand">
            <Icon name="play" size={20} variant="bold" />
          </span>
        </span>
        <span className="absolute bottom-1.5 right-1.5 rounded-tag bg-black/80 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">{video.duration}</span>
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/75 px-2 py-0.5 text-micro font-semibold text-white" title={REPLAYS.channels[video.channel].name}>
          {CHANNEL_BADGE[video.channel]}
        </span>
      </button>

      <div className="grid content-start gap-2 p-3">
        <button type="button" className="grid min-w-0 gap-0.5 rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus" onClick={onOpen}>
          {heading ? <span className={cx(overline, 'truncate')}>{heading}</span> : null}
          <strong className="text-body font-semibold text-foreground">{label}</strong>
        </button>

        <ul className="m-0 grid list-none gap-1 p-0">
          {players.map((player, index) => (
            <li key={index} className="flex min-w-0 items-center gap-1.5 text-micro">
              <Icon name="user" size={13} className="shrink-0 text-soft" />
              <span className="shrink-0 font-semibold text-foreground">{player.name}</span>
              {player.deck ? (
                <a
                  href={buildMetaDeckHash(player.deck.id)}
                  className="min-w-0 truncate text-primary-soft underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus"
                  title={`${player.deck.name}${player.deck.placement ? ` · ${player.deck.placement}` : ''}: abrirlo en la pestaña Meta`}
                >
                  {player.deck.name}
                </a>
              ) : (
                <span className="truncate text-soft">deck sin identificar</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}
