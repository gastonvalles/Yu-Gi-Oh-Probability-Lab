import { useMemo, useState } from 'react'

import { type Expansion, type ExpansionCard } from '../../app/card-prices'
import { useExpansionCards, useExpansions } from '../../app/use-expansions'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import { currencyLocale, formatDay, t } from '../../i18n'
import { StepHero } from '../StepHero'
import { PrintingArt } from '../card-detail/PrintingArt'
import { TiltCard } from '../card-detail/TiltCard'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { Segmented } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'
import { StepPage } from '../ui/StepPage'
import { choiceChip, listItem, surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { ExpansionCardModal } from './ExpansionCardModal'
import { PackArt } from './PackArt'

/** Cuántas cartas se dibujan de entrada (hay expansiones con más de 800 impresiones): el resto, con "Mostrar más". */
const PAGE_SIZE = 60

type Sort = 'code' | 'price'

const NO_CARDS: ExpansionCard[] = []

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** "2026-10-09" → "09/10/2026" (en inglés, "Oct 9, 2026"). Sin fecha, "Sin fecha". */
function dayText(date: string): string {
  return date ? formatDay(new Date(`${date}T00:00:00Z`), 'UTC') : t('catalog.sets.noDate')
}

/**
 * Las expansiones del TCG con las cartas que trae cada una, ordenadas por código, con su rareza, edición y precio de mercado en TCGplayer. A la izquierda
 * (en celular, primero) la lista de expansiones, con buscador; tocar una abre sus cartas, con filtros por nombre o código y por rareza.
 */
export function ExpansionsScreen() {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const list = useExpansions()
  const [pickedId, setPickedId] = useState<number | null>(null)
  const expansions = list.status === 'ready' ? list.expansions : []
  // En escritorio arranca en la más nueva (que ya tenga cartas); en el celular se elige primero, desde la lista.
  const activeId = pickedId ?? (isDesktop ? (expansions.find((expansion) => expansion.count > 0)?.id ?? null) : null)
  const active = expansions.find((expansion) => expansion.id === activeId) ?? null
  const showList = isDesktop || active === null

  return (
    <StepPage as="article" wide>
      <StepHero
        title={t('catalog.sets.title')}
        icon="package"
        subtitle={t('catalog.sets.subtitle')}
        help={<p className="m-0">{t('catalog.sets.help')}</p>}
        side={list.status === 'ready' ? <Badge icon="refresh" title={t('catalog.sets.updatedTitle')}>{t('catalog.sets.updated', { date: dayText(list.updated) })}</Badge> : null}
      />

      {list.status === 'error' ? (
        <Callout tone="warning">{t('catalog.sets.loadError')}</Callout>
      ) : list.status === 'loading' ? (
        <div className="grid gap-2" aria-busy="true">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="grid items-start gap-4 min-[1101px]:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)] min-[1101px]:gap-5">
          {showList ? <ExpansionList expansions={expansions} activeId={activeId} onPick={setPickedId} /> : null}
          {active ? <ExpansionDetail key={active.id} expansion={active} updated={list.status === 'ready' ? list.updated : ''} onBack={isDesktop ? null : () => setPickedId(null)} /> : null}
        </div>
      )}
    </StepPage>
  )
}

/** Las expansiones agrupadas por año de salida (las más nuevas primero), con un buscador por nombre. */
function ExpansionList({ expansions, activeId, onPick }: { expansions: Expansion[]; activeId: number | null; onPick: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const words = query.split(/\s+/).map(normalize).filter(Boolean)
    const visible = expansions.filter((expansion) => expansion.count > 0 && words.every((word) => normalize(expansion.name).includes(word)))
    const byYear = new Map<string, Expansion[]>()

    for (const expansion of visible) {
      const year = expansion.date ? expansion.date.slice(0, 4) : ''

      byYear.set(year, [...(byYear.get(year) ?? []), expansion])
    }

    return [...byYear]
  }, [expansions, query])

  return (
    <section className={cx(surface.card, 'grid min-w-0 content-start gap-3 p-3 min-[1101px]:sticky min-[1101px]:top-4')}>
      <SearchField label={t('catalog.sets.searchLabel')} placeholder={t('catalog.sets.searchLabel')} value={query} onChange={setQuery} />
      <nav aria-label={t('catalog.sets.listLabel')} className="grid max-h-[70dvh] gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] min-[1101px]:max-h-[calc(100dvh-11rem)]">
        {groups.map(([year, items]) => (
          <section key={year} className="grid gap-0.5">
            <h3 className={cx(overline, 'px-1')}>{year || t('catalog.sets.noDate')}</h3>
            {items.map((expansion) => (
              <button
                key={expansion.id}
                type="button"
                aria-current={expansion.id === activeId ? 'true' : undefined}
                className={cx(listItem, 'grid w-full grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2.5 px-2.5 py-2 text-left aria-[current=true]:bg-primary/15')}
                onClick={() => onPick(expansion.id)}
              >
                <PackArt code={expansion.code} className="h-12 w-9 rounded-tag" />
                <span className="grid min-w-0 gap-0.5">
                  <span className="truncate text-body font-semibold text-foreground">{expansion.name}</span>
                  <span className="text-micro text-muted">{dayText(expansion.date)}</span>
                </span>
                <Badge size="sm">{formatInteger(expansion.count)}</Badge>
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 ? <p className="m-0 px-1 py-3 text-body text-muted">{t('catalog.sets.noExpansion', { query: query.trim() })}</p> : null}
      </nav>
    </section>
  )
}

/** Una expansión: su encabezado y sus impresiones (con filtros por nombre o código y por rareza, y orden por código o precio). */
function ExpansionDetail({ expansion, updated, onBack }: { expansion: Expansion; updated: string; onBack: (() => void) | null }) {
  const state = useExpansionCards(expansion.id)
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('code')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [opened, setOpened] = useState<ExpansionCard | null>(null)
  const cards = state.status === 'ready' ? state.cards : NO_CARDS

  const rarities = useMemo(() => [...new Set(cards.map((card) => card.rarity))].sort((a, b) => a.localeCompare(b)), [cards])
  const rows = useMemo(() => {
    const words = query.split(/\s+/).map(normalize).filter(Boolean)
    const matching = cards.filter((card) => (rarity === null || card.rarity === rarity) && words.every((word) => `${normalize(card.name)}|${normalize(card.code)}|${normalize(card.variant)}`.includes(word)))

    // El orden de los archivos ya es por código; por precio, de más a menos caro y las que no tienen precio al final.
    return sort === 'price' ? [...matching].sort((a, b) => (b.market ?? -1) - (a.market ?? -1)) : matching
  }, [cards, query, rarity, sort])
  const distinct = useMemo(() => new Set(cards.map((card) => card.cardId)).size, [cards])
  const usd = new Intl.NumberFormat(currencyLocale(), { style: 'currency', currency: 'USD' })
  const filtersChanged = () => setShown(PAGE_SIZE)

  return (
    <section className={cx(surface.card, 'grid min-w-0 content-start gap-3 overflow-hidden')}>
      <header className="px-4 pt-4 min-[1101px]:px-5 min-[1101px]:pt-5">
        <div className="grid min-w-0 content-center justify-items-start gap-2">
          {onBack ? (
            <Button variant="tertiary" size="sm" icon="chevron-left" onClick={onBack}>
              {t('catalog.sets.back')}
            </Button>
          ) : null}
          <Heading level="section" as="h2">
            {expansion.name}
          </Heading>
          <p className="m-0 text-body text-muted">
            {[dayText(expansion.date), t('catalog.sets.printings', { count: expansion.count, n: formatInteger(expansion.count) }), state.status === 'ready' ? t('catalog.sets.distinct', { count: distinct, n: formatInteger(distinct) }) : null].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <div className="grid gap-3 px-4 pb-4">
        {state.status === 'error' ? (
          <Callout tone="warning">{t('catalog.sets.cardsError')}</Callout>
        ) : state.status !== 'ready' ? (
          <div className="grid gap-2" aria-busy="true">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <>
            <div className="grid gap-2 min-[700px]:grid-cols-[minmax(0,1fr)_auto] min-[700px]:items-center">
              <SearchField
                label={t('catalog.sets.cardSearch')}
                placeholder={t('catalog.sets.cardSearch')}
                value={query}
                onChange={(value) => {
                  setQuery(value)
                  filtersChanged()
                }}
              />
              <Segmented
                value={sort}
                onChange={(value) => {
                  setSort(value)
                  filtersChanged()
                }}
                options={[
                  { value: 'code', label: t('catalog.sets.sortCode') },
                  { value: 'price', label: t('catalog.sets.sortPrice') },
                ]}
                label={t('catalog.sets.sortLabel')}
                size="sm"
              />
            </div>

            {rarities.length > 1 ? (
              <div role="group" aria-label={t('catalog.sets.rarityLabel')} className="flex flex-wrap gap-1.5">
                {[null, ...rarities].map((value) => (
                  <button
                    key={value ?? 'all'}
                    type="button"
                    aria-pressed={rarity === value}
                    className={cx(choiceChip, 'h-7 px-2.5 text-micro')}
                    onClick={() => {
                      setRarity(value)
                      filtersChanged()
                    }}
                  >
                    {value ?? t('catalog.sets.rarityAll')}
                  </button>
                ))}
              </div>
            ) : null}

            {rows.length === 0 ? (
              <EmptyState icon="search" title={t('catalog.sets.noMatch')} />
            ) : (
              // Las cartas enteras una al lado de la otra, cada una con su código, rareza, edición y precio abajo.
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-3 gap-y-5 p-0">
                {rows.slice(0, shown).map((card) => (
                  <li key={`${card.code}-${card.cardId}-${card.rarity}-${card.edition}-${card.url}`} className="grid min-w-0 content-start gap-2">
                    <button
                      type="button"
                      aria-label={t('catalog.sets.openCard', { name: card.name })}
                      className="group block rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => setOpened(card)}
                    >
                      <TiltCard className="aspect-[421/614] rounded-tag bg-input shadow-card">
                        <PrintingArt productId={card.productId} cardId={card.cardId} className="h-full w-full object-cover" />
                      </TiltCard>
                    </button>
                    <div className="grid min-w-0 gap-0.5">
                      <span className="line-clamp-2 text-micro font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{card.name}</span>
                      <span className="text-micro text-muted">{card.code}</span>
                      <span className="text-micro text-muted [overflow-wrap:anywhere]">
                        {card.rarity} · {card.edition}
                      </span>
                      {card.variant ? (
                        <Badge size="sm" tone="info" shape="tag" className="justify-self-start">
                          {card.variant}
                        </Badge>
                      ) : null}
                      <a
                        href={card.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('catalog.sets.openProduct', { name: card.name })}
                        className="mt-0.5 inline-flex items-center gap-1.5 justify-self-start text-body font-semibold tabular-nums text-foreground no-underline transition-colors hover:text-success focus-visible:outline-none focus-visible:shadow-focus"
                      >
                        {card.market === null ? t('search.prices.noPrice') : usd.format(card.market)}
                        <Icon name="link" size={13} className="text-soft" />
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {rows.length > shown ? (
              <Button variant="secondary" fullWidth onClick={() => setShown((current) => current + PAGE_SIZE)}>
                {t('catalog.sets.showMore', { n: formatInteger(Math.min(PAGE_SIZE, rows.length - shown)) })}
              </Button>
            ) : null}

            <p className="m-0 text-micro text-soft">{t('search.prices.footnote', { date: updated ? dayText(updated) : '' })}</p>
          </>
        )}
      </div>

      <ExpansionCardModal item={opened} onClose={() => setOpened(null)} />
    </section>
  )
}

