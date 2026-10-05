import type { PatternKind } from '../../types'
import { cx } from '../ui/cx'

/** Etiqueta "Salida" / "Problema" de una regla. */
export function KindBadge({ kind }: { kind: PatternKind }) {
  return (
    <span
      className={cx(
        'flex-none rounded-[0.3rem] px-[0.32rem] py-[0.05rem] text-[0.62rem] font-bold uppercase tracking-[0.04em]',
        kind === 'opening' ? 'bg-success/14 text-accent' : 'bg-danger/14 text-[#fca5a5]',
      )}
    >
      {kind === 'opening' ? 'Salida' : 'Problema'}
    </span>
  )
}
