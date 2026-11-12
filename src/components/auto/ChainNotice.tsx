import { useId } from 'react'

import { useMediaQuery } from '../../app/use-media-query'
import { COMPACT_FIELD_MEDIA_QUERY } from '../probability/compact-field'
import { t } from '../../i18n'
import { Icon } from '../ui/Icon'
import { ChainTrace } from '../probability/MatFx'
import { ChainLinks, stateLabel, type ChainNoticeRow } from './chain-parts'
import { ChainLesson, ChainLessonReading } from './ChainLesson'
import { ChainSheet } from './ChainSheet'

export type { ChainNoticeRow }

interface ChainNoticeProps {
  /** Del CL1 en adelante (la lista los muestra al revés: en el orden en que se resuelven). */
  rows: readonly ChainNoticeRow[]
  /** El eslabón del que habla la píldora (índice en `rows`): el último que se sumó o el último que cambió al resolverse. */
  focus: number
  /** Ya empezó a resolverse: en el celular, la píldora dice cuál resuelve («Resuelve CL2»). */
  resolving: boolean
  /** Terminó: lo que queda de la cadena se disuelve (`ChainLinks`, `ChainTrace`). */
  done?: boolean
  open: boolean
  /** Menos de 1101 px: de 640 a 1100, la hoja de abajo (`ChainSheet`); en el celular, la línea. */
  compact?: boolean
  onOpenChange: (open: boolean) => void
  /** Se abre o se cierra «Cómo se resuelve» (`ChainLesson`): mientras se lee, quien la usa no la esconde. */
  onReading?: (reading: boolean) => void
  /** Se tocó un eslabón (índice en `rows`, y dónde está la fila): quien la usa lo muestra en el detalle o, sin detalle, grande. */
  onPick: (index: number, rect: DOMRect) => void
}

/**
 * La cadena en la línea del celular (`data-duel-line`, de alto fijo): arriba cuántos eslabones y qué le pasa al del que se habla («CL2 · Resolviendo»), debajo los eslabones
 * (`ChainLinks`: cada uno se toca para leerlo) y, a la derecha, el ⓘ de «Cómo se resuelve». Llena el alto de la línea, traslúcida al 88 % en alfa plano. La usa `ChainNotice` en el celular y desde 1101 px, y el catálogo.
 */
export function ChainLine({ rows, focus, done = false, still = false, onPick }: Pick<ChainNoticeProps, 'rows' | 'focus' | 'done' | 'onPick'> & { /** Sin movimiento (el catálogo). */ still?: boolean }) {
  const listId = useId()
  const row = rows[focus] ?? rows[rows.length - 1]

  if (!row) return null
  return (
    <div data-testid="chain-notice" data-chain-line="" className="grid h-full grid-cols-[minmax(0,1fr)_auto] border border-border-subtle bg-card-background/88">
      <div className="flex min-h-0 flex-col">
        <p role="status" className="m-0 flex min-w-0 items-center gap-1.5 px-2 pt-1 text-micro font-semibold leading-tight">
          <Icon name="link" size={14} className="shrink-0 text-info" aria-hidden="true" />
          <span className="shrink-0">{t('auto.chain.count', { count: rows.length })}</span>
          {/* Lo anuncia el lector de pantalla al cambiar («CL3 · Destierra 1 carta», «CL2 · Negada por Ash Blossom»): con movimiento reducido es lo que dice qué pasó. */}
          <span className="truncate text-info">{`${t('auto.link.badge', { numbers: row.number })} · ${stateLabel(row, rows.find((link) => link.number === row.by)?.name)}`}</span>
        </p>
        <ChainLinks id={listId} rows={rows} done={done} still={still} onPick={onPick} className="flex-1" />
      </div>
      <ChainLesson />
    </div>
  )
}

/**
 * La cadena del duelo automático («Jugar solo» y el duelo por enlace). La pone la mesa en `duel.chain`.
 * - **En el celular y desde 1101 px** va en la línea de alto fijo debajo del campo (`ChainLine`): el campo y la mano no se mueven cuando aparece o se va.
 * - **De 640 a 1100 px** (`compact`) es `ChainSheet`, una hoja de abajo que se arrastra (una cinta de chips y, subida, la pila); con una pregunta abierta, la mesa la acorta a lo que queda
 *   (`data-chain-list`) y, sin lugar ni para un eslabón, queda en su resumen (`data-squeezed`) hasta que se conteste.
 * - **El color del dueño** (violeta claro lo tuyo, lima lo del rival: el de las vidas, `PLAYER_COLOR`) va en la etiqueta del número. No se confunde con la lima de lo que se resuelve, que es un
 *   **aro** (forma distinta, mismo significado de siempre).
 * - **Tocar un eslabón** (`onPick`) lo muestra para leerlo. El ⓘ abre «Cómo se resuelve» (`ChainLesson`), la letra chica de la cadena; abierto, la retiene (`onReading`).
 * - El ritmo, cuándo aparece y cuándo se va lo decide quien la usa (`use-auto-asks.tsx`); acá sólo se dibuja. Terminada la cadena se va sola (`CHAIN_LINGER_MS` después del último toque).
 * - Accesibilidad: el resumen es un `status` (lo lee el lector de pantalla cuando cambia). No hacer: taparla con otra cosa ni ponerle velo.
 * - `open` y `onOpenChange` quedan de la pila flotante de escritorio: la línea no se pliega.
 */
export function ChainNotice({ rows, focus, resolving, done = false, compact = false, onReading, onPick }: ChainNoticeProps) {
  const phone = useMediaQuery(COMPACT_FIELD_MEDIA_QUERY)
  const row = rows[focus] ?? rows[rows.length - 1]
  // Leer «Cómo se resuelve» la retiene (no se va sola al terminar la cadena) hasta cerrar la hoja: es lo único que la retiene; tocar un eslabón sólo le da otro rato.
  const reading = (on: boolean) => onReading?.(on)

  if (!row) return null
  // El trazo de la cadena en la mesa, en los tres tamaños (va por portal, adentro del campo).
  const trace = <ChainTrace rows={rows} done={done} />

  // El celular en vertical (`phoneDuelLayout`) y desde 1101 px: la pila va adentro de la línea, de alto fijo (no en una hoja aparte ni flotando arriba del campo).
  if (phone || !compact)
    return (
      <ChainLessonReading value={reading}>
        {trace}
        <ChainLine rows={rows} focus={focus} done={done} onPick={onPick} />
      </ChainLessonReading>
    )
  // De 640 a 1100 px: la hoja de abajo (`ChainSheet`).
  return (
    <ChainLessonReading value={reading}>
      {trace}
      <ChainSheet rows={rows} focus={focus} resolving={resolving} onPick={onPick} />
    </ChainLessonReading>
  )
}
