import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'

import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { buildFindEntries, filterFindEntries, type FindEntry } from './feature-search'
import type { NavGroup } from './nav-model'
import { NAV_OVERLINE } from './rail'

interface FeatureSearchProps {
  isOpen: boolean
  onClose: () => void
  groups: NavGroup[]
  /** El destino en el que estás: aparece marcado («Estás acá»). */
  activeKey: string | null
  /** Hay buscador de cartas en esta pantalla: entre los resultados está «Buscar cartas». */
  cardsAvailable: boolean
  /** Ir al resultado: la misma clave que el menú. */
  onSelect: (key: string) => void
}

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
 * El buscador de la app: escribís lo que querés hacer («vidas», «pdf», «mirar un duelo», «banlist») y lleva a esa pantalla o abre esa herramienta; entre los resultados están también las cartas
 * (Buscar cartas) donde hay buscador. Sin nada escrito lista todo como el menú, por grupos. Es un combobox: flechas para recorrer, Enter para ir, Escape para cerrar. Lo abren la barra de arriba
 * (escritorio), la lupa de la barra del celular y las teclas `/` y Ctrl/Cmd+K.
 */
export function FeatureSearch({ isOpen, onClose, groups, activeKey, cardsAvailable, onSelect }: FeatureSearchProps) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const entries = useMemo(() => buildFindEntries(groups, { cards: cardsAvailable }), [groups, cardsAvailable])
  const results = useMemo(() => filterFindEntries(entries, query), [entries, query])
  const listed = query.trim() === '' ? groupEntries(results) : null
  const current = results[Math.min(highlight, results.length - 1)]

  // Cada vez que se abre arranca limpio.
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setHighlight(0)
    }
  }, [isOpen])

  // La fila elegida con las flechas siempre queda a la vista.
  useEffect(() => {
    if (isOpen && current) document.getElementById(`${id}-${current.key}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [isOpen, current, id])

  if (!isOpen) {
    return null
  }

  const go = (entry: FindEntry) => {
    onSelect(entry.key)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (results.length === 0) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setHighlight((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setHighlight((index) => (index - 1 + results.length) % results.length)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setHighlight(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setHighlight(results.length - 1)
    } else if (event.key === 'Enter' && current) {
      event.preventDefault()
      go(current)
    }
  }

  const row = (entry: FindEntry, showGroup: boolean) => {
    const selected = entry.key === current?.key
    const here = entry.key === activeKey

    return (
      <li key={entry.key} id={`${id}-${entry.key}`} role="option" aria-selected={selected} className="min-w-0">
        <button
          type="button"
          tabIndex={-1}
          className={cx(
            'flex min-h-12 w-full min-w-0 items-center gap-3 rounded-control px-3 py-2 text-left transition-colors duration-100 focus-visible:outline-none motion-reduce:transition-none',
            selected ? 'bg-nav-raised text-nav-active' : 'text-foreground',
          )}
          onMouseMove={() => setHighlight(results.findIndex((candidate) => candidate.key === entry.key))}
          onClick={() => go(entry)}
        >
          <Icon name={entry.icon} size={20} className="shrink-0" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-body font-semibold">{entry.label}</span>
            {entry.hint ? <span className="truncate text-micro font-normal text-muted">{entry.hint}</span> : null}
          </span>
          {here ? <span className="shrink-0 rounded-full bg-nav-raised px-2.5 py-1 text-micro font-semibold text-white">{t('shell.sheet.here')}</span> : showGroup ? <span className="shrink-0 text-micro text-muted">{entry.group}</span> : null}
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
            data-initial-focus=""
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={current ? `${id}-${current.key}` : undefined}
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
          {t('shell.find.results', { count: results.length })}
        </p>

        <ul id={`${id}-list`} role="listbox" aria-label={t('shell.find.title')} className="m-0 grid min-h-0 flex-1 list-none content-start gap-0.5 overflow-y-auto p-2">
          {listed
            ? listed.map(({ group, entries: inGroup }) => (
                <li key={group} role="presentation" className="grid gap-0.5">
                  <span role="presentation" className={cx(NAV_OVERLINE, 'px-3 pb-1 pt-3')}>
                    {group}
                  </span>
                  <ul role="presentation" className="m-0 grid list-none gap-0.5 p-0">
                    {inGroup.map((entry) => row(entry, false))}
                  </ul>
                </li>
              ))
            : results.map((entry) => row(entry, true))}
        </ul>

        {results.length === 0 ? (
          <div className="grid gap-2 px-5 pb-6 text-body text-muted">
            <p className="m-0">{t('shell.find.empty', { query: query.trim() })}</p>
            {cardsAvailable ? (
              <button type="button" className="w-fit cursor-pointer rounded-control border-0 bg-transparent p-0 text-body font-semibold text-nav-active underline-offset-2 hover:underline focus-visible:outline-none focus-visible:shadow-focus" onClick={() => go({ key: 'search', label: '', group: '', hint: '', icon: 'search', keywords: '' })}>
                {t('shell.find.tryCards')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
