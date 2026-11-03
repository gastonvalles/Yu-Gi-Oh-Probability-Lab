import { useCallback, useEffect, useState } from 'react'

import { prefersReducedMotion } from '../../app/motion'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { BottomSheet } from '../ui/BottomSheet'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { listItem, listItemSelected } from '../ui/surfaces'
import { TONE } from '../ui/tone'
import { CHIP_ICON, ChainListRows, colorOf, STATE_TONE, stateLabel, type ChainNoticeRow } from './chain-parts'
import { ChainLesson } from './ChainLesson'

/** Cuánto dice «Nuevo» el eslabón que se suma. */
const FRESH_MS = 1500

interface ChainSheetProps {
  rows: readonly ChainNoticeRow[]
  focus: number
  resolving: boolean
  onPick: (index: number, rect: DOMRect) => void
}

/**
 * La cadena en el celular, en la hoja de abajo estándar (`BottomSheet`): subida, la pila entera en el orden en que se resuelve (con nombres y estados); bajada, una cinta con un chip por eslabón: cada
 * dato se dice una sola vez. **Cada eslabón que se suma la abre entera** (Gastón, 2026-11-02: «el desplegable debe estar maximizado al activar un eslabón»); bajarla es de la persona y nunca se baja sola,
 * salvo mientras se elige algo en la mesa o la mano (un costo, un objetivo): ahí cede el lugar y queda su asa, y al terminar vuelve como estaba. Lo que se decide (las preguntas de la mesa: responder,
 * «¿Activás el efecto?») va en su pie, siempre a la vista y debajo de la pila: una sola hoja, con una sola asa.
 * Cada chip lleva su número en el color de su dueño, su arte y el ícono de cómo va (`CHIP_ICON`, el mismo tono que el chip de la pila): en espera, un reloj; el que se resuelve, ▶ con el aro ámbar, y crece un
 * poco; el resuelto, un tilde; el negado, una cruz roja; el sin efecto, un «prohibido» ámbar (los dos últimos, con el eslabón que los negó). Un eslabón que se suma entra desde la derecha y dice «Nuevo» un momento; con más chips de los que entran, la cinta se desplaza y deja a la vista el del que se habla. Tocar un chip lo muestra para
 * leerlo. Subida, el ⓘ de su cabeza abre «Cómo se resuelve» (`ChainLesson`). El texto de siempre («Cadena · 2 · Resuelve CL2 · Resolviendo») va para el lector de pantalla (`status`).
 */
export function ChainSheet({ rows, focus, resolving, onPick }: ChainSheetProps) {
  const row = rows[focus] ?? rows[rows.length - 1]!
  const solver = rows.find((link) => link.state === 'solving') ?? row
  const counted = rows.length !== (resolving ? solver.number : row.number)
  const [fresh, setFresh] = useState<number | null>(rows.length)

  // El eslabón que se suma (mientras la cadena se arma): «Nuevo» un momento.
  useEffect(() => {
    if (resolving) return
    const timer = window.setTimeout(() => setFresh(null), FRESH_MS)

    setFresh(rows.length)
    return () => window.clearTimeout(timer)
  }, [rows.length, resolving])
  // Del que se habla (el último que se sumó o el que se resuelve), a la vista en la cinta: al cambiar y al bajar la hoja (la cinta se monta).
  const at = resolving ? rows.indexOf(solver) : focus
  // Se desplaza sólo la cinta (es la `offsetParent` de sus chips: `relative`): un `scrollIntoView` corría también lo de afuera que se deja desplazar (la página, el marco del catálogo) y dejaba ver el fondo por un costado.
  const stripRef = useCallback(
    (list: HTMLOListElement | null) => {
      const chip = list?.children[at] as HTMLElement | undefined

      if (list && chip) list.scrollTo?.({ left: chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    },
    [at],
  )

  return (
    <BottomSheet
      data-testid="chain-notice"
      label={t('auto.chain.count', { count: rows.length })}
      // Cada eslabón que se suma la sube entera (al resolverse no se suma ninguno).
      raiseKey={rows.length}
      yields
      tall
      hostsFooter
      head={
        // El ⓘ a la derecha de la cabeza: del lado del pulgar, lejos del pie de las preguntas y sola acción de la fila. Tocarlo no sube ni baja la hoja (`BottomSheet` deja pasar los botones) y
        // arrastrar desde él sigue arrastrando la hoja.
        <div className="flex h-14 items-center gap-2 pl-3 pr-1">
          <Icon name="link" size={18} className="shrink-0 text-info" aria-hidden="true" />
          <p aria-hidden="true" className="m-0 min-w-0 flex-1 truncate text-body font-semibold">
            {t('auto.chain.count', { count: rows.length })}
          </p>
          <ChainLesson />
        </div>
      }
      status={
        <p role="status" className="sr-only">
          <span>
            {counted ? `${t('auto.chain.count', { count: rows.length })} · ` : `${t('auto.chain.title')} · `}
            {resolving ? `${t('auto.chain.resolves')} CL${solver.number}` : `CL${row.number} · ${row.who}`}
          </span>
          <span>{stateLabel(row)}</span>
        </p>
      }
      peek={
        <ol ref={stripRef} aria-label={t('auto.chain.strip')} className="relative m-0 flex h-full touch-pan-x list-none items-center gap-1.5 overflow-x-auto overscroll-contain px-3 [scrollbar-width:none]">
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
                  ) : (
                    <span aria-hidden="true" className={cx('flex items-center gap-0.5 text-micro font-bold', TONE[STATE_TONE[link.state]].text)}>
                      <Icon name={CHIP_ICON[STATE_TONE[link.state]]} size={16} className="shrink-0" />
                      {voided && link.by ? `CL${link.by}` : null}
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ol>
      }
    >
      <ol aria-label={t('auto.chain.list')} data-chain-list="" className="m-0 grid min-h-0 list-none content-start gap-1 overflow-y-auto overscroll-contain border-t border-border-subtle p-1.5">
        {/* Sin «Vos» / «Rival» escrito: el dueño ya lo dice el color de su número (y el nombre accesible, entero). */}
        <ChainListRows rows={rows} onPick={onPick} who={false} />
      </ol>
    </BottomSheet>
  )
}
