import { useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { PHASES } from '../../app/practice-mat'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { surface } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { GHOST_CLICK_MS, type MenuItem } from './MatDialogs'

/** Lo que se elige con las flechas: las apagadas se enfocan con Tab (dicen «Todavía no»), pero las flechas las saltean. */
const CHOOSABLE = '[role="menuitem"]:not([aria-disabled="true"])'

/** La palabra que distingue una fase, sin «Phase» («Draw», «Main 1», «Battle»): debajo de su círculo en la línea de fases y debajo del botón de la fase del campo sin píldora en la barra. */
export const phaseWord = (name: string) => name.replace(' Phase', '')

/**
 * Cómo se ve y cómo se nombra cada fase de la línea: en el círculo la sigla del botón de la fase (DP, M1…), debajo la palabra que la distingue («Main 1») y, para el lector
 * de pantalla, qué hace tocarla: «Ir a Battle Phase», «Fase actual: Main Phase 1» o, apagada, la fase y por qué («Battle Phase · Todavía no»). Las opciones son las del
 * menú de fases de la mesa (`label` = el nombre de la fase); qué se puede elegir lo decide quien las arma (la mesa manual o el núcleo), no la línea.
 */
export function phaseRowEntries(items: readonly MenuItem[]) {
  return items.map((item) => {
    const phase = PHASES.find((entry) => entry.name === item.label)

    return {
      item,
      short: phase?.short ?? item.label,
      word: phaseWord(item.label),
      name: item.current ? t('duel.phase.current', { phase: item.label }) : item.disabled ? (item.hint ? `${item.label} · ${item.hint}` : item.label) : t('practice.phaseRow.goTo', { phase: item.label }),
    }
  })
}

/**
 * Las fases en una línea (lámina 06, como el selector de fase de Master Duel): sale del botón de la fase de ahora (el «M1» del campo), arriba de él (abajo si no entra) y sin
 * velo, en el lugar donde salía el menú de fases; en el celular también (reemplaza a la hoja). Cada fase es un círculo de 44 px con su nombre debajo: la actual, violeta con aro
 * ámbar; las que todavía no, apagadas pero enfocables. Elegir una hace lo mismo que el menú (`items`, las mismas opciones); «Cancelar» (sin caja), Escape o tocar afuera la
 * cierran. ← → Inicio y Fin recorren las que se pueden elegir; Enter elige. El foco arranca en la fase de ahora y vuelve al botón al cerrar.
 */
export function PhaseRow({ anchor, items, onClose }: { anchor: DOMRect | null; items: MenuItem[]; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const openedAtRef = useRef(0)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const open = anchor !== null && items.length > 0

  useEscapeKey(onClose, open)
  useFocusTrap(rootRef, open)

  // Como `PlayTag`: centrada sobre el botón y dentro de la pantalla, con medidas de layout (la entrada arranca achicada).
  useLayoutEffect(() => {
    const panel = panelRef.current

    if (!anchor || !panel) {
      setPosition(null)
      return
    }

    openedAtRef.current = performance.now()
    const margin = 8
    const { offsetWidth: width, offsetHeight: height } = panel
    const left = Math.min(Math.max(anchor.left + anchor.width / 2 - width / 2, margin), Math.max(margin, window.innerWidth - width - margin))
    const above = anchor.top - height - 6

    setPosition({ left, top: above >= margin ? above : Math.min(anchor.bottom + 6, Math.max(margin, window.innerHeight - height - margin)) })
  }, [anchor])

  if (!open || typeof document === 'undefined') return null

  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>(CHOOSABLE)]
    const at = rows.findIndex((row) => row === document.activeElement)
    const key = event.key
    const next = key === 'ArrowRight' ? at + 1 : key === 'ArrowLeft' ? (at < 0 ? rows.length : at) - 1 : key === 'Home' ? 0 : key === 'End' ? rows.length - 1 : null

    if (next === null || rows.length === 0) return
    event.preventDefault()
    rows[(next + rows.length) % rows.length]!.focus()
  }

  const entries = phaseRowEntries(items)
  const title = t('practice.phaseRow.title')

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-210" onClick={() => (performance.now() - openedAtRef.current >= GHOST_CLICK_MS ? onClose() : undefined)}>
      <div
        ref={panelRef}
        data-phase-row=""
        // El título arriba; «Cancelar» al final de la línea (escritorio) o arriba a la derecha (bajo 1101 px: seis fases y «Cancelar» no entran en 390 px).
        className={cx(
          surface.floating,
          'absolute grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-2 pb-2 pt-1.5 animate-dialog-enter motion-reduce:animate-none',
          "[grid-template-areas:'title_cancel'_'row_row'] min-[1101px]:[grid-template-areas:'title_.'_'row_cancel']",
          position ? 'visible' : 'invisible',
        )}
        style={position ?? { left: 0, top: 0 }}
        onClick={(event) => event.stopPropagation()}
      >
        <p className={cx('m-0 px-1 [grid-area:title]', overline)}>{title}</p>
        <div role="menu" aria-orientation="horizontal" aria-label={title} className="flex [grid-area:row]" onKeyDown={onKey}>
          {entries.map(({ item, short, word, name }) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-label={name}
              aria-current={item.current ? 'true' : undefined}
              aria-disabled={item.disabled || undefined}
              data-initial-focus={item.current ? '' : undefined}
              className={cx(
                'group grid w-14 justify-items-center gap-1 rounded-control border-0 bg-transparent px-0 py-1 outline-none focus-visible:shadow-focus',
                item.disabled ? 'cursor-default' : 'cursor-pointer',
              )}
              onClick={item.disabled ? undefined : item.onSelect}
            >
              <span
                aria-hidden="true"
                className={cx(
                  'grid size-11 place-items-center rounded-full border-2 text-micro font-extrabold leading-none transition-colors',
                  item.current
                    ? 'border-info bg-primary text-white'
                    : item.disabled
                      ? 'border-border-subtle text-muted'
                      : 'border-border text-foreground group-hover:bg-tint/12',
                )}
              >
                {short}
              </span>
              <span aria-hidden="true" className={cx('whitespace-nowrap text-micro', item.current ? 'font-bold text-info' : item.disabled ? 'text-muted' : 'font-semibold text-foreground')}>
                {word}
              </span>
            </button>
          ))}
        </div>
        <Button variant="tertiary" size="sm" className="[grid-area:cancel]" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>,
    document.body,
  )
}
