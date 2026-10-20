import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { normalizeSearchText } from '../../app/utils'
import type { MatPile } from '../../app/practice-mat'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { CardEffectTraits } from '../card-detail/CardEffectTraits'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { field, surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { FX_CARD, TargetMark, fxVars } from './MatFx'
import { CARD_BACK } from './practice-styles'

/** Nombres de las casillas, los mismos que usa el builder (Main / Extra) y los del juego en inglés para las pilas. El texto se arma al leerlo, en el idioma de ese momento. */
/** El rótulo corto de cada pila sobre su casilla (la mesa es chica): Deck · Extra · Cem. · Dest. */
export const PILE_SHORT: Record<MatPile, string> = {
  get deck() { return t('practice.pile.short.deck') },
  get extra() { return t('practice.pile.short.extra') },
  get hand() { return t('practice.pile.short.hand') },
  get gy() { return t('practice.pile.short.gy') },
  get banished() { return t('practice.pile.short.banished') },
}

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
  /** Boca arriba en el Extra Deck (un Monstruo de Péndulo): se muestra primero y con su etiqueta. */
  faceUp?: boolean
}

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Una jugada de apoyo (revelar, target, descartar, desterrar, devolver al deck o al Extra): la hoja de la mano las pone aparte de las jugadas del juego, todas a la vista. */
  utility?: boolean
  /** La opción que ya está elegida (la fase de ahora): se marca, sin repetirla en otro lado. */
  current?: boolean
  /** Se ve pero no se puede elegir todavía (los contadores sin una carta en el campo); `hint` dice qué falta. */
  disabled?: boolean
  hint?: string
}

interface CardMenuProps {
  /** Dónde está la carta (o el deck) que se tocó: el menú sale pegado, arriba si hay lugar. */
  anchor: DOMRect | null
  kicker: string
  /** Sin título (vacío) el menú sólo lleva el sobretítulo: las fases no repiten el nombre de la de ahora. */
  title: string
  items: MenuItem[]
  /** "Ver carta": abre el detalle (va al final, aparte de las jugadas). */
  onInspect?: () => void
  /** El número de la carta en YGOPRODeck: con él, el menú dice sus rasgos confirmados (efecto rápido, una vez por turno, costo…). */
  ygoprodeckId?: number | null
  /** El menú no tapa la mesa: el fondo deja pasar los toques (se elige tocando una carta del campo, p. ej. a quién atacar) y no se lleva el foco. Se cierra con Escape, la jugada o al tocar otra carta. */
  passThrough?: boolean
  onClose: () => void
}

const MENU_ITEM =
  'block w-full border-0 bg-transparent px-3 py-1.5 text-left text-body font-medium text-foreground outline-none transition-colors duration-100 hover:bg-tint/12 focus-visible:bg-tint/12'

/**
 * En el celular, el click que el navegador sintetiza al soltar el dedo llega DESPUÉS del `pointerup` que
 * abrió el menú y cae sobre el fondo recién montado: durante este lapso el fondo no cierra el menú.
 */
export const GHOST_CLICK_MS = 350

/**
 * Menú de jugadas pegado a la carta, como en DuelingBook: una línea por jugada, sin diálogo en el
 * medio. Se cierra al elegir, al tocar afuera o con Escape.
 */
export function CardMenu({ anchor, kicker, title, items, onInspect, ygoprodeckId, passThrough = false, onClose }: CardMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const openedAtRef = useRef(0)
  // La carta a la que se acomodó el menú la última vez: si cambia sólo lo que dice (el segundo paso, "¿En ataque o en defensa?") y no la carta, se queda donde estaba.
  const placedForRef = useRef<DOMRect | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const open = anchor !== null

  useEscapeKey(onClose, open)
  useFocusTrap(ref, open && !passThrough)

  useLayoutEffect(() => {
    const menu = ref.current

    if (!anchor || !menu) {
      placedForRef.current = null
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
    const sameCard = placedForRef.current === anchor

    placedForRef.current = anchor
    // El segundo paso aparece en el mismo lugar que el menú que se acaba de tocar (si es más corto o más largo "pegado a la carta" lo movía de lugar): misma esquina de arriba a la izquierda, sin salirse de la pantalla.
    setPosition((current) => (sameCard && current ? { left: current.left, top: Math.min(Math.max(current.top, margin), Math.max(margin, window.innerHeight - height - margin)) } : { left, top }))
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
    <div className={cx('fixed inset-0 z-210', passThrough && 'pointer-events-none')} onClick={closeFromBackdrop}>
      <div
        ref={ref}
        role="menu"
        aria-label={title || kicker}
        tabIndex={-1}
        className={cx(surface.panel, 'absolute max-h-[min(calc(100dvh-1rem),34rem)] w-[13rem] overflow-y-auto py-1 outline-none animate-pop motion-reduce:animate-none', position ? 'visible' : 'invisible')}
        style={position ?? { left: 0, top: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="grid gap-0.5 px-3 pb-1.5 pt-1.5">
          <p className={cx('m-0', overline)}>{kicker}</p>
          {title ? (
            <p className="m-0 truncate text-body font-semibold text-foreground" title={title}>
              {title}
            </p>
          ) : null}
          <CardEffectTraits ygoprodeckId={ygoprodeckId} />
        </div>
        {items.map((item, index) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            aria-current={item.current ? 'true' : undefined}
            aria-disabled={item.disabled || undefined}
            className={cx(MENU_ITEM, item.current && 'font-bold text-info!', item.disabled && 'cursor-default text-muted hover:bg-transparent')}
            data-initial-focus={index === 0 ? '' : undefined}
            onClick={item.disabled ? undefined : item.onSelect}
          >
            {item.label}
            {item.hint ? <span className="block text-micro font-normal text-soft">{item.hint}</span> : null}
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
  /** Las cartas del rival: sólo se sabe cómo se ven, no cómo se llaman, así que no hay nombre debajo ni buscador. */
  anonymous?: boolean
}

/**
 * Las cartas de una pila. El deck y el Extra se muestran en su orden real (tope primero; al cerrar el
 * deck se baraja, como en la mesa real) y con buscador; cementerio y destierro, la más reciente primero.
 */
export function PileViewer({ pile, ids, info, targeted, onPick, onClose, anonymous = false }: PileViewerProps) {
  const [query, setQuery] = useState('')
  const cards = ids.map((id) => ({ id, ...info(id) }))
  // El Extra se muestra en su orden, pero las cartas boca arriba (las que se ven y se invocan por Péndulo) van primero.
  const ordered = pile === 'extra' ? [...cards.filter((card) => card.faceUp), ...cards.filter((card) => !card.faceUp)] : pile === 'deck' ? cards : [...cards].reverse()
  const words = normalizeSearchText(query).split(' ').filter(Boolean)
  const visible = words.length === 0 ? ordered : ordered.filter((card) => words.every((word) => normalizeSearchText(card.name).includes(word)))
  const title = pile ? `${PILE_TITLES[pile]} · ${ids.length}` : ''

  return (
    <Modal isOpen={pile !== null} onClose={onClose} size="md" kicker={t('practice.mat.name')} title={title} ariaLabel={title}>
      <div className="grid gap-3">
        {ids.length > 8 && !anonymous ? (
          <label className="relative block">
            <span className="sr-only">{t('practice.dialog.searchCard')}</span>
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-soft" />
            <input
              type="search"
              value={query}
              placeholder={t('practice.dialog.searchCard')}
              autoComplete="off"
              data-initial-focus=""
              className={cx(field, 'h-10 w-full pl-9 pr-3 text-body pointer-coarse:h-11')}
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
            const label = card.faceDown ? t('practice.dialog.cardFaceDown', { name: card.name }) : card.faceUp ? t('practice.dialog.cardFaceUp', { name: card.name }) : card.name

            return (
              <li key={card.id}>
                <button
                  type="button"
                  aria-label={targeted.has(card.id) ? t('practice.card.targeted', { name: label }) : anonymous ? label : undefined}
                  className="grid w-full gap-1 rounded-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={(event) => onPick(card.id, event.currentTarget.getBoundingClientRect())}
                >
                  <span
                    data-targeted={targeted.has(card.id) ? 'true' : 'false'}
                    className={cx('relative block aspect-[421/614] w-full overflow-hidden bg-input shadow-[0_4px_10px_rgba(0,0,0,0.4)] [--card-shadow:0_4px_10px_rgba(0,0,0,0.4)]', FX_CARD)}
                    style={fxVars('red')}
                  >
                    {card.faceDown ? <span className={CARD_BACK} /> : <CardArt tilt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
                    {targeted.has(card.id) ? <TargetMark /> : null}
                    {card.faceUp ? <span className="absolute inset-x-0 bottom-0 z-2 bg-background/85 px-1 py-px text-center text-micro font-bold leading-tight text-white">{t('practice.dialog.faceUpTag')}</span> : null}
                  </span>
                  {anonymous ? null : <span className="truncate text-micro text-foreground">{label}</span>}
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
  /** Para un combo que ya está guardado: otro título y sin el aviso de qué se guarda. */
  rename?: boolean
  onSave: (name: string) => void
  onClose: () => void
}

export function SaveComboDialog({ isOpen, defaultName, rename = false, onSave, onClose }: SaveComboDialogProps) {
  const [name, setName] = useState(defaultName)
  const title = t(rename ? 'practice.panel.renameTitle' : 'practice.mat.saveCombo')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSave(name)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" kicker={t('practice.mat.name')} title={title} ariaLabel={title}>
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
        {rename ? null : <p className="m-0 text-micro text-soft">{t('practice.dialog.saveNote')}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="tertiary" size="sm" type="button" onClick={onClose}>
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

/** Dorso para el fantasma del tope del deck. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span className={cx('relative block aspect-[421/614] w-full', className)}>
      <span className={CARD_BACK} />
    </span>
  )
}
