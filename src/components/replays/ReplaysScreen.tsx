import { useEffect, useMemo, useState } from 'react'

import { META_DECKS, type MetaDeck } from '../../app/meta'
import { useLiveStreams } from '../../app/use-live-streams'
import {
  REPLAYS,
  buildReplaysHash,
  getReplayEntries,
  hasMetaDeck,
  playsDeck,
  readReplaysHash,
  replayLabel,
  thumbnailUrl,
  type ReplayChannel,
  type ReplayEntry,
} from '../../app/replays'
import { formatInteger, normalizeSearchText } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { MetaDeckModal } from '../meta/MetaDeckModal'
import { formatMetaDate, formatMetaDateFull } from '../meta/meta-format'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { filterChip } from '../ui/surfaces'
import { LiveStreamsSection } from './LiveStreams'
import { ReplayModal } from './ReplayModal'

type Scope = 'meta' | 'all'

const REPLAYS_PER_PAGE = 12
const CHANNEL_BADGE: Record<ReplayChannel, string> = { eu: 'EU', tcg: 'TCG' }

/** El nombre de un canal, como link a su página de YouTube. */
const channelLink = (key: ReplayChannel) => (text: string) => (
  <a href={REPLAYS.channels[key].url} target="_blank" rel="noreferrer" className="font-semibold text-primary-soft underline-offset-2 hover:underline">
    {text}
  </a>
)

export function ReplaysScreen() {
  const entries = useMemo(getReplayEntries, [])
  // Lo que está al aire ahora en los canales oficiales: va arriba de los replays mientras haya algo.
  const live = useLiveStreams()
  const [scope, setScope] = useState<Scope>('meta')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(REPLAYS_PER_PAGE)
  // El replay abierto y el deck filtrado viven en el hash (`#replays?video=…&deck=…`): se pueden copiar y pegar.
  const [link, setLink] = useState(() => readReplaysHash(window.location.hash))
  // El deck de un jugador, abierto en su detalle sin salir de los replays.
  const [openedDeck, setOpenedDeck] = useState<MetaDeck | null>(null)

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
    ? filterDeck.tournament
      ? t('meta.replays.descriptionDeckTournament', { count: visible.length, deck: filterDeck.name, tournament: filterDeck.tournament })
      : t('meta.replays.descriptionDeck', { count: visible.length, deck: filterDeck.name })
    : t(scope === 'meta' ? 'meta.replays.descriptionMeta' : 'meta.replays.descriptionAll', { count: visible.length })

  return (
    <StepPage as="article">
      <StepHero
        title={t('meta.replays.title')}
        icon="play"
        subtitle={t('meta.replays.subtitle')}
        help={
          <div className="grid gap-1">
            <strong className="text-foreground">{t('meta.replays.helpTitle')}</strong>
            <ul className="m-0 grid list-disc gap-1 pl-4">
              <li>{t('meta.replays.help1')}</li>
              <li>{t('meta.replays.help2')}</li>
              <li>{t('meta.replays.help3')}</li>
              <li>{t('meta.replays.help4')}</li>
            </ul>
          </div>
        }
        side={
          <Badge icon="refresh" title={t('meta.replays.updatedTitle')}>
            {tRich(
              'meta.updated',
              { lead: (text) => <span className="sr-only min-[1101px]:not-sr-only">{text} </span> },
              { date: formatMetaDateFull(REPLAYS.fetchedAt) },
            )}
          </Badge>
        }
      />

      <LiveStreamsSection state={live} />

      <section id="replays-list" aria-labelledby="replays-list-title" className="grid gap-4">
        <Heading level="section" id="replays-list-title" className="sr-only">
          {t('meta.replays.listTitle')}
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          {filterDeck ? (
            <button type="button" className={filterChip} onClick={() => navigate({ deck: null })} aria-label={t('meta.filter.clear', { name: filterDeck.name })}>
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
                { value: 'meta', label: t('meta.replays.scopeMeta'), count: metaCount },
                { value: 'all', label: t('meta.replays.scopeAll'), count: entries.length },
              ]}
              label={t('meta.replays.scopeLabel')}
              variant="chips"
              className="max-[1100px]:w-full"
            />
          )}
          <SearchField
            label={t('meta.replays.searchLabel')}
            value={query}
            placeholder={t('meta.replays.searchPlaceholder')}
            className="min-w-[14rem] flex-1 max-[1100px]:w-full"
            onChange={(next) => {
              setQuery(next)
              setLimit(REPLAYS_PER_PAGE)
            }}
          />
        </div>
        <p className="m-0 text-body text-muted">{description}</p>

        {visible.length > 0 ? (
          // `xl` (no `min-[1101px]`): con `sm:grid-cols-2` el arbitrario queda antes en el CSS y pierde, así que no pasaba de dos columnas.
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">
            {visible.slice(0, limit).map((entry) => (
              <li key={entry.video.id} className="min-w-0">
                <ReplayCard entry={entry} onOpen={() => navigate({ video: entry.video.id })} onOpenDeck={setOpenedDeck} />
              </li>
            ))}
          </ul>
        ) : entries.length === 0 ? (
          <EmptyState icon="play" title={t('meta.replays.emptyTitle')}>
            {t('meta.replays.emptyHint')}
          </EmptyState>
        ) : (
          <EmptyState icon="search" title={t('meta.replays.noMatchTitle')}>
            {scope === 'meta' && !filterDeck && query.trim() === '' ? t('meta.replays.noMatchMeta') : t('meta.replays.noMatchTry')}
          </EmptyState>
        )}

        {visible.length > limit ? (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((current) => current + REPLAYS_PER_PAGE)}>
              {t('meta.showMore', { count: formatInteger(Math.min(REPLAYS_PER_PAGE, visible.length - limit)) })}
            </Button>
          </div>
        ) : null}

        <p className="m-0 text-micro text-soft">
          {tRich('meta.replays.channels', { eu: channelLink('eu'), tcg: channelLink('tcg') }, { eu: REPLAYS.channels.eu.name, tcg: REPLAYS.channels.tcg.name })}
        </p>
      </section>

      <ReplayModal
        entry={opened}
        onClose={() => navigate({ video: null })}
        onOpenDeck={(deck) => {
          // El video se corta (si no, seguiría sonando debajo del deck); desde el detalle del deck se vuelve a él.
          navigate({ video: null })
          setOpenedDeck(deck)
        }}
      />
      <MetaDeckModal deck={openedDeck} onClose={() => setOpenedDeck(null)} onOpenDeck={setOpenedDeck} />
    </StepPage>
  )
}

/**
 * La miniatura y el título abren el replay; abajo, «fecha · N decks» y un solo botón (el número y la acción, juntos): con un deck lo abre y con dos
 * abre el replay, que lista el de cada jugador. El botón va aparte (no dentro de los otros dos) para no anidar botones.
 */
function ReplayCard({ entry, onOpen, onOpenDeck }: { entry: ReplayEntry; onOpen: () => void; onOpenDeck: (deck: MetaDeck) => void }) {
  const { video, event, stage, players } = entry
  const label = replayLabel(entry)
  const heading = [event, stage?.label].filter(Boolean).join(' · ')
  const decks = players.flatMap((player) => (player.deck ? [player.deck] : []))
  const facts = [formatMetaDate(video.date), decks.length > 0 ? t('meta.replays.decksCount', { count: decks.length }) : null].filter(Boolean).join(' · ')

  return (
    <article className="group grid h-full min-w-0 content-start overflow-hidden rounded-card border border-border-subtle bg-card-background transition-colors duration-150 hover:border-primary/60">
      <button
        type="button"
        className="relative block aspect-video w-full overflow-hidden bg-input focus-visible:outline-none focus-visible:shadow-focus"
        aria-label={heading ? t('meta.replays.watchWithHeading', { label, heading }) : t('meta.replays.watch', { label })}
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

      <div className="grid content-start gap-3 p-3">
        <button type="button" className="grid min-w-0 content-center gap-0.5 rounded-tag text-left pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:shadow-focus" onClick={onOpen}>
          <strong className="text-body font-semibold text-foreground">{heading || label}</strong>
          {heading ? <span className="truncate text-micro text-muted">{label}</span> : null}
        </button>

        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-micro text-muted tabular-nums">{facts}</span>
          {decks.length === 1 ? (
            <Button variant="secondary" icon="layers" aria-label={t('meta.replays.viewDeckLabel', { deck: decks[0]!.name })} onClick={() => onOpenDeck(decks[0]!)}>
              {t('meta.replays.viewDeck')}
            </Button>
          ) : decks.length > 1 ? (
            <Button variant="secondary" icon="layers" aria-label={t('meta.replays.viewDecksLabel', { label })} onClick={onOpen}>
              {t('meta.replays.viewDecks')}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
