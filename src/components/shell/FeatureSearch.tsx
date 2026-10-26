import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { t } from '../../i18n'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { buildFindEntries, filterFindEntries, type FindEntry } from './feature-search'
import { cardResult, FINDER_MIN_LENGTH, setCodePrefix, type FinderAction, type FinderResult } from './finder-sources'
import { useFinderDecks } from './finder-decks-loader'
import type { NavGroup } from './nav-model'
import { NAV_OVERLINE } from './rail'
import { useFinderData } from './use-finder-data'

interface FeatureSearchProps {
  isOpen: boolean
  onClose: () => void
  groups: NavGroup[]
  /** El destino en el que estás: aparece marcado («Estás acá»). */
  activeKey: string | null
  /** Hay buscador de cartas en esta pantalla: entre los resultados está «Buscar cartas». */
  cardsAvailable: boolean
  /** Ir al resultado: la misma clave que el menú (con lo escrito, para «Buscar cartas»). */
  onSelect: (key: string, detail?: string) => void
  /** Abrir el detalle de una carta encontrada. Sin esto, la carta lleva al buscador de cartas con su nombre escrito. */
  onOpenCard?: (card: ApiCardSearchResult) => void
}

/** Una fila de la lista: lo que se ve y qué hace al elegirla. */
interface FinderRow {
  id: string
  label: string
  hint: string
  group: string
  icon: FindEntry['icon']
  card?: ApiCardSearchResult
  /** La clave del destino del menú, si es una pantalla: la que dice «Estás acá». */
  featureKey?: string
  action: FinderAction
}

/** Cuántas pantallas o herramientas se listan a lo sumo al escribir (las cartas, decks y replays vienen después). */
const FEATURE_LIMIT = 6

const featureRow = (entry: FindEntry): FinderRow => ({ id: `feature:${entry.key}`, label: entry.label, hint: entry.hint, group: entry.group, icon: entry.icon, featureKey: entry.key, action: { type: 'select', key: entry.key } })

const resultRow = (result: FinderResult): FinderRow => ({ id: result.id, label: result.label, hint: result.hint, group: result.group, icon: result.icon, card: result.card, action: result.action })

/** Las filas de un grupo bajo su nombre (sin nada escrito) en el orden del menú. */
function groupEntries(entries: FindEntry[]): Array<{ group: string; entries: FindEntry[] }> {
  const groups: Array<{ group: string; entries: FindEntry[] }> = []

  for (const entry of entries) {
    const last = groups[groups.length - 1]

    if (last?.group === entry.group) last.entries.push(entry)
    else groups.push({ group: entry.group, entries: [entry] })
  }

  return groups
}

/**
 * El buscador de la app, un superbuscador: escribís lo que sea y lleva a eso. Una pantalla o herramienta («vidas», «pdf», «mirar un duelo»), una carta (por su nombre o su id; se abre su detalle),
 * una expansión (por nombre o por código: «LOB», «LOB-EN001» —la impresión con su rareza y precio—), un deck de torneo (por su nombre, el torneo, el puesto o quien lo jugó) o un replay (los jugadores,
 * el torneo). Al final, «Buscar … entre las cartas» abre el buscador de cartas con lo escrito. Sin nada escrito lista las pantallas como el menú, por grupos. Es un combobox: flechas para recorrer, Enter para
 * ir, Escape para cerrar. Lo abren la barra de arriba (escritorio), la lupa de la barra del celular y las teclas `/` y Ctrl/Cmd+K.
 */
export function FeatureSearch({ isOpen, onClose, groups, activeKey, cardsAvailable, onSelect, onOpenCard }: FeatureSearchProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const text = query.trim()
  const entries = useMemo(() => buildFindEntries(groups, { cards: cardsAvailable }), [groups, cardsAvailable])
  const features = useMemo(() => filterFindEntries(entries, query), [entries, query])
  const data = useFinderData(query, isOpen)
  const decks = useFinderDecks(isOpen)
  const listed = text === '' ? groupEntries(features) : null
  const rows = useMemo<FinderRow[]>(() => {
    if (text === '') {
      return features.map(featureRow)
    }

    const searchable = text.length >= FINDER_MIN_LENGTH
    // Un código («LOB-EN00») va primero a su expansión y sus impresiones; lo demás es, antes que nada, una carta (las expansiones con ese nombre vienen después).
    const codeLike = setCodePrefix(text) !== null
    const sets = data.sets.map(resultRow)

    return [
      ...features.slice(0, FEATURE_LIMIT).map(featureRow),
      ...(codeLike ? sets : []),
      ...data.cards.map((card) => resultRow(cardResult(card))),
      ...(codeLike ? [] : sets),
      ...(searchable && decks ? decks.findDeckResults(text).map(resultRow) : []),
      ...(searchable && decks ? decks.findReplayResults(text).map(resultRow) : []),
      ...(searchable && cardsAvailable ? [{ id: 'cards-search', label: t('shell.find.inCards', { query: text }), hint: t('shell.find.cardsHint'), group: t('shell.find.group.cards'), icon: 'search' as const, action: { type: 'select' as const, key: 'search', detail: text } }] : []),
    ]
  }, [text, features, data.sets, data.cards, cardsAvailable, decks])
  const current = rows[Math.min(highlight, rows.length - 1)]

  // Cada vez que se abre arranca limpio.
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setHighlight(0)
    }
  }, [isOpen])

  // La fila elegida con las flechas siempre queda a la vista.
  useEffect(() => {
    if (isOpen && current) document.getElementById(`${id}-${current.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [isOpen, current, id])

  // Cerrado no corta acá: el `Modal` no dibuja nada y, al cerrarse, sale con su animación (`usePresence`).
  const go = (row: FinderRow) => {
    const { action } = row

    if (action.type === 'select') {
      if (action.detail === undefined) onSelect(action.key)
      else onSelect(action.key, action.detail)
    } else if (action.type === 'card') {
      // Sin quien abra el detalle (la pantalla no lo tiene), la carta lleva al buscador de cartas con su nombre ya escrito.
      if (onOpenCard) onOpenCard(action.card)
      else onSelect('search', action.card.name)
    } else {
      window.location.hash = action.hash
    }

    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (rows.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => (index + 1) % rows.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => (index - 1 + rows.length) % rows.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setHighlight(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setHighlight(rows.length - 1)
    } else if (event.key === 'Enter' && current) {
      event.preventDefault()
      go(current)
    }
  }

  const row = (item: FinderRow, showGroup: boolean) => {
    const selected = item.id === current?.id
    const here = item.featureKey !== undefined && item.featureKey === activeKey
    const art = item.card?.imageUrlSmall ?? item.card?.imageUrl ?? null

    return (
      <li key={item.id} id={`${id}-${item.id}`} role="option" aria-selected={selected} className="min-w-0">
        <button
          type="button"
          tabIndex={-1}
          className={cx(
            'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-100 focus-visible:outline-none motion-reduce:transition-none',
            selected ? 'bg-nav-raised text-nav-active' : 'text-foreground',
          )}
          onMouseMove={() => setHighlight(rows.findIndex((candidate) => candidate.id === item.id))}
          onClick={() => go(item)}
        >
          {item.card ? (
            <span className="block h-11 w-8 shrink-0 overflow-hidden bg-input">
              {art ? <img src={cardImageSrc(art)} alt="" loading="lazy" decoding="async" draggable={false} className="block h-full w-full rounded-none! object-cover" /> : null}
            </span>
          ) : (
            <Icon name={item.icon} size={20} className="shrink-0" />
          )}
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-body font-semibold">{item.label}</span>
            {item.hint ? <span className="truncate text-micro font-normal text-muted">{item.hint}</span> : null}
          </span>
          {here ? <span className="shrink-0 rounded-full bg-nav-raised px-2.5 py-1 text-micro font-semibold text-white">{t('shell.sheet.here')}</span> : showGroup ? <span className="shrink-0 text-micro text-muted">{item.group}</span> : null}
        </button>
      </li>
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" bare flush ariaLabel={t('shell.find.title')}>
      <div className="flex min-h-0 flex-1 flex-col bg-nav">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-nav-raised px-4 pr-14">
          <Icon name="search" size={20} className="shrink-0 text-muted" />
          <input
            data-initial-focus="type"
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={current ? `${id}-${current.id}` : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-label={t('shell.find.title')}
            placeholder={t('shell.find.placeholderShort')}
            value={query}
            className="h-full min-w-0 flex-1 bg-transparent text-body text-foreground outline-none placeholder:text-muted"
            onChange={(event) => {
              setQuery(event.target.value)
              setHighlight(0)
            }}
            onKeyDown={onKeyDown}
          />
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {data.busy ? t('shell.find.searching') : t('shell.find.results', { count: rows.length })}
        </p>

        <ul id={`${id}-list`} role="listbox" aria-label={t('shell.find.title')} aria-busy={data.busy || undefined} className="m-0 grid min-h-0 flex-1 list-none content-start gap-0.5 overflow-y-auto p-2">
          {listed
            ? listed.map(({ group, entries: inGroup }) => (
                <li key={group} role="presentation" className="grid gap-0.5">
                  <span role="presentation" className={cx(NAV_OVERLINE, 'px-3 pb-1 pt-3')}>
                    {group}
                  </span>
                  <ul role="presentation" className="m-0 grid list-none gap-0.5 p-0">
                    {inGroup.map((entry) => row(featureRow(entry), false))}
                  </ul>
                </li>
              ))
            : rows.map((item) => row(item, true))}
        </ul>

        {data.busy ? (
          <p className="m-0 px-5 pb-4 text-micro text-muted" aria-hidden="true">
            {t('shell.find.searching')}
          </p>
        ) : null}

        {rows.length === 0 && !data.busy ? (
          <div className="grid gap-2 px-5 pb-6 text-body text-muted">
            <p className="m-0">{t('shell.find.empty', { query: text })}</p>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
