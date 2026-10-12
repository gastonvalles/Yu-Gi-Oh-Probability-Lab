import { useState, type FormEvent } from 'react'

import { normalizeSearchText } from '../../app/utils'
import type { MatPile } from '../../app/practice-mat'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field } from '../ui/surfaces'
import { CARD_BACK } from './practice-styles'

export const PILE_TITLES: Record<MatPile, string> = { deck: 'Deck', extra: 'Extra Deck', hand: 'Mano', gy: 'Cementerio', banished: 'Destierro' }

interface MatCardInfo {
  name: string
  art: string | null
}

export interface SheetItem {
  label: string
  onSelect: () => void
}

interface ActionSheetProps {
  isOpen: boolean
  kicker: string
  title: string
  items: SheetItem[]
  /** "Ver carta": abre el detalle (se muestra al final, aparte de las jugadas). */
  onInspect?: () => void
  onClose: () => void
}

/** Menú al tocar una carta o el deck: una acción por botón, la primera con el foco. */
export function ActionSheet({ isOpen, kicker, title, items, onInspect, onClose }: ActionSheetProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker={kicker} title={title} ariaLabel={title}>
      <div className="grid gap-2" role="group" aria-label="Jugadas">
        {items.map((item, index) => (
          <Button key={item.label} variant="secondary" size="sm" fullWidth data-initial-focus={index === 0 ? '' : undefined} onClick={item.onSelect}>
            {item.label}
          </Button>
        ))}
        {items.length === 0 ? <p className="m-0 text-body text-muted">No hay nada para hacer con esta carta desde acá.</p> : null}
        {onInspect ? (
          <Button variant="tertiary" size="sm" fullWidth icon="search" onClick={onInspect}>
            Ver carta
          </Button>
        ) : null}
      </div>
    </Modal>
  )
}

interface PileViewerProps {
  pile: MatPile | null
  ids: string[]
  info: (id: string) => MatCardInfo
  onPick: (id: string, rect: DOMRect) => void
  onClose: () => void
}

/**
 * Las cartas de una pila. El deck se muestra ordenado por nombre (no revela el orden) y con buscador;
 * cementerio y destierro, la más reciente primero.
 */
export function PileViewer({ pile, ids, info, onPick, onClose }: PileViewerProps) {
  const [query, setQuery] = useState('')
  const cards = ids.map((id) => ({ id, ...info(id) }))
  const ordered = pile === 'deck' ? [...cards].sort((a, b) => a.name.localeCompare(b.name, 'es')) : pile === 'extra' ? cards : [...cards].reverse()
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  const visible = words.length === 0 ? ordered : ordered.filter((card) => words.every((word) => normalizeSearchText(card.name).includes(word)))
  const title = pile ? `${PILE_TITLES[pile]} · ${ids.length}` : ''

  return (
    <Modal isOpen={pile !== null} onClose={onClose} size="md" kicker="Mesa" title={title} ariaLabel={title}>
      <div className="grid gap-3">
        {ids.length > 8 ? (
          <label className="relative block">
            <span className="sr-only">Buscar carta</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
            <input
              type="search"
              value={query}
              placeholder="Buscar carta"
              autoComplete="off"
              className={cx(field, 'h-10 w-full pl-9 pr-3 text-body')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {ids.length === 0 ? <p className="m-0 text-body text-muted">No hay cartas acá.</p> : null}
        {visible.length === 0 && ids.length > 0 ? <p className="m-0 text-body text-muted">Ninguna carta coincide con “{query.trim()}”.</p> : null}
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2 p-0" aria-label="Cartas">
          {visible.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                className="grid w-full gap-1 rounded-tag bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus"
                onClick={(event) => onPick(card.id, event.currentTarget.getBoundingClientRect())}
              >
                <span className="relative block aspect-[421/614] w-full overflow-hidden rounded-tag bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)]">
                  <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
                </span>
                <span className="truncate text-micro text-foreground">{card.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  )
}

interface SaveComboDialogProps {
  isOpen: boolean
  defaultName: string
  onSave: (name: string) => void
  onClose: () => void
}

export function SaveComboDialog({ isOpen, defaultName, onSave, onClose }: SaveComboDialogProps) {
  const [name, setName] = useState(defaultName)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(name)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker="Mesa" title="Guardar combo" ariaLabel="Guardar combo">
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1">
          <span className="text-body text-muted">Nombre</span>
          <input
            type="text"
            value={name}
            maxLength={60}
            autoComplete="off"
            data-initial-focus=""
            className={cx(field, 'h-11 w-full px-3 text-body')}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <p className="m-0 text-micro text-soft">Se guardan la mano, el orden del deck y cada jugada, en este dispositivo.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" type="submit" icon="save">
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Dorso para el fantasma del tope del deck. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span className={cx('relative block aspect-[421/614] w-full', className)}>
      <span className={CARD_BACK} />
    </span>
  )
}
