import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { prefersReducedMotion } from '../../app/motion'
import { useSheetDrag } from '../../app/use-sheet-drag'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { listItem, listItemSelected } from '../ui/surfaces'
import { PickGrid, type PickCard } from './CardPicker'
import { ChainListRows, colorOf, stateLabel, type ChainNoticeRow } from './chain-parts'

/** Lo que se decide cuando se puede responder a la cadena (`respondOffer`): la hoja lleva las acciones y, abierta, las candidatas. */
export interface ChainRespond {
  /** Una por decisión: una pregunta nueva abre la hoja si hay que elegir entre varias. */
  key: number
  /** El número de eslabón que tomaría tu respuesta (1 = CL1). */
  link: number
  cards: readonly PickCard[]
  /** La elegida (su `key`), o null: la principal se enciende recién con una. */
  chosen: string | null
  onToggle: (key: string) => void
  onChain: () => void
  onPass: () => void
}

/** Cuánto dice «Nuevo» el eslabón que se suma. */
const FRESH_MS = 1500
/** El asa de arriba (con la raya), la cinta de chips y, con algo que decidir, las candidatas y la fila de acciones: lo que queda a la vista con la hoja bajada (px). */
const GRIP_PX = 24
const CHIPS_PX = 56
const OPTIONS_PX = 124
const ACTIONS_PX = 56

interface ChainSheetProps {
  rows: readonly ChainNoticeRow[]
  focus: number
  resolving: boolean
  onPick: (index: number, rect: DOMRect) => void
  respond?: ChainRespond | undefined
  /** En el catálogo: dentro de su marco (`absolute`, sin portal) y no sobre la página. */
  inline?: boolean
}

/**
 * La cadena en el celular: una hoja de abajo (de borde a borde y apoyada abajo, encima de tu mano) con dos alturas que se arrastran: bajada es una cinta con un chip por eslabón; subida, la pila entera en
 * su lugar (la lista en el orden en que se resuelve, con nombres y estados): cada dato se dice una sola vez. Si hay algo que decidir, en las dos alturas van las candidatas (`PickGrid`, siempre a la vista: qué se
 * encadena) y, siempre debajo, «No responder» y la principal. La arrastra el dedo (`useSheetDrag`: sigue al dedo, decide un tirón o 64 px) o la toca su asa. Arranca bajada y no se sube sola.
 * Cada chip lleva su número en el color de su dueño, su arte y cómo va: el que se resuelve, el aro ámbar y crece un poco; el resuelto, un tilde; el negado o sin efecto, una cruz roja con el eslabón que lo
 * negó. Un eslabón que se suma entra desde la derecha y dice «Nuevo» un momento; con más chips de los que entran, la cinta se desplaza y deja a la vista el del que se habla. Tocar un chip lo muestra para
 * leerlo. Sólo opacidad y transform. El texto de siempre («Cadena · 2 · Resuelve CL2 · Resolviendo») va para el lector de pantalla (`status`).
 */
export function ChainSheet({ rows, focus, resolving, onPick, respond, inline = false }: ChainSheetProps) {
  const row = rows[focus] ?? rows[rows.length - 1]!
  const solver = rows.find((link) => link.state === 'solving') ?? row
  const counted = rows.length !== (resolving ? solver.number : row.number)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLOListElement | null>(null)
  const drag = useSheetDrag(panelRef, GRIP_PX + CHIPS_PX + (respond ? OPTIONS_PX + ACTIONS_PX : 0), true)
  const [fresh, setFresh] = useState<number | null>(rows.length)

  // El eslabón que se suma (mientras la cadena se arma): «Nuevo» un momento.
  useEffect(() => {
    if (resolving) return
    const timer = window.setTimeout(() => setFresh(null), FRESH_MS)

    setFresh(rows.length)
    return () => window.clearTimeout(timer)
  }, [rows.length, resolving])
  // Del que se habla (el último que se sumó o el que se resuelve), a la vista.
  const at = resolving ? rows.indexOf(solver) : focus

  useEffect(() => {
    listRef.current?.children[at]?.scrollIntoView?.({ inline: 'center', block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [at, rows.length, drag.lowered])
  const chain = respond ? (
    <Button variant="primary" size="sm" disabled={respond.chosen === null} onClick={respond.onChain}>
      {respond.link === 1 ? t('auto.respond.start') : t('auto.respond.chain', { link: respond.link })}
    </Button>
  ) : null

  const sheet = (
    // La caja va de borde a borde y apoyada abajo (como toda hoja) y recorta lo que la hoja deja abajo de su borde (bajada, la hoja se corre hacia abajo). `overflow-clip` y no `hidden`: una caja
    // `hidden` se deja desplazar, y el `scrollIntoView` del chip (que corre mientras la hoja entra desde abajo) la subía y dejaba asomar la pila. Mientras se elige algo en la mesa (`data-mat-choosing`),
    // sube sobre la línea de estado (`data-mat-float`: 44 px a 8 del borde): «Cancelar» y «Listo» quedan a la vista.
    <div
      className={cx(
        'pointer-events-none inset-x-0 bottom-0 z-[135] flex items-end justify-center overflow-clip',
        inline ? 'absolute h-full' : 'fixed h-[min(70dvh,34rem)] [body:has([data-mat-choosing])_&]:-translate-y-[calc(3.25rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      <div
        ref={panelRef}
        data-testid="chain-notice"
        style={drag.style}
        className="pointer-events-auto flex max-h-full w-full flex-col rounded-t-panel border border-b-0 border-border bg-card-background pb-[env(safe-area-inset-bottom,0px)] shadow-overlay motion-safe:animate-sheet-up"
      >
        <div
          {...drag.handlers}
          className="flex-none select-none"
          onClick={(event) => {
            const control = (event.target as Element).closest('a, button, input, [role="listbox"]')

            if (control === null || control === drag.gripRef.current) drag.toggle()
          }}
        >
          <button
            ref={drag.gripRef}
            type="button"
            aria-expanded={!drag.lowered}
            aria-label={drag.lowered ? t('common.sheet.raise', { title: t('auto.chain.title') }) : t('common.sheet.lower')}
            className="group flex w-full touch-none items-center justify-center outline-none"
            style={{ height: GRIP_PX }}
          >
            <span className="block h-1 w-10 rounded-full bg-primary-soft/50 group-hover:bg-info group-focus-visible:shadow-focus" />
          </button>
          <p role="status" className="sr-only">
            <span>
              {counted ? `${t('auto.chain.count', { count: rows.length })} · ` : `${t('auto.chain.title')} · `}
              {resolving ? `${t('auto.chain.resolves')} CL${solver.number}` : `CL${row.number} · ${row.who}`}
            </span>
            <span>{stateLabel(row)}</span>
          </p>
          {/* Bajada, la cinta de chips; subida, el título de la pila (los chips son las filas de abajo). */}
          <div hidden={!drag.lowered} inert={!drag.lowered} className="touch-pan-x" style={{ height: CHIPS_PX }}>
            <ol ref={listRef} aria-label={t('auto.chain.strip')} className="m-0 flex h-full list-none items-center gap-1.5 overflow-x-auto overscroll-contain px-3 [scrollbar-width:none]">
              {rows.map((link, index) => {
                const color = colorOf(link.mine)
                const done = link.state === 'solved'
                const voided = link.state === 'negated' || link.state === 'disabled'
                const label = t(link.mine ? 'auto.chain.linkMine' : 'auto.chain.linkTheirs', { number: link.number, card: link.name, state: stateLabel(link) })

                return (
                  <li key={link.number} aria-current={link.state === 'solving' ? 'step' : undefined} className={cx('shrink-0', fresh === link.number && 'motion-safe:animate-chain-link-in')}>
                    <button
                      type="button"
                      aria-label={label}
                      className={cx(listItem, 'flex h-11 items-center gap-1.5 p-1 text-left transition-transform focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none', link.state === 'solving' && cx(listItemSelected, 'motion-safe:scale-105'))}
                      onClick={(event) => onPick(index, event.currentTarget.getBoundingClientRect())}
                    >
                      <span className={cx('w-9 shrink-0 rounded-tag border py-0.5 text-center text-micro font-bold tabular-nums text-white', color.border, color.bubble)}>{`CL${link.number}`}</span>
                      <span className="relative block aspect-[421/614] w-6 shrink-0 overflow-hidden bg-input">
                        <CardArt remoteUrl={link.art} name={link.name} className={cx('block h-full w-full object-cover', (done || voided) && 'opacity-50')} />
                      </span>
                      {fresh === link.number && !resolving ? (
                        <span aria-hidden="true" className="rounded-tag bg-primary px-1 text-micro font-bold text-white">
                          {t('auto.chain.fresh')}
                        </span>
                      ) : done ? (
                        <Icon name="check" size={16} className="shrink-0 text-success" aria-hidden="true" />
                      ) : voided ? (
                        <span aria-hidden="true" className="flex items-center gap-0.5 text-micro font-bold text-danger">
                          <Icon name="x" size={16} className="shrink-0" />
                          {link.by ? `CL${link.by}` : null}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
          <div hidden={drag.lowered} className="flex items-center gap-2 px-3" style={{ height: CHIPS_PX }}>
            <Icon name="link" size={18} className="shrink-0 text-info" aria-hidden="true" />
            <p aria-hidden="true" className="m-0 min-w-0 flex-1 truncate text-body font-semibold">
              {t('auto.chain.count', { count: rows.length })}
            </p>
          </div>
          {respond ? (
            // Qué se encadena, siempre a la vista: las candidatas en una fila que se desplaza de costado (la mano con su ícono, el nombre en un renglón; una sola, ya elegida) y, debajo, las acciones.
            <div className="touch-pan-x px-3 py-1" style={{ height: OPTIONS_PX }}>
              <PickGrid label={t('auto.respond.cards')} cards={respond.cards} chosen={respond.chosen === null ? [] : [respond.chosen]} onToggle={respond.onToggle} multi={false} tabs className="h-full auto-cols-[3rem] grid-flow-col justify-start overflow-x-auto overscroll-contain [scrollbar-width:none]" />
            </div>
          ) : null}
          {respond ? (
            <div className="flex items-center justify-between gap-2 px-3" style={{ height: ACTIONS_PX }}>
              <Button variant="tertiary" size="sm" onClick={respond.onPass}>
                {t('auto.lane.pass')}
              </Button>
              {chain}
            </div>
          ) : null}
        </div>
        {/* Lo de abajo, sólo con la hoja subida: la pila entera, que reemplaza a la cinta. Bajada queda fuera de la pantalla, inerte y transparente: lo que asoma (el borde de abajo del celular) no repite los chips. */}
        <div inert={drag.lowered} className={cx('min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border-subtle motion-safe:transition-opacity', drag.lowered && 'opacity-0')}>
          <ol aria-label={t('auto.chain.list')} data-chain-list="" className="m-0 grid list-none content-start gap-1 p-1.5">
            {/* Sin «Vos» / «Rival» escrito: el dueño ya lo dice el color de su número (y el nombre accesible, entero). */}
            <ChainListRows rows={rows} onPick={onPick} who={false} />
          </ol>
        </div>
      </div>
    </div>
  )

  return inline ? sheet : createPortal(sheet, document.body)
}
