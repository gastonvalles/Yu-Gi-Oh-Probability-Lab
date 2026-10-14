import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { normalizeSearchText } from '../../app/utils'
import { PHASES, type MatPhase, type MatPile } from '../../app/practice-mat'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field, surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { FX_CARD, TargetMark, fxVars } from './MatFx'
import { CARD_BACK } from './practice-styles'

/** Nombres de las casillas, los mismos que usa el builder (Main / Extra) y los del juego en inglés para las pilas. El texto se arma al leerlo, en el idioma de ese momento. */
export const PILE_TITLES: Record<MatPile, string> = {
  get deck() { return t('practice.pile.deck') },
  get extra() { return t('practice.pile.extra') },
  get hand() { return t('practice.pile.hand') },
  get gy() { return t('practice.pile.gy') },
  get banished() { return t('practice.pile.banished') },
}

interface MatCardInfo {
  name: string
  art: string | null
  /** Desterrada boca abajo: se muestra de dorso. */
  faceDown?: boolean
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
 * En el celular, el click que el navegador sintetiza al soltar el dedo llega DESPUÉS del `pointerup` que
 * abrió el menú y cae sobre el fondo recién montado: durante este lapso el fondo no cierra el menú.
 */
const GHOST_CLICK_MS = 350

/**
 * Menú de jugadas pegado a la carta, como en DuelingBook: una línea por jugada, sin diálogo en el
 * medio. Se cierra al elegir, al tocar afuera o con Escape.
 */
export function CardMenu({ anchor, kicker, title, items, onInspect, onClose }: CardMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const openedAtRef = useRef(0)
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

    openedAtRef.current = performance.now()

    const margin = 8
    // Medidas de layout, no del rect: la animación de entrada arranca en escala 0.7 y el rect daba un menú más chico del real (se salía de la pantalla).
    const { offsetWidth: width, offsetHeight: height } = menu
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), Math.max(margin, window.innerWidth - width - margin))
    const above = anchor.top - height - 6
    const top = above >= margin ? above : Math.min(anchor.bottom + 6, Math.max(margin, window.innerHeight - height - margin))

    setPosition({ left, top })
  }, [anchor, items.length])

  if (!open || typeof document === 'undefined') {
    return null
  }

  const closeFromBackdrop = () => {
    if (performance.now() - openedAtRef.current >= GHOST_CLICK_MS) {
      onClose()
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-210" onClick={closeFromBackdrop}>
      <div
        ref={ref}
        role="menu"
        aria-label={title}
        tabIndex={-1}
        className={cx(surface.panel, 'absolute max-h-[min(calc(100dvh-1rem),34rem)] w-[13rem] overflow-y-auto py-1 outline-none animate-pop motion-reduce:animate-none', position ? 'visible' : 'invisible')}
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
        {items.length === 0 ? <p className="m-0 px-3 py-1.5 text-micro text-muted">{t('practice.dialog.empty')}</p> : null}
        {onInspect ? (
          <button type="button" role="menuitem" className={cx(MENU_ITEM, 'mt-1 flex items-center gap-2 border-t border-border-subtle pt-2 text-muted')} data-initial-focus={items.length === 0 ? '' : undefined} onClick={onInspect}>
            <Icon name="search" size={14} />
            {t('practice.dialog.viewCard')}
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
  /** Cartas marcadas como objetivo: llevan la mira (como en la mano y en el campo). */
  targeted: ReadonlySet<string>
  onPick: (id: string, rect: DOMRect) => void
  onClose: () => void
}

/**
 * Las cartas de una pila. El deck y el Extra se muestran en su orden real (tope primero; al cerrar el
 * deck se baraja, como en la mesa real) y con buscador; cementerio y destierro, la más reciente primero.
 */
export function PileViewer({ pile, ids, info, targeted, onPick, onClose }: PileViewerProps) {
  const [query, setQuery] = useState('')
  const cards = ids.map((id) => ({ id, ...info(id) }))
  const ordered = pile === 'deck' || pile === 'extra' ? cards : [...cards].reverse()
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  const visible = words.length === 0 ? ordered : ordered.filter((card) => words.every((word) => normalizeSearchText(card.name).includes(word)))
  const title = pile ? `${PILE_TITLES[pile]} · ${ids.length}` : ''

  return (
    <Modal isOpen={pile !== null} onClose={onClose} size="md" kicker={t('practice.mat.name')} title={title} ariaLabel={title}>
      <div className="grid gap-3">
        {ids.length > 8 ? (
          <label className="relative block">
            <span className="sr-only">{t('practice.dialog.searchCard')}</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
            <input
              type="search"
              value={query}
              placeholder={t('practice.dialog.searchCard')}
              autoComplete="off"
              data-initial-focus=""
              className={cx(field, 'h-10 w-full pl-9 pr-3 text-body')}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
        {ids.length === 0 ? <p className="m-0 text-body text-muted">{t('practice.dialog.noCards')}</p> : null}
        {visible.length === 0 && ids.length > 0 ? <p className="m-0 text-body text-muted">{t('practice.dialog.noMatch', { query: query.trim() })}</p> : null}
        {/* En el celular, cinco por fila (como el campo); en pantallas anchas, las que entren de 5.25 rem. */}
        <ul className="m-0 grid list-none grid-cols-5 gap-1.5 p-0 sm:grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] sm:gap-2" aria-label={t('practice.dialog.cards')}>
          {visible.map((card) => {
            // Boca abajo y objetivo a la vez: el nombre accesible dice las dos cosas (la mira se suma al "boca abajo", no lo pisa).
            const label = card.faceDown ? t('practice.dialog.cardFaceDown', { name: card.name }) : card.name

            return (
              <li key={card.id}>
                <button
                  type="button"
                  aria-label={targeted.has(card.id) ? t('practice.card.targeted', { name: label }) : undefined}
                  className="grid w-full gap-1 rounded-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={(event) => onPick(card.id, event.currentTarget.getBoundingClientRect())}
                >
                  <span
                    data-targeted={targeted.has(card.id) ? 'true' : 'false'}
                    className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)] [--card-shadow:0_4px_10px_rgba(0,0,0,0.4)]', FX_CARD)}
                    style={fxVars('red')}
                  >
                    {card.faceDown ? <span className={CARD_BACK} /> : <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
                    {targeted.has(card.id) ? <TargetMark /> : null}
                  </span>
                  <span className="truncate text-micro text-foreground">{label}</span>
                </button>
              </li>
            )
          })}
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
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker={t('practice.mat.name')} title={t('practice.mat.saveCombo')} ariaLabel={t('practice.mat.saveCombo')}>
      <form className="grid gap-3" onSubmit={submit}>
        <label className="grid gap-1">
          <span className="text-body text-muted">{t('practice.dialog.name')}</span>
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
        <p className="m-0 text-micro text-soft">{t('practice.dialog.saveNote')}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="sm" type="submit" icon="save">
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface PhaseDialogProps {
  isOpen: boolean
  current: MatPhase
  onPick: (phase: MatPhase) => void
  onClose: () => void
}

/** Cambiar de fase como en Master Duel: las seis en una fila de botones redondos (la actual encendida en verde) y "Cancelar" abajo. */
export function PhaseDialog({ isOpen, current, onPick, onClose }: PhaseDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker={t('practice.mat.name')} title={t('practice.phase.title')} ariaLabel={t('practice.phase.title')}>
      <div className="grid gap-5">
        <div role="group" aria-label={t('practice.mat.phases')} className="grid grid-cols-3 gap-x-3 gap-y-4 min-[30rem]:grid-cols-6">
          {PHASES.map((phase) => {
            const active = phase.id === current

            return (
              <button
                key={phase.id}
                type="button"
                aria-label={phase.name}
                aria-pressed={active}
                data-initial-focus={active ? '' : undefined}
                className="group grid justify-items-center gap-1.5 border-0 bg-transparent p-0 text-center outline-none"
                onClick={() => onPick(phase.id)}
              >
                <span
                  className={cx(
                    'grid size-14 place-items-center rounded-full border-2 text-body font-extrabold leading-none transition-[background-color,color,box-shadow] duration-150 group-focus-visible:shadow-focus',
                    active
                      ? 'border-accent bg-accent text-[#06140e] shadow-[0_0_16px_rgb(var(--accent-rgb)/0.6)]'
                      : 'border-tint/25 text-soft group-hover:bg-tint/10 group-hover:text-foreground',
                  )}
                >
                  {phase.short}
                </span>
                <span className={cx('text-micro font-semibold leading-tight text-balance', active ? 'text-foreground' : 'text-muted')}>{phase.name}</span>
              </button>
            )
          })}
        </div>
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
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
