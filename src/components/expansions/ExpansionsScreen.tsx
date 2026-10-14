import { useEffect, useMemo, useRef, useState } from 'react'

import { compareRarities, readExpansionsHash, type Expansion, type ExpansionCard } from '../../app/card-prices'
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
 * El hash puede traer una impresión (`#expansions?set=…&print=…`, a donde lleva tocar una impresión en los precios de una carta): abre esa expansión y
 * deja esa carta iluminada y a la vista.
 */
export function ExpansionsScreen() {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const list = useExpansions()
  const [pickedId, setPickedId] = useState<number | null>(null)
  const [link, setLink] = useState(() => readExpansionsHash(window.location.hash))
  const expansions = list.status === 'ready' ? list.expansions : []
  // Lo que pide el hash manda; si no, en escritorio arranca en la más nueva (que ya tenga cartas) y en el celular se elige primero, desde la lista.
  const activeId = link.expansion ?? pickedId ?? (isDesktop ? (expansions.find((expansion) => expansion.count > 0)?.id ?? null) : null)
  const active = expansions.find((expansion) => expansion.id === activeId) ?? null
  const showList = isDesktop || active === null

  useEffect(() => {
    const handleHashChange = () => setLink(readExpansionsHash(window.location.hash))

    window.addEventListener('hashchange', handleHashChange)

    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Elegir otra expansión (o volver a la lista) suelta la impresión iluminada y limpia el hash, para que recargar no la vuelva a pedir.
  const pick = (id: number | null) => {
    setPickedId(id)
    setLink({ expansion: null, print: null })

    if (readExpansionsHash(window.location.hash).expansion !== null) {
      window.history.replaceState(null, '', '#expansions')
    }
  }

  return (
    // En escritorio la pantalla mide lo que el recuadro del armazón (sin pie): la lista y las cartas son dos columnas del mismo alto, y cada una scrollea por adentro.
    <StepPage as="article" wide className="min-[1101px]:h-full min-[1101px]:grid-rows-[auto_minmax(0,1fr)]">
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
        <div className="grid items-start gap-4 min-[1101px]:min-h-0 min-[1101px]:grid-cols-[minmax(19rem,24rem)_minmax(0,1fr)] min-[1101px]:items-stretch min-[1101px]:gap-5">
          {showList ? <ExpansionList expansions={expansions} activeId={activeId} onPick={pick} /> : null}
          {active ? <ExpansionDetail
              key={active.id}
              expansion={active}
              updated={list.status === 'ready' ? list.updated : ''}
              highlight={link.expansion === active.id ? link.print : null}
              onBack={isDesktop ? null : () => pick(null)}
            /> : null}
        </div>
      )}
    </StepPage>
  )
}

/** Las expansiones agrupadas por año de salida (las más nuevas primero), con un buscador por nombre. */
function ExpansionList({ expansions, activeId, onPick }: { expansions: Expansion[]; activeId: number | null; onPick: (id: number) => void }) {
  const [query, setQuery] = useState('')
  const activeRef = useRef<HTMLButtonElement>(null)

  // Si se llega a una expansión desde afuera (los precios de una carta), la lista se mueve hasta ella.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

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
    <section className={cx(surface.card, 'grid min-w-0 content-start gap-3 p-3 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_minmax(0,1fr)]')}>
      <SearchField label={t('catalog.sets.searchLabel')} placeholder={t('catalog.sets.searchLabel')} value={query} onChange={setQuery} />
      <nav aria-label={t('catalog.sets.listLabel')} className="grid max-h-[70dvh] content-start gap-3 overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] min-[1101px]:max-h-none min-[1101px]:min-h-0">
        {groups.map(([year, items]) => (
          <section key={year} className="grid gap-0.5">
            <h3 className={cx(overline, 'px-1')}>{year || t('catalog.sets.noDate')}</h3>
            {items.map((expansion) => (
              <button
                key={expansion.id}
                type="button"
                ref={expansion.id === activeId ? activeRef : undefined}
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

/** De cada valor (que no esté vacío) a cuántas cartas lo tienen, en el orden en que aparecen. */
function countBy(cards: readonly ExpansionCard[], key: (card: ExpansionCard) => string): Array<[string, number]> {
  const counts = new Map<string, number>()

  for (const card of cards) {
    const value = key(card)

    if (value) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }

  return [...counts]
}

/** Un chip de filtro: su nombre y cuántas impresiones tiene. */
interface FilterChip {
  key: string
  name: string
  count: number
  active: boolean
  onToggle: () => void
}

/** La fila de chips para filtrar: "Todas" (que apaga los filtros) y después un chip por cada rareza y por cada arte distinto, cada uno con su cuenta. */
function FilterChips({ label, all, allActive, onAll, chips }: { label: string; all: string; allActive: boolean; onAll: () => void; chips: FilterChip[] }) {
  const chipClass = cx(choiceChip, 'h-7 gap-1.5 px-2.5 text-micro')

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={allActive} className={chipClass} onClick={onAll}>
        {all}
      </button>
      {chips.map((chip) => (
        <button key={chip.key} type="button" aria-pressed={chip.active} aria-label={`${chip.name} ${chip.count}`} className={chipClass} onClick={chip.onToggle}>
          {chip.name}
          <span className="text-soft tabular-nums">{formatInteger(chip.count)}</span>
        </button>
      ))}
    </div>
  )
}

/** Una expansión: su encabezado y sus impresiones (con filtros por nombre o código, por rareza y por arte, y orden por código o precio). */
function ExpansionDetail({ expansion, updated, highlight, onBack }: { expansion: Expansion; updated: string; highlight: number | null; onBack: (() => void) | null }) {
  const state = useExpansionCards(expansion.id)
  const [query, setQuery] = useState('')
  const [rarity, setRarity] = useState<string | null>(null)
  const [variant, setVariant] = useState<string | null>(null)
  const [sort, setSort] = useState<Sort>('code')
  const [shown, setShown] = useState(PAGE_SIZE)
  const [opened, setOpened] = useState<ExpansionCard | null>(null)
  const highlightedRef = useRef<HTMLLIElement>(null)
  const cards = state.status === 'ready' ? state.cards : NO_CARDS

  // Las rarezas (de la más común a la más rara) y los artes distintos (Extended Art, Alternate Art...) que tiene esta expansión, cada uno con cuántas impresiones.
  const rarities = useMemo(() => countBy(cards, (card) => card.rarity).sort(([a], [b]) => compareRarities(a, b)), [cards])
  const variants = useMemo(() => countBy(cards, (card) => card.variant).sort(([a], [b]) => a.localeCompare(b)), [cards])
  // Una sola fila: las rarezas (si hay más de una) y a continuación los artes distintos. Una rareza y un arte se combinan; tocar el que está encendido lo apaga.
  const chips: FilterChip[] = [
    ...(rarities.length > 1 ? rarities : []).map(([name, count]) => ({ key: `rarity:${name}`, name, count, active: rarity === name, onToggle: () => pick(setRarity, rarity, name) })),
    ...variants.map(([name, count]) => ({ key: `variant:${name}`, name, count, active: variant === name, onToggle: () => pick(setVariant, variant, name) })),
  ]
  const rows = useMemo(() => {
    const words = query.split(/\s+/).map(normalize).filter(Boolean)
    const matching = cards.filter((card) => (rarity === null || card.rarity === rarity) && (variant === null || card.variant === variant) && words.every((word) => `${normalize(card.name)}|${normalize(card.code)}|${normalize(card.variant)}`.includes(word)))

    // El orden de los archivos ya es por código; por precio, de más a menos caro y las que no tienen precio al final.
    return sort === 'price' ? [...matching].sort((a, b) => (b.market ?? -1) - (a.market ?? -1)) : matching
  }, [cards, query, rarity, variant, sort])
  const distinct = useMemo(() => new Set(cards.map((card) => card.cardId)).size, [cards])
  const usd = new Intl.NumberFormat(currencyLocale(), { style: 'currency', currency: 'USD' })
  const filtersChanged = () => setShown(PAGE_SIZE)
  // La impresión iluminada tiene que estar entre las que se ven (hay expansiones con más de 800) y a la vista, en el medio del recuadro.
  const highlightedAt = highlight === null ? -1 : rows.findIndex((card) => card.productId === highlight)
  const visibleCount = Math.max(shown, highlightedAt + 1)

  useEffect(() => {
    if (state.status === 'ready') {
      highlightedRef.current?.scrollIntoView?.({ block: 'center' })
    }
  }, [state.status, highlight])

  const pick = (set: (value: string | null) => void, current: string | null, value: string) => {
    set(current === value ? null : value)
    filtersChanged()
  }

  return (
    <section className={cx(surface.card, 'grid min-w-0 content-start gap-3 overflow-hidden min-[1101px]:h-full min-[1101px]:overflow-y-auto min-[1101px]:overscroll-contain min-[1101px]:[scrollbar-width:thin]')}>
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

            {chips.length > 0 ? (
              <FilterChips
                label={t('catalog.sets.filterLabel')}
                all={t('catalog.sets.rarityAll')}
                allActive={rarity === null && variant === null}
                onAll={() => {
                  setRarity(null)
                  setVariant(null)
                  filtersChanged()
                }}
                chips={chips}
              />
            ) : null}

            {rows.length === 0 ? (
              <EmptyState icon="search" title={t('catalog.sets.noMatch')} />
            ) : (
              // Las cartas enteras una al lado de la otra, cada una con su código, rareza, edición y precio abajo.
              <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-3 gap-y-5 p-0">
                {rows.slice(0, visibleCount).map((card) => (
                  <li
                    key={`${card.code}-${card.cardId}-${card.rarity}-${card.edition}-${card.url}`}
                    ref={card.productId === highlight ? highlightedRef : undefined}
                    className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-2"
                  >
                    <button
                      type="button"
                      aria-label={t('catalog.sets.openCard', { name: card.name })}
                      data-highlight={card.productId === highlight ? 'true' : undefined}
                      // La carta que se pidió desde los precios: con el borde y el brillo verdes de "elegida" (como la miniatura del selector de artes).
                      className="group block rounded-tag text-left focus-visible:outline-none focus-visible:shadow-focus data-[highlight=true]:shadow-[0_0_0_2px_rgb(var(--success-rgb)),0_0_28px_rgb(var(--success-rgb)/0.6)]"
                      onClick={() => setOpened(card)}
                    >
                      <TiltCard className="aspect-[421/614] rounded-tag bg-input shadow-card">
                        <PrintingArt productId={card.productId} cardId={card.cardId} className="h-full w-full object-cover" />
                      </TiltCard>
                    </button>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-0.5">
                      <span className="line-clamp-2 text-micro font-semibold leading-snug text-foreground [overflow-wrap:anywhere]">{card.name}</span>
                      <span className="text-micro text-muted">{card.code}</span>
                      <span className="text-micro text-muted [overflow-wrap:anywhere]">
                        {card.rarity} · {card.edition}
                      </span>
                      {card.variant ? (
                        <Badge size="sm" tone="info" shape="tag" wrap className="justify-self-start">
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

            {rows.length > visibleCount ? (
              <Button variant="secondary" fullWidth onClick={() => setShown(visibleCount + PAGE_SIZE)}>
                {t('catalog.sets.showMore', { n: formatInteger(Math.min(PAGE_SIZE, rows.length - visibleCount)) })}
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

