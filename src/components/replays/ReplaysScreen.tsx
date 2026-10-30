import { useCallback, useEffect, useMemo, useState } from 'react'

import type { SharedCombo } from '../../app/combo-share'
import type { DuelReplay } from '../../app/duel-replay'
import {
  decodeReplayPayload,
  deleteSavedReplay,
  encodeReplayPayload,
  linkFits,
  MAX_LINK_LENGTH,
  readSavedReplays,
  shareReplayLink,
  type ReplayError,
  type SavedReplay,
  type SharedRead,
} from '../../app/duel-replay-share'
import { showToastMessage } from '../../app/use-toast-message'

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
import { useBriefLoading } from '../../app/use-brief-loading'
import { useInfiniteList } from '../../app/use-infinite-list'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { formatInteger, normalizeSearchText } from '../../app/utils'
import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { MetaDeckModal } from '../meta/MetaDeckModal'
import { formatMetaDate, formatMetaDateFull } from '../meta/meta-format'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { OverflowMenu, type OverflowItem } from '../ui/OverflowMenu'
import { ScrollRow } from '../ui/ScrollRow'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'
import { StepPage } from '../ui/StepPage'
import { filterChip } from '../ui/surfaces'
import { LiveStreamsSection } from './LiveStreams'
import { ReplayModal } from './ReplayModal'
import { textLink } from '../ui/typography'
import { titleOf } from './duel-replay-text'
import { DuelReplayScreen } from './DuelReplayScreen'
import { ReplayVideoDialog } from './ReplayVideo'
import { keepReplay } from './SaveReplayDialog'
import { YourDuels } from './YourDuels'

/** Lo que muestra la fila de chips (una sola a la vez, como las categorías de YouTube): los de un deck del Meta, todos, o los de un torneo. */
type Topic = 'meta' | 'all' | `event:${string}`

/** Cuántos replays se suman cada vez que el final se acerca a la pantalla (tres columnas × cuatro filas llenan una pantalla). */
const REPLAYS_PER_PAGE = 12
const CHANNEL_BADGE: Record<ReplayChannel, string> = { eu: 'EU', tcg: 'TCG' }
/** El círculo del canal (como el avatar del canal en YouTube): un color por canal. */
const CHANNEL_AVATAR: Record<ReplayChannel, string> = { eu: 'bg-info/20 text-info-soft', tcg: 'bg-primary/25 text-foreground' }

/** El nombre de un canal, como link a su página de YouTube. */
const channelLink = (key: ReplayChannel) => (text: string) => (
  <a href={REPLAYS.channels[key].url} target="_blank" rel="noreferrer" className={textLink}>
    {text}
  </a>
)

interface ReplaysScreenProps {
  /** Los datos de un enlace de replay (`#replay=…`) con el que se abrió la app: se decodifica y se mira con el aviso «Replay compartido». */
  shared?: string | null
  /** Ya se leyó el enlace (bien o mal): quien lo pasó lo suelta. */
  onSharedRead?: () => void
  /** «Abrir archivo» trajo un combo: a la mesa de la práctica, como su enlace. */
  onOpenCombo?: (combo: SharedCombo) => void
}

const fail = (error: ReplayError) => showToastMessage(t(`meta.duels.error.${error}`), 'error')

/** Lo que dice el aviso después de compartir el enlace de un replay; `video` ofrece el video cuando el enlace no entra o no se pudo copiar. */
function tellShared(outcome: Awaited<ReturnType<typeof shareReplayLink>>, video: () => void) {
  if (outcome === 'copied') showToastMessage(t('meta.duels.copied'), 'success')
  else if (outcome === 'failed') showToastMessage(t('meta.duels.copyFailed'), 'error', { action: { label: t('meta.duels.video.download'), onAction: video } })
  else if (outcome === 'tooLong') showToastMessage(t('meta.duels.tooLong'), 'warning', { action: { label: t('meta.duels.video.download'), onAction: video } })
}

/** «Tus duelos» y el replay abierto: la lista guardada, abrir uno (guardado o de un enlace) y lo que se hace con él (el video, en `ReplayVideoDialog`). */
function useDuelReplays({ shared, onSharedRead, onOpenCombo }: ReplaysScreenProps) {
  const [items, setItems] = useState<SavedReplay[]>(readSavedReplays)
  const [opened, setOpened] = useState<{ replay: DuelReplay; payload: string; shared: boolean } | null>(null)
  const [filming, setFilming] = useState<DuelReplay | null>(null)

  // El enlace con el que se abrió la app: es de otra persona (`duel-replay-share.ts` lo valida).
  useEffect(() => {
    if (!shared) return
    let live = true
    void decodeReplayPayload(shared).then((read) => {
      if (!live) return
      onSharedRead?.()
      if (read.ok) setOpened({ replay: read.replay, payload: shared, shared: true })
      else fail(read.error)
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se lee una vez por enlace
  }, [shared])

  const importShared = useCallback(
    async (read: SharedRead) => {
      if (!read.ok) return fail(read.error)
      if (read.kind === 'combo') return onOpenCombo ? onOpenCombo(read.combo) : fail('notReplay')
      setOpened({ replay: read.replay, payload: await encodeReplayPayload(read.replay), shared: true })
    },
    [onOpenCombo],
  )
  const withReplay = (item: SavedReplay, then: (replay: DuelReplay) => void) => void decodeReplayPayload(item.payload).then((read) => (read.ok ? then(read.replay) : fail(read.error)))

  return {
    items,
    opened,
    close: () => setOpened(null),
    open: (item: SavedReplay) => withReplay(item, (replay) => setOpened({ replay, payload: item.payload, shared: false })),
    importShared: (read: SharedRead) => void importShared(read),
    filming,
    film: setFilming,
    stopFilming: () => setFilming(null),
    copyLink: (item: SavedReplay) => withReplay(item, (replay) => void shareReplayLink(replay, titleOf(replay), item.payload).then((outcome) => tellShared(outcome, () => setFilming(replay)))),
    video: (item: SavedReplay) => withReplay(item, setFilming),
    remove: (item: SavedReplay) => {
      setItems(deleteSavedReplay(item.id))
      showToastMessage(t('meta.duels.deleted'), 'info')
    },
    saveOpened: () => {
      if (!opened) return
      void keepReplay(opened.replay).then((ok) => {
        if (!ok) return
        setItems(readSavedReplays())
        setOpened({ ...opened, shared: false })
      })
    },
  }
}

export function ReplaysScreen(props: ReplaysScreenProps = {}) {
  const duels = useDuelReplays(props)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const entries = useMemo(getReplayEntries, [])
  // Lo que está al aire ahora en los canales oficiales: va arriba de los replays mientras haya algo.
  const live = useLiveStreams()
  const [topic, setTopic] = useState<Topic>('meta')
  const [query, setQuery] = useState('')
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
  // Los torneos que hay, del más nuevo al más viejo (los replays ya vienen así), con cuántos replays tiene cada uno.
  const events = useMemo(() => {
    const counts = new Map<string, number>()

    for (const entry of entries) {
      if (entry.event) counts.set(entry.event, (counts.get(entry.event) ?? 0) + 1)
    }

    return [...counts].map(([name, count]) => ({ name, count }))
  }, [entries])
  const visible = useMemo(() => {
    const searched = normalizeSearchText(query).split(' ').filter(Boolean)
    const inTopic = (entry: ReplayEntry) => (topic === 'all' ? true : topic === 'meta' ? hasMetaDeck(entry) : entry.event === topic.slice('event:'.length))

    return entries.filter((entry) => (filterDeck ? playsDeck(entry, filterDeck.id) : inTopic(entry)) && searched.every((word) => entry.search.includes(word)))
  }, [entries, filterDeck, topic, query])
  // Scroll infinito: se muestran de a una página y, al acercarse al final, se suma la que sigue. Otro filtro o búsqueda vuelve a la primera.
  const { limit, hasMore, loadMore, sentinel } = useInfiniteList(visible.length, REPLAYS_PER_PAGE, `${topic}|${query}|${filterDeck?.id ?? ''}`)
  // Al cambiar de pestaña (de chip) se ven los lugares vacíos un segundo, como cuando YouTube trae otra categoría: así se nota que la lista se actualizó.
  const refreshing = useBriefLoading(topic)
  const opened = useMemo(() => entries.find((entry) => entry.video.id === link.video) ?? null, [entries, link.video])

  const navigate = (next: { video?: string | null; deck?: number | null }) => {
    const target = { video: link.video, deck: filterDeck?.id ?? null, ...next }

    setLink({ video: target.video ?? null, deck: target.deck ?? null })
    window.history.replaceState(null, '', buildReplaysHash(target))
  }

  if (duels.opened) {
    const { replay, payload } = duels.opened
    const title = titleOf(replay)
    const video = () => duels.film(replay)

    return (
      <>
        <DuelReplayScreen
          key={payload}
          replay={replay}
          onClose={duels.close}
          shared={duels.opened.shared ? { onSave: duels.saveOpened } : undefined}
          actions={[
            ...(linkFits(payload, MAX_LINK_LENGTH) ? [{ label: t('meta.duels.copyLink'), icon: 'link' as const, onSelect: () => void shareReplayLink(replay, title, payload).then((outcome) => tellShared(outcome, video)) }] : []),
            { label: t('meta.duels.video.download'), icon: 'download', onSelect: video },
          ]}
        />
        <ReplayVideoDialog subject={duels.filming ? { kind: 'duel', replay: duels.filming } : null} onClose={duels.stopFilming} />
      </>
    )
  }

  return (
    <StepPage as="article" wide>
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

      <YourDuels items={duels.items} onOpen={duels.open} onCopyLink={duels.copyLink} onVideo={duels.video} onDelete={duels.remove} onImport={duels.importShared} />
      <ReplayVideoDialog subject={duels.filming ? { kind: 'duel', replay: duels.filming } : null} onClose={duels.stopFilming} />

      <section id="replays-list" aria-labelledby="replays-list-title" className="grid gap-4">
        <Heading level="section" id="replays-list-title">
          {t('meta.replays.listTitle')}
        </Heading>
        {/* Arriba, como la fila de categorías de YouTube: los chips (una fila que scrollea de costado) y el buscador. En el celular el buscador va primero, en píldora. */}
        <div className="grid gap-3 min-[1101px]:grid-cols-[minmax(0,1fr)_auto] min-[1101px]:items-center min-[1101px]:gap-4">
          {filterDeck ? (
            <div className="flex">
              <button type="button" className={filterChip} onClick={() => navigate({ deck: null })} aria-label={t('meta.filter.clear', { name: filterDeck.name })}>
                <span className="truncate">{filterDeck.name}</span>
                <Icon name="x" size={12} strokeWidth={2.2} />
              </button>
            </div>
          ) : (
            <ScrollRow>
              <Segmented
                value={topic}
                onChange={setTopic}
                options={[
                  { value: 'meta', label: t('meta.replays.scopeMeta'), count: metaCount },
                  { value: 'all', label: t('meta.replays.scopeAll'), count: entries.length },
                  ...events.map((event) => ({ value: `event:${event.name}` as const, label: event.name, count: event.count })),
                ]}
                label={t('meta.replays.scopeLabel')}
                variant="scroll"
              />
            </ScrollRow>
          )}
          <SearchField
            label={t('meta.replays.searchLabel')}
            value={query}
            placeholder={t('meta.replays.searchPlaceholder')}
            shape={isDesktop ? 'field' : 'pill'}
            className="min-w-[14rem] max-[1101px]:order-first min-[1101px]:w-72"
            onChange={setQuery}
          />
        </div>

        {refreshing ? (
          <div role="status" aria-label={t('meta.replays.loading')} aria-busy="true" className={GRID}>
            {Array.from({ length: Math.min(REPLAYS_PER_PAGE, Math.max(visible.length, 3), 6) }, (_, slot) => (
              <ReplaySkeleton key={slot} className={cx(slot >= 1 && 'max-sm:hidden', slot >= 4 && 'sm:max-xl:hidden')} />
            ))}
          </div>
        ) : visible.length > 0 ? (
          <ul className={GRID}>
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
            {topic === 'meta' && !filterDeck && query.trim() === '' ? t('meta.replays.noMatchMeta') : t('meta.replays.noMatchTry')}
          </EmptyState>
        )}

        {/* El final de lo mostrado: cuando se acerca a la pantalla se cargan más (mientras tanto, una fila de lugares vacíos, como YouTube). Sin scrollear (lector de pantalla, teclado) está el botón. */}
        {hasMore && !refreshing ? (
          <>
            <div ref={sentinel} aria-hidden="true" className={GRID}>
              {[0, 1, 2].map((slot) => (
                <ReplaySkeleton key={slot} className={cx(slot === 1 && 'max-sm:hidden', slot === 2 && 'hidden xl:grid')} />
              ))}
            </div>
            <Button variant="secondary" size="sm" className="sr-only focus-visible:not-sr-only focus-visible:justify-self-center" onClick={loadMore}>
              {t('meta.showMore', { count: formatInteger(Math.min(REPLAYS_PER_PAGE, visible.length - limit)) })}
            </Button>
          </>
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

/** La grilla de videos (y la de lugares vacíos de abajo): una columna en el celular, dos y tres después (`xl`, no `min-[1101px]`: con `sm:grid-cols-2` el arbitrario queda antes en el CSS y pierde). */
const GRID = 'stagger m-0 grid list-none gap-x-4 gap-y-8 p-0 sm:grid-cols-2 xl:grid-cols-3'

/** El lugar vacío de un video (la miniatura, el círculo y las dos líneas): lo que se ve al traer más y al cambiar de pestaña. */
function ReplaySkeleton({ className }: { className?: string }) {
  return (
    <div className={cx('grid content-start gap-3', className)}>
      <Skeleton radius="panel" className="aspect-video w-full" />
      <div className="flex gap-3">
        <Skeleton radius="chip" className="size-9 shrink-0" />
        <div className="grid flex-1 content-start gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </div>
    </div>
  )
}

/**
 * Un video, como en YouTube: la miniatura (con la duración) y debajo, sin caja, el círculo del canal y **dos líneas**: el título (la instancia y los jugadores) y, apagada, «torneo · fecha · N decks»; con los
 * tres puntos (⋯) a la derecha si el replay tiene decks del Meta. Al pasar el mouse (o enfocarlo) el video se destaca con un fondo detrás, que se pasa un poco de los bordes (no mueve nada), para saber cuál es: ahí está «Ver deck» (con un deck lo abre y con dos abre el replay, que lista el de cada jugador). La miniatura y el texto abren el replay.
 */
function ReplayCard({ entry, onOpen, onOpenDeck }: { entry: ReplayEntry; onOpen: () => void; onOpenDeck: (deck: MetaDeck) => void }) {
  const { video, event, stage, players } = entry
  const label = replayLabel(entry)
  const heading = [event, stage?.label].filter(Boolean).join(' · ')
  const decks = players.flatMap((player) => (player.deck ? [player.deck] : []))
  // Dos líneas, como YouTube: arriba la instancia y los jugadores; abajo el torneo, la fecha y los decks.
  const title = [stage?.label, label].filter(Boolean).join(' · ')
  const facts = [event, formatMetaDate(video.date), decks.length > 0 ? t('meta.replays.decksCount', { count: decks.length }) : null].filter(Boolean).join(' · ')
  const actions: OverflowItem[] =
    decks.length === 1
      ? [{ label: t('meta.replays.viewDeckLabel', { deck: decks[0]!.name }), icon: 'layers', onSelect: () => onOpenDeck(decks[0]!) }]
      : decks.length > 1
        ? [{ label: t('meta.replays.viewDecksLabel', { label }), icon: 'layers', onSelect: onOpen }]
        : []

  return (
    <article className="group relative isolate grid min-w-0 content-start gap-3 before:absolute before:-inset-3 before:-z-10 before:rounded-panel before:bg-tint/10 before:opacity-0 before:transition-opacity before:duration-150 hover:before:opacity-100 focus-within:before:opacity-100 motion-reduce:before:transition-none">
      <button
        type="button"
        className="relative block aspect-video w-full overflow-hidden rounded-card bg-input focus-visible:outline-none focus-visible:shadow-focus"
        aria-label={heading ? t('meta.replays.watchWithHeading', { label, heading }) : t('meta.replays.watch', { label })}
        onClick={onOpen}
      >
        {/* La miniatura de YouTube es 4:3 con barras negras arriba y abajo: `object-cover` en 16:9 las recorta. */}
        <img src={thumbnailUrl(video.id)} alt="" loading="lazy" decoding="async" className="parallax-media size-full object-cover" />
        <span aria-hidden="true" className="absolute inset-0 grid place-items-center bg-black/0 transition-colors duration-200 group-hover:bg-black/25">
          <span className="grid size-12 scale-90 place-items-center rounded-full bg-primary text-white opacity-0 transition-[opacity,transform] duration-200 group-hover:scale-100 group-hover:opacity-100 motion-reduce:transition-none">
            <Icon name="play" size={22} variant="bold" />
          </span>
        </span>
        <span className="absolute bottom-2 right-2 rounded-tag bg-black/80 px-1.5 py-0.5 text-micro font-semibold tabular-nums text-white">{video.duration}</span>
      </button>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-3">
        <span aria-hidden="true" title={REPLAYS.channels[video.channel].name} className={cx('grid size-9 place-items-center rounded-full text-micro font-extrabold', CHANNEL_AVATAR[video.channel])}>
          {CHANNEL_BADGE[video.channel]}
        </span>
        <button type="button" className="grid min-h-11 min-w-0 content-start gap-0.5 rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus" onClick={onOpen}>
          <strong className="line-clamp-2 text-body font-semibold leading-snug text-foreground">{title || label}</strong>
          <span className="truncate text-micro text-muted tabular-nums">{facts}</span>
        </button>
        {actions.length > 0 ? <OverflowMenu label={t('meta.replays.moreOptions', { label })} items={actions} className="-mr-1.5 -mt-1" /> : null}
      </div>
    </article>
  )
}
