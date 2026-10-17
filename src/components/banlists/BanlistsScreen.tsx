import { memo, useCallback, useMemo, useState } from 'react'

import {
  BANLISTS_FETCHED_AT,
  banlistCardName,
  banlistsOf,
  diffBanlists,
  formatBanlistDate,
  isUpcoming,
  listedCards,
  type Banlist,
  type BanlistRegion,
} from '../../app/banlists'
import { cardSmallImageUrl } from '../../app/card-prices'
import { setMetaRegion, useMetaRegion } from '../../app/use-meta-region'
import { formatInteger, normalizeSearchText } from '../../app/utils'
import { formatDay, t } from '../../i18n'
import { useAppSelector } from '../../app/store-hooks'
import type { BanlistStatus } from '../../types'
import { StepHero } from '../StepHero'
import { TiltCard } from '../card-detail/TiltCard'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import type { Tone } from '../ui/tone'
import { BanlistCardModal } from './BanlistCardModal'

type View = 'changes' | 'full'

const REGIONS = [
  { value: 'tcg', label: 'TCG' },
  { value: 'ocg', label: 'OCG' },
] as const satisfies ReadonlyArray<{ value: BanlistRegion; label: string }>

/** El orden de las secciones, como en los anuncios de Konami: de lo más duro a lo que se libera. */
const STATUSES: readonly BanlistStatus[] = ['forbidden', 'limited', 'semi-limited', 'unlimited']
const TITLE_KEY = {
  forbidden: 'catalog.banlists.title.forbidden',
  limited: 'catalog.banlists.title.limited',
  'semi-limited': 'catalog.banlists.title.semiLimited',
  unlimited: 'catalog.banlists.title.unlimited',
} as const satisfies Record<BanlistStatus, string>
const STATUS_KEY = {
  forbidden: 'catalog.banlists.status.forbidden',
  limited: 'catalog.banlists.status.limited',
  'semi-limited': 'catalog.banlists.status.semiLimited',
  unlimited: 'catalog.banlists.status.unlimited',
} as const satisfies Record<BanlistStatus, string>
const STATUS_TONE: Record<BanlistStatus, Tone> = { forbidden: 'danger', limited: 'warning', 'semi-limited': 'info', unlimited: 'success' }
/** Cuántas copias se podían tener en cada estado: es lo que dice la etiqueta «Antes N» sobre la carta. */
const COPIES: Record<BanlistStatus, number> = { forbidden: 0, limited: 1, 'semi-limited': 2, unlimited: 3 }

/** Una carta de una sección: lo que se muestra y, en los cambios, cómo estaba antes. */
interface Entry {
  cardId: number
  from?: BanlistStatus
}

/**
 * Las banlists históricas del TCG y del OCG, para navegarlas a gusto: se elige la región y la lista (una por una, o con las flechas de la más vieja
 * a la más nueva) y se ve qué cambió respecto de la anterior, como lo anuncia Konami (prohibidas, limitadas, semi-limitadas y liberadas), o la lista
 * completa. Tocar una carta abre su detalle.
 */
export function BanlistsScreen() {
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  // Arranca en la región del formato del builder; después se cambia desde el encabezado (vale también para los tier lists y los decks de torneo).
  const region = useMetaRegion(deckFormat === 'ocg' ? 'ocg' : 'tcg')
  const lists = banlistsOf(region)
  const [picked, setPicked] = useState<{ region: BanlistRegion; date: string } | null>(null)
  const [view, setView] = useState<View>('changes')
  const [query, setQuery] = useState('')
  const [opened, setOpened] = useState<{ cardId: number; status: BanlistStatus } | null>(null)
  // La lista elegida vale para la región en que se la eligió: al cambiar de región se vuelve a la más nueva.
  const index = Math.max(0, picked?.region === region ? lists.findIndex((list) => list.date === picked.date) : 0)
  const list = lists[index]
  const previous = lists[index + 1] ?? null
  const words = useMemo(() => normalizeSearchText(query).split(' ').filter(Boolean), [query])
  // Las secciones sólo dependen de la lista y de la vista (la lista y la anterior son siempre las mismas de cada región): escribir en el buscador
  // no repite el diff, y las cartas de cada una (`entries`) son las mismas, así que las de `BanlistTile` no se vuelven a dibujar.
  const sections = useMemo<Array<{ status: BanlistStatus; entries: Entry[] }>>(() => {
    if (!list) {
      return []
    }

    if (view === 'changes') {
      const changes = diffBanlists(previous, list)

      return STATUSES.map((status) => ({ status, entries: changes[status].map(({ cardId, from }) => ({ cardId, from })) }))
    }

    const listed = listedCards(list)

    return STATUSES.filter((status) => status !== 'unlimited').map((status) => ({ status, entries: listed[status as Exclude<BanlistStatus, 'unlimited'>].map((cardId) => ({ cardId })) }))
  }, [view, list, previous])
  const visible = useMemo(
    () =>
      sections
        .map((section) => ({ ...section, entries: section.entries.filter((entry) => words.every((word) => normalizeSearchText(banlistCardName(entry.cardId)).includes(word))) }))
        .filter((section) => section.entries.length > 0),
    [sections, words],
  )
  const open = useCallback((cardId: number, status: BanlistStatus) => setOpened({ cardId, status }), [])

  if (!list) {
    return null
  }

  // Las listas que se anunciaron y todavía no rigen van antes de la vigente: la vigente es la primera que ya rige.
  const status = isUpcoming(list) ? t('catalog.banlists.upcoming') : index === lists.findIndex((candidate) => !isUpcoming(candidate)) ? t('catalog.banlists.current') : null
  const pick = (nextIndex: number) => setPicked({ region, date: lists[nextIndex]!.date })
  const total = sections.reduce((sum, section) => sum + section.entries.length, 0)

  return (
    <StepPage as="article" wide>
      <StepHero
        title={t('catalog.banlists.title')}
        icon="ban"
        subtitle={t('catalog.banlists.subtitle')}
        help={<p className="m-0">{t('catalog.banlists.help', { tcg: formatBanlistDate(banlistsOf('tcg').at(-1)!.date), ocg: formatBanlistDate(banlistsOf('ocg').at(-1)!.date) })}</p>}
        side={
          <div className="flex w-full items-center gap-2 min-[1101px]:w-auto">
            <Badge icon="refresh" title={t('catalog.banlists.updatedTitle')} className="min-[1101px]:order-first">
              {t('catalog.banlists.updated', { date: formatDay(new Date(`${BANLISTS_FETCHED_AT}T00:00:00Z`), 'UTC') })}
            </Badge>
            <Segmented value={region} onChange={setMetaRegion} options={REGIONS} label={t('catalog.banlists.regionLabel')} size="sm" className="min-w-0 max-[1100px]:order-first max-[1100px]:flex-1" />
          </div>
        }
      />

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-1 min-[700px]:flex-none">
            <IconButton tone="raised" size="lg" aria-label={t('catalog.banlists.older')} title={t('catalog.banlists.older')} disabled={index >= lists.length - 1} onClick={() => pick(index + 1)}>
              <Icon name="chevron-left" />
            </IconButton>
            {/* La fecha y su estado se ven en el medio; el <select> de verdad (que deja saltar a cualquier lista) va encima, transparente. */}
            <div className="relative grid h-11 min-w-0 flex-1 content-center justify-items-center rounded-control text-center focus-within:shadow-focus min-[700px]:w-64 min-[700px]:flex-none">
              <strong className="max-w-full truncate text-body font-semibold text-foreground">{formatBanlistDate(list.date)}</strong>
              {status || list.partial ? (
                <span className="flex items-center justify-center gap-1.5 text-micro text-muted">
                  {status}
                  {list.partial ? (
                    <Badge tone="warning" size="sm">
                      {t('catalog.banlists.partial')}
                    </Badge>
                  ) : null}
                </span>
              ) : null}
              <select
                className="absolute inset-0 size-full cursor-pointer appearance-none rounded-control opacity-0 [color-scheme:dark] focus-visible:outline-none [&_option]:bg-secondary [&_option]:text-foreground"
                value={list.date}
                aria-label={t('catalog.banlists.pickLabel')}
                onChange={(event) => setPicked({ region, date: event.target.value })}
              >
                {lists.map((option) => (
                  <option key={option.date} value={option.date}>
                    {option.partial ? `${formatBanlistDate(option.date)} · ${t('catalog.banlists.partial')}` : formatBanlistDate(option.date)}
                  </option>
                ))}
              </select>
            </div>
            <IconButton tone="raised" size="lg" aria-label={t('catalog.banlists.newer')} title={t('catalog.banlists.newer')} disabled={index <= 0} onClick={() => pick(index - 1)}>
              <Icon name="chevron-right" />
            </IconButton>
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'changes', label: t('catalog.banlists.viewChanges') },
              { value: 'full', label: t('catalog.banlists.viewFull') },
            ]}
            label={t('catalog.banlists.viewLabel')}
            fullWidth
            className="min-[700px]:ml-auto min-[700px]:w-fit"
          />
        </div>

        {list.partial ? (
          <Callout tone="warning" icon="calendar" title={t('catalog.banlists.partialTitle')}>
            {t('catalog.banlists.partialNote', { region: list.region.toUpperCase(), date: formatBanlistDate(list.date) })}
          </Callout>
        ) : null}

        <p className="m-0 text-body text-muted" aria-live="polite">
          {summary(view, list, previous, total)}
        </p>

        <SearchField label={t('catalog.banlists.searchLabel')} placeholder={t('catalog.banlists.searchLabel')} value={query} onChange={setQuery} className="min-[700px]:max-w-80" />

        {visible.length === 0 ? (
          <EmptyState icon="ban" title={query.trim() ? t('catalog.banlists.noMatch', { query: query.trim() }) : t('catalog.banlists.noChanges')} />
        ) : (
          visible.map(({ status, entries }) => (
            <section key={status} aria-label={t(TITLE_KEY[status])} className="grid gap-3">
              <div className="flex items-center gap-2 border-b border-border-subtle pb-2">
                <Badge tone={STATUS_TONE[status]} dot>
                  {t(TITLE_KEY[status])}
                </Badge>
                <Badge size="sm">{formatInteger(entries.length)}</Badge>
              </div>
              <ul className="m-0 grid list-none grid-cols-4 gap-x-2 gap-y-3 p-0 min-[560px]:grid-cols-5 min-[820px]:grid-cols-6 min-[1101px]:grid-cols-8 min-[1300px]:grid-cols-10">
                {entries.map((entry) => (
                  <BanlistTile key={entry.cardId} entry={entry} status={status} onOpen={open} />
                ))}
              </ul>
            </section>
          ))
        )}
      </Card>

      <BanlistCardModal cardId={opened?.cardId ?? null} list={list} status={opened ? t(STATUS_KEY[opened.status]) : ''} onClose={() => setOpened(null)} />
    </StepPage>
  )
}

/** Una carta de una sección. Con `memo`, abrir una carta o escribir en el buscador sólo dibuja las que se suman o cambian (la lista completa trae más de 200). */
const BanlistTile = memo(function BanlistTile({ entry, status, onOpen }: { entry: Entry; status: BanlistStatus; onOpen: (cardId: number, status: BanlistStatus) => void }) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        aria-label={t('catalog.banlists.openCard', { name: banlistCardName(entry.cardId) })}
        className="group grid w-full content-start gap-1.5 rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus"
        onClick={() => onOpen(entry.cardId, status)}
      >
        <span className="relative block">
          <TiltCard className="aspect-[421/614] rounded-tag bg-input shadow-card">
            <CardArt remoteUrl={cardSmallImageUrl(entry.cardId)} name="" className="block h-full w-full object-cover" />
          </TiltCard>
          {entry.from ? (
            <>
              <span aria-hidden="true" className="pointer-events-none absolute bottom-0.5 left-0.5 inline-flex h-4 items-center rounded-tag bg-black/85 px-1.5 text-micro font-bold tabular-nums text-white">
                {t('catalog.banlists.wasCopies', { count: COPIES[entry.from] })}
              </span>
              <span className="sr-only">{t('catalog.banlists.was', { status: t(STATUS_KEY[entry.from]) })}</span>
            </>
          ) : null}
        </span>
        <span className="line-clamp-2 text-micro font-semibold text-foreground [overflow-wrap:anywhere]">{banlistCardName(entry.cardId)}</span>
      </button>
    </li>
  )
})

/** La línea de debajo del título: contra qué lista se compara y cuántas cartas hay. */
function summary(view: View, list: Banlist, previous: Banlist | null, total: number): string {
  if (view === 'full') {
    return t('catalog.banlists.fullSummary', { count: total, n: formatInteger(total) })
  }

  return previous
    ? t('catalog.banlists.changesSummary', { count: total, n: formatInteger(total), date: formatBanlistDate(previous.date) })
    : t('catalog.banlists.firstSummary', { count: total, n: formatInteger(total), region: list.region.toUpperCase() })
}
