import { useId, useState } from 'react'

import { cardSmallImageUrl, type Expansion } from '../../app/card-prices'
import { DEFAULT_RIVAL_EXTRA, EXTRA_NEEDS, extraKindOf, MAX_COPIES, MAX_EXTRA, missingExtra, normalizeExtra, type ExtraPick, type HandtrapCard } from '../../app/handtraps'
import { useCardHits } from '../../app/use-card-hits'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { SearchField } from '../ui/SearchField'

const NO_EXPANSIONS: Expansion[] = []

interface RivalExtraDeckProps {
  /** El Extra Deck del rival, en orden de preferencia (una entrada por copia). */
  extra: readonly ExtraPick[]
  onChange: (extra: ExtraPick[]) => void
  /** Las handtraps elegidas: las que piden algo del Extra que no está se avisan (`missingExtra`). */
  picks: readonly HandtrapCard[]
  /** Con la hoja abierta: el buscador sólo busca entonces. */
  active?: boolean
}

/**
 * «Extra Deck del rival», en la hoja de las handtraps del duelo automático: la lista en orden de preferencia (el primero que cumpla es el que usa como costo, `handtrapPolicy`), con subir, bajar
 * y sacar (botones de 44 px, sin arrastre), el contador «N de 15», «Restablecer» al de siempre y un buscador que sólo ofrece monstruos del Extra (por su `frameType`), hasta 3 copias de cada uno.
 * Vacío, el rival juega sin Extra Deck; si una handtrap elegida pide algo que no está (Fydraulis Harmonia sin Sincros), lo dice.
 */
export function RivalExtraDeck({ extra, onChange, picks, active = true }: RivalExtraDeckProps) {
  const [query, setQuery] = useState('')
  const titleId = useId()
  const hits = useCardHits(active ? query : '', NO_EXPANSIONS)
  const found = hits.hits.flatMap((hit) => {
    const kind = extraKindOf(hit.frameType)

    return kind ? [{ id: hit.cardId, name: hit.name, kind }] : []
  })
  const full = extra.length >= MAX_EXTRA
  const copiesOf = (id: number) => extra.filter((card) => card.id === id).length
  const missing = missingExtra(picks, extra)
  const move = (from: number, to: number) => {
    const next = [...extra]
    const [card] = next.splice(from, 1)

    next.splice(to, 0, card!)
    onChange(next)
  }

  return (
    <section aria-labelledby={titleId} className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Heading level="card" as="h3" id={titleId}>
          {t('handtraps.extra.title')}
        </Heading>
        <span className={cx('text-micro', full ? 'text-foreground' : 'text-soft')}>{t('handtraps.extra.count', { count: extra.length, max: MAX_EXTRA })}</span>
      </div>
      <p className="m-0 text-micro text-soft">{t('handtraps.extra.hint')}</p>
      {missing.map((card) => (
        <p key={card.id} className="m-0 flex items-start gap-1.5 text-micro text-warning" role="status">
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          {t('handtraps.extra.needs', { name: card.name, kind: t(`handtraps.extra.kind.${EXTRA_NEEDS[card.id]!}`) })}
        </p>
      ))}

      {extra.length === 0 ? (
        <p className="m-0 text-body text-muted">{t('handtraps.extra.empty')}</p>
      ) : (
        <ol aria-label={t('handtraps.extra.list')} className="m-0 grid list-none gap-1 p-0">
          {extra.map((card, index) => (
            <li key={`${card.id}-${index}`} className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="w-5 shrink-0 text-right text-micro text-soft tabular-nums">
                {index + 1}
              </span>
              <span aria-hidden="true" className="aspect-[421/614] w-7 shrink-0 overflow-hidden rounded-none bg-input">
                <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} className="block h-full w-full object-cover" />
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-body text-foreground">{card.name}</span>
                <span className="text-micro text-soft">{t(`handtraps.extra.kind.${card.kind}`)}</span>
              </span>
              <IconButton size="lg" aria-label={t('handtraps.extra.up', { name: card.name })} disabled={index === 0} onClick={() => move(index, index - 1)}>
                <Icon name="chevron-up" />
              </IconButton>
              <IconButton size="lg" aria-label={t('handtraps.extra.down', { name: card.name })} disabled={index === extra.length - 1} onClick={() => move(index, index + 1)}>
                <Icon name="chevron-down" />
              </IconButton>
              <IconButton size="lg" aria-label={t('handtraps.extra.remove', { name: card.name })} onClick={() => onChange(extra.filter((_, at) => at !== index))}>
                <Icon name="x" />
              </IconButton>
            </li>
          ))}
        </ol>
      )}

      <div className="flex justify-end">
        <Button variant="tertiary" size="sm" onClick={() => onChange(DEFAULT_RIVAL_EXTRA.map((card) => ({ ...card })))}>
          {t('handtraps.extra.reset')}
        </Button>
      </div>

      <SearchField label={t('handtraps.extra.search')} value={query} onChange={setQuery} placeholder={t('handtraps.picker.searchPlaceholder')} />
      {full ? <p className="m-0 text-micro text-soft">{t('handtraps.extra.full', { max: MAX_EXTRA })}</p> : null}
      {hits.status === 'loading' ? (
        <p className="m-0 text-micro text-soft" role="status">
          {t('handtraps.picker.searching')}
        </p>
      ) : null}
      {hits.status === 'ready' && found.length === 0 ? <p className="m-0 text-micro text-soft">{t('handtraps.extra.noResults', { query: query.trim() })}</p> : null}
      {found.length > 0 ? (
        <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
          {found.map((card) => {
            const capped = copiesOf(card.id) >= MAX_COPIES

            return (
              <li key={card.id} className="min-w-0">
                <button
                  type="button"
                  disabled={full || capped}
                  aria-label={capped ? t('handtraps.extra.capped', { name: card.name, max: MAX_COPIES }) : t('handtraps.extra.add', { name: card.name })}
                  className="group flex min-h-11 w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors duration-150 hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent motion-reduce:transition-none"
                  onClick={() => onChange(normalizeExtra([...extra, card]))}
                >
                  <span className="aspect-[421/614] w-7 shrink-0 overflow-hidden rounded-none bg-input">
                    <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} className="block h-full w-full object-cover" />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-body text-foreground">{card.name}</span>
                    <span className="text-micro text-soft">{copiesOf(card.id) > 0 ? t('handtraps.extra.copies', { count: copiesOf(card.id) }) : t(`handtraps.extra.kind.${card.kind}`)}</span>
                  </span>
                  <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-background/85 text-foreground group-hover:text-info group-focus-visible:text-info">
                    <Icon name="plus" size={14} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
