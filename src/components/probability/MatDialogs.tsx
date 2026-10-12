import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { normalizeSearchText } from '../../app/utils'
import type { MatPile } from '../../app/practice-mat'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field, surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { CARD_BACK } from './practice-styles'

export const PILE_TITLES: Record<MatPile, string> = { deck: 'Deck', extra: 'Extra Deck', hand: 'Mano', gy: 'Cementerio', banished: 'Destierro' }

interface MatCardInfo {
  name: string
  art: string | null
}

export interface MenuItem {
  label: string
  onSelect: () => void
}

interface CardMenuProps {
  /** Dónde está la carta (o el deck) que se tocó: el menú sale pegado, arriba si hay lugar. */
  anchor: DOMRect | null
  kicker: string
  title: string
  items: MenuItem[]
  /** "Ver carta": abre el detalle (va al final, aparte de las jugadas). */
  onInspect?: () => void
  onClose: () => void
}

const MENU_ITEM =
  'block w-full border-0 bg-transparent px-3 py-1.5 text-left text-body font-medium text-foreground outline-none transition-colors duration-100 hover:bg-tint/12 focus-visible:bg-tint/12'

/**
 * Menú de jugadas pegado a la carta, como en DuelingBook: una línea por jugada, sin diálogo en el
 * medio. Se cierra al elegir, al tocar afuera o con Escape.
 */
export function CardMenu({ anchor, kicker, title, items, onInspect, onClose }: CardMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const open = anchor !== null

  useEscapeKey(onClose, open)
  useFocusTrap(ref, open)

  useLayoutEffect(() => {
    const menu = ref.current

    if (!anchor || !menu) {
      setPosition(null)
      return
    }

    const margin = 8
    const { width, height } = menu.getBoundingClientRect()
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), window.innerWidth - width - margin)
    const above = anchor.top - height - 6
    const top = above >= margin ? above : Math.min(anchor.bottom + 6, Math.max(margin, window.innerHeight - height - margin))

    setPosition({ left, top })
  }, [anchor, items.length])

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-210" onClick={onClose}>
      <div
        ref={ref}
        role="menu"
        aria-label={title}
        tabIndex={-1}
        className={cx(surface.panel, 'absolute max-h-[min(80dvh,34rem)] w-[13rem] overflow-y-auto py-1 outline-none animate-pop motion-reduce:animate-none', position ? 'visible' : 'invisible')}
        style={position ?? { left: 0, top: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-0.5 px-3 pb-1.5 pt-1.5">
          <p className={cx('m-0', overline)}>{kicker}</p>
          <p className="m-0 truncate text-body font-semibold text-foreground" title={title}>
            {title}
          </p>
        </div>
        {items.map((item, index) => (
          <button key={item.label} type="button" role="menuitem" className={MENU_ITEM} data-initial-focus={index === 0 ? '' : undefined} onClick={item.onSelect}>
            {item.label}
          </button>
        ))}
        {items.length === 0 ? <p className="m-0 px-3 py-1.5 text-micro text-muted">No hay nada para hacer desde acá.</p> : null}
        {onInspect ? (
          <button type="button" role="menuitem" className={cx(MENU_ITEM, 'mt-1 flex items-center gap-2 border-t border-border-subtle pt-2 text-muted')} data-initial-focus={items.length === 0 ? '' : undefined} onClick={onInspect}>
            <Icon name="search" size={14} />
            Ver carta
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
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
 * Las cartas de una pila. El deck y el Extra se muestran en su orden real (tope primero; al cerrar el
 * deck se baraja, como en la mesa real) y con buscador; cementerio y destierro, la más reciente primero.
 */
export function PileViewer({ pile, ids, info, onPick, onClose }: PileViewerProps) {
  const [query, setQuery] = useState('')
  const cards = ids.map((id) => ({ id, ...info(id) }))
  const ordered = pile === 'deck' || pile === 'extra' ? cards : [...cards].reverse()
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
              data-initial-focus=""
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
