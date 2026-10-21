import { useEffect, useState } from 'react'

import { META_DECKS, buildMetaReport, type MetaList } from '../../app/meta'
import { MAX_CARDS, countCards, type MakerCard, type MakerList } from '../../app/tierlist-maker'
import { useMetaRegion } from '../../app/use-meta-region'
import { t } from '../../i18n'
import { searchCards, type ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'

/** Cuánto se espera después de la última letra para buscar (la API no necesita una consulta por cada tecla). */
const DEBOUNCE_MS = 350
const MIN_QUERY = 2
const RESULTS = 24
/** Cuántas cartas trae «las del meta»: las más jugadas de esa tier list. */
const META_CARDS = 40

interface TierMakerAddCardsProps {
  list: MakerList
  onAdd: (cards: MakerCard[]) => void
}

const fromResult = (card: ApiCardSearchResult): MakerCard => ({ id: card.ygoprodeckId, name: card.name, image: card.imageUrlSmall ?? card.imageUrl ?? null })

type Status = 'idle' | 'loading' | 'done' | 'error'

/**
 * De dónde salen las cartas de la tier list: el buscador por nombre (de la base de YGOPRODeck, con los resultados a la vista para sumar varias) y dos atajos, con las de las tier lists del meta
 * (hand traps y boardbreakers, las más jugadas). Todo entra a «Sin clasificar».
 */
export function TierMakerAddCards({ list, onAdd }: TierMakerAddCardsProps) {
  const region = useMetaRegion('tcg')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ApiCardSearchResult[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const full = countCards(list) >= MAX_CARDS
  const trimmed = query.trim()

  useEffect(() => {
    if (trimmed.length < MIN_QUERY) {
      setStatus('idle')
      setResults([])

      return
    }

    let cancelled = false

    setStatus('loading')

    const timer = window.setTimeout(() => {
      searchCards({ query: trimmed }, RESULTS)
        .then((page) => {
          if (cancelled) return

          setResults(page.results)
          setStatus('done')
        })
        .catch(() => {
          if (!cancelled) setStatus('error')
        })
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [trimmed])

  const fromMeta = (kind: MetaList): MakerCard[] =>
    buildMetaReport(META_DECKS, region, 'both', 4, kind)
      .cards.slice(0, META_CARDS)
      .map((stat) => ({ id: stat.id, name: stat.name, image: stat.image }))

  return (
    <Card as="section" aria-label={t('meta.maker.searchTitle')} className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <Heading level="card" as="h2">
          {t('meta.maker.searchTitle')}
        </Heading>
        <span className="text-micro text-soft tabular-nums">{t('meta.maker.count', { count: countCards(list), max: MAX_CARDS })}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={full} onClick={() => onAdd(fromMeta('handtrap'))}>
          {t('meta.maker.fromHandtraps')}
        </Button>
        <Button variant="secondary" size="sm" disabled={full} onClick={() => onAdd(fromMeta('boardbreaker'))}>
          {t('meta.maker.fromBoardbreakers')}
        </Button>
      </div>

      <SearchField label={t('meta.maker.search')} value={query} onChange={setQuery} placeholder={t('meta.maker.searchPlaceholder')} className="max-w-md" />

      {full ? <p className="m-0 text-micro text-warning">{t('meta.maker.limit', { max: MAX_CARDS })}</p> : null}
      {status === 'loading' ? (
        <p className="m-0 text-micro text-soft" role="status">
          {t('meta.maker.searching')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p className="m-0 text-micro text-danger-soft" role="alert">
          {t('meta.maker.searchFailed')}
        </p>
      ) : null}
      {status === 'done' && results.length === 0 ? <p className="m-0 text-micro text-soft">{t('meta.maker.noResults', { query: trimmed })}</p> : null}

      {results.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-1.5 p-0 min-[1101px]:grid-cols-[repeat(auto-fill,minmax(5rem,1fr))]">
          {results.map((card) => {
            const inList = Boolean(list.cards[card.ygoprodeckId])

            return (
              <li key={card.ygoprodeckId} className="min-w-0">
                <button
                  type="button"
                  disabled={inList || full}
                  aria-label={inList ? t('meta.maker.inList', { name: card.name }) : t('meta.maker.addCard', { name: card.name })}
                  title={card.name}
                  className="group relative block aspect-[421/614] w-full cursor-pointer overflow-hidden rounded-none bg-input focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default"
                  onClick={() => onAdd([fromResult(card)])}
                >
                  <CardArt tilt remoteUrl={card.imageUrlSmall ?? card.imageUrl ?? null} name={card.name} className={cx('h-full w-full object-cover transition-opacity duration-150 motion-reduce:transition-none', inList && 'opacity-40')} />
                  <span aria-hidden="true" className={cx('absolute right-1 top-1 grid size-6 place-items-center rounded-full text-white', inList ? 'bg-success-solid' : 'bg-primary')}>
                    <Icon name={inList ? 'check' : 'plus'} size={14} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </Card>
  )
}
