import { useState } from 'react'

import {
  BANLISTS_FETCHED_AT,
  banlistCardName,
  banlistsOf,
  diffBanlists,
  formatBanlistDate,
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
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { field } from '../ui/surfaces'
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
  const words = normalizeSearchText(query).split(' ').filter(Boolean)

  if (!list) {
    return null
  }

  const pick = (nextIndex: number) => setPicked({ region, date: lists[nextIndex]!.date })
  const matching = (entries: Entry[]) => entries.filter((entry) => words.every((word) => normalizeSearchText(banlistCardName(entry.cardId)).includes(word)))
  const sections: Array<{ status: BanlistStatus; entries: Entry[] }> =
    view === 'changes'
      ? STATUSES.map((status) => ({ status, entries: diffBanlists(previous, list)[status].map(({ cardId, from }) => ({ cardId, from })) }))
      : STATUSES.filter((status) => status !== 'unlimited').map((status) => ({ status, entries: listedCards(list)[status as Exclude<BanlistStatus, 'unlimited'>].map((cardId) => ({ cardId })) }))
  const visible = sections.map((section) => ({ ...section, entries: matching(section.entries) })).filter((section) => section.entries.length > 0)
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
        <div className="flex flex-wrap items-center gap-2">
          <IconButton tone="raised" size="md" aria-label={t('catalog.banlists.older')} title={t('catalog.banlists.older')} disabled={index >= lists.length - 1} onClick={() => pick(index + 1)}>
            <Icon name="chevron-left" />
          </IconButton>
          <select
            className={cx(field, 'h-10 min-w-0 flex-1 px-3 text-body min-[700px]:max-w-72')}
            value={list.date}
            aria-label={t('catalog.banlists.pickLabel')}
            onChange={(event) => setPicked({ region, date: event.target.value })}
          >
            {lists.map((option) => (
              <option key={option.date} value={option.date}>
                {formatBanlistDate(option.date)}
              </option>
            ))}
          </select>
          <IconButton tone="raised" size="md" aria-label={t('catalog.banlists.newer')} title={t('catalog.banlists.newer')} disabled={index <= 0} onClick={() => pick(index - 1)}>
            <Icon name="chevron-right" />
          </IconButton>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'changes', label: t('catalog.banlists.viewChanges') },
              { value: 'full', label: t('catalog.banlists.viewFull') },
            ]}
            label={t('catalog.banlists.viewLabel')}
            size="sm"
            className="max-[699px]:w-full min-[700px]:ml-auto"
          />
        </div>

        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="section" as="h2">
              {t('catalog.banlists.listTitle', { region: region.toUpperCase(), date: formatBanlistDate(list.date) })}
            </Heading>
            {index === 0 ? <Badge tone="success">{t('catalog.banlists.current')}</Badge> : null}
          </div>
          <p className="m-0 text-body text-muted">{summary(view, list, previous, total)}</p>
        </div>

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
                <span className="text-micro font-semibold text-soft tabular-nums">{formatInteger(entries.length)}</span>
              </div>
              <ul className="m-0 grid list-none grid-cols-3 gap-x-2.5 gap-y-3 p-0 min-[560px]:grid-cols-4 min-[820px]:grid-cols-5 min-[1101px]:grid-cols-6 min-[1300px]:grid-cols-8">
                {entries.map((entry) => (
                  <li key={entry.cardId} className="min-w-0">
                    <button
                      type="button"
                      aria-label={t('catalog.banlists.openCard', { name: banlistCardName(entry.cardId) })}
                      className="group grid w-full content-start gap-1.5 rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => setOpened({ cardId: entry.cardId, status })}
                    >
                      <TiltCard className="aspect-[421/614] rounded-tag bg-input shadow-card">
                        <CardArt remoteUrl={cardSmallImageUrl(entry.cardId)} name="" className="block h-full w-full object-cover" />
                      </TiltCard>
                      <span className="line-clamp-2 text-micro font-semibold text-foreground [overflow-wrap:anywhere]">{banlistCardName(entry.cardId)}</span>
                      {entry.from ? <span className="text-micro text-muted">{t('catalog.banlists.was', { status: t(STATUS_KEY[entry.from]) })}</span> : null}
                    </button>
                  </li>
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

/** La línea de debajo del título: contra qué lista se compara y cuántas cartas hay. */
function summary(view: View, list: Banlist, previous: Banlist | null, total: number): string {
  if (view === 'full') {
    return t('catalog.banlists.fullSummary', { count: total, n: formatInteger(total) })
  }

  return previous
    ? t('catalog.banlists.changesSummary', { count: total, n: formatInteger(total), date: formatBanlistDate(previous.date) })
    : t('catalog.banlists.firstSummary', { count: total, n: formatInteger(total), region: list.region.toUpperCase() })
}
