import { useId, useRef } from 'react'

import { matCardPositionKey, useDraggableOffset } from '../../app/use-draggable-offset'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { ChainListRows, colorOf, stateLabel, type ChainNoticeRow } from './chain-parts'
import { ChainSheet } from './ChainSheet'

export type { ChainNoticeRow }

interface ChainNoticeProps {
  /** Del CL1 en adelante (la lista los muestra al revés: en el orden en que se resuelven). */
  rows: readonly ChainNoticeRow[]
  /** El eslabón del que habla la píldora (índice en `rows`): el último que se sumó o el último que cambió al resolverse. */
  focus: number
  /** Ya empezó a resolverse: en el celular, la píldora dice cuál resuelve («Resuelve CL2»). */
  resolving: boolean
  open: boolean
  /** El celular (menos de 1101 px): la hoja de abajo, `ChainSheet`. */
  compact?: boolean
  onOpenChange: (open: boolean) => void
  /** Se tocó un eslabón (índice en `rows`, y dónde está la fila): quien la usa lo muestra en el detalle o, sin detalle, grande. */
  onPick: (index: number, rect: DOMRect) => void
}

/**
 * La pila de la cadena (duelo automático: «Jugar solo» y el duelo por enlace). La pone la mesa en `duel.chain`, centrada arriba de su columna, debajo de la barra.
 * - **Desplegada** (así abre cada cadena; sólo la pliega la persona): un solo cartel, con el título («Cadena · 2») arriba y, tras una línea fina, la pila en el orden en que se resuelve (el último eslabón
 *   arriba): número, carta, de quién y su estado (en espera, resolviendo, resuelta, negada o sin efecto, con quién lo negó si se sabe: «Sin efecto · por CL2»). Tiene tope de alto
 *   y se desplaza; con una pregunta abierta debajo en el celular, la mesa la acorta a lo que queda (`data-chain-list`) y, sin lugar ni para un eslabón, se ve el resumen de la
 *   píldora (`data-squeezed` en la capa, `group/chain`) hasta que se conteste.
 * - **Plegada** (la píldora): «Cadena · CL2 · Rival» (el eslabón del que habla y su dueño, en su color; la cuenta, sólo si no es ese número) y debajo, en ámbar, qué le pasa,
 *   corto y sin nombres («En espera», «Sin efecto · por CL2»: la carta la marca su insignia en la mesa), y la flecha que la despliega (44 px, `aria-expanded`).
 * - **En el celular** (`compact`) no es nada de esto: es `ChainSheet`, una hoja de abajo que se arrastra (una cinta de chips y, subida, la pila); la píldora y la pila desplegada son de escritorio.
 * - **El color del dueño** (violeta claro lo tuyo, ámbar lo del rival: el de las vidas, `PLAYER_COLOR`) va en la etiqueta del número, rellena, y en el «de quién». No se confunde
 *   con el ámbar de lo que se resuelve, que es un **aro** alrededor de toda la fila (`listItemSelected`, como el brillo de las cartas): forma distinta, mismo significado de siempre.
 * - **Tocar un eslabón** (`onPick`) lo muestra para leerlo: cada fila es un botón de 44 px o más con su nombre entero («Eslabón 2: Ash Blossom, del rival. Resolviendo»).
 * - El ritmo, cuándo aparece y cuándo se va lo decide quien la usa (`use-auto-asks.tsx`); acá sólo se dibuja. El cartel no entra ni sale animado (tiene temporizador); sus filas sí, al cambiar un eslabón (`ChainListRows`).
 * - Accesibilidad: el texto de la píldora es un `status` (lo lee el lector de pantalla cuando cambia); la flecha dice qué hace y controla la lista.
 * - Hacer: dejar pasar los toques fuera del cartel (la caja de la mesa va con `pointer-events-none`); tocarla no salta la mesa al final (`skipAhead` la saltea).
 *   No hacer: taparla con otra cosa ni ponerle velo. La mueve sólo la persona (escritorio: su fila de arriba con el mouse, `useDraggableOffset`).
 */
export function ChainNotice({ rows, focus, resolving, open, compact = false, onOpenChange, onPick }: ChainNoticeProps) {
  const listId = useId()
  const cardRef = useRef<HTMLDivElement | null>(null)
  // En escritorio se lleva a otro lado agarrándola por su fila de arriba (`useDraggableOffset`, como la pregunta): una posición para todas las cadenas.
  const move = useDraggableOffset(matCardPositionKey('chain'), cardRef, !compact)
  const row = rows[focus] ?? rows[rows.length - 1]

  if (!row) return null
  // El celular: la hoja de abajo (`ChainSheet`); la pila desplegada y su píldora, desde 1101 px.
  if (compact) return <ChainSheet rows={rows} focus={focus} resolving={resolving} onPick={onPick} />
  // El celular, al resolverse: el eslabón que se está resolviendo (el que niega a otro sigue «Resolviendo» mientras lo niega); entre uno y otro, el último que cambió.
  const solver = rows.find((link) => link.state === 'solving') ?? row
  const clOf = (number: number) => (
    <span className={cx('font-semibold', colorOf(rows.find((link) => link.number === number)?.mine ?? false).text)}>{`CL${number}`}</span>
  )
  const solves = compact && resolving
  // Cuántos eslabones, sólo si no lo dice ya el número del que habla (encadenando, el último es CL igual a la cuenta).
  const counted = rows.length !== (solves ? solver.number : row.number)

  return (
    <div data-testid="chain-notice" className="pointer-events-none w-[min(24rem,100%)]">
      {/* Un solo cartel: desplegada, la píldora pasa a ser la fila de título de la misma tarjeta y la pila va debajo, tras una línea fina. Plegada mide 56 px con el borde. */}
      <div ref={cardRef} {...move.root} className={cx('pointer-events-auto border border-border-subtle bg-card-background shadow-overlay', open ? 'rounded-card' : 'rounded-full')}>
        <div {...move.head} title={t('duel.prompt.move')} className={cx('flex cursor-grab select-none items-center gap-2 py-1 pl-3 pr-1 active:cursor-grabbing', open ? 'min-h-11' : 'min-h-13.5')}>
          <Icon name="link" size={18} className="shrink-0 text-info" aria-hidden="true" />
          {/* Desplegada, la píldora es el título de la lista («Cadena · 2»): lo del eslabón ya está en su fila (el resumen queda para el lector de pantalla, que avisa cuando cambia).
              Sin lugar para la lista (`data-squeezed` en la capa, `PracticeMat`), el resumen se ve y la lista no. */}
          <p role="status" className="m-0 grid min-w-0 flex-1 leading-tight">
            {open ? <span className="truncate text-body font-semibold group-data-squeezed/chain:hidden">{t('auto.chain.count', { count: rows.length })}</span> : null}
            <span className={cx('truncate text-micro text-muted', open && 'sr-only group-data-squeezed/chain:not-sr-only')}>
              {open ? null : counted ? `${t('auto.chain.count', { count: rows.length })} · ` : `${t('auto.chain.title')} · `}
              {solves ? (
                <>
                  {`${t('auto.chain.resolves')} `}
                  {clOf(solver.number)}
                </>
              ) : (
                <>
                  {`CL${row.number} · `}
                  <span className={cx('font-semibold', colorOf(row.mine).text)}>{row.who}</span>
                </>
              )}
            </span>
            {/* Qué le pasa al eslabón, corto y sin nombres («Sin efecto · por CL2»): la carta la marca su insignia CLn en la mesa y su nombre está en la pila. */}
            <span className={cx('truncate text-body font-semibold text-info', open && 'sr-only group-data-squeezed/chain:not-sr-only')}>{stateLabel(row)}</span>
          </p>
          <IconButton size="lg" aria-expanded={open} aria-controls={listId} aria-label={open ? t('auto.chain.hide') : t('auto.chain.show')} title={open ? t('auto.chain.hide') : t('auto.chain.show')} onClick={() => onOpenChange(!open)}>
            <Icon name={open ? 'chevron-up' : 'chevron-down'} />
          </IconButton>
        </div>
        {open ? (
          <ol id={listId} data-chain-list="" aria-label={t('auto.chain.list')} className="m-0 grid max-h-[min(18rem,40dvh)] snap-y snap-mandatory scroll-pt-1 list-none content-start gap-1 overflow-y-auto overscroll-contain border-t border-border-subtle p-1.5 group-data-squeezed/chain:hidden">
            <ChainListRows rows={rows} onPick={onPick} />
          </ol>
        ) : null}
      </div>
    </div>
  )
}
