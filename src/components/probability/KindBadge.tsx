import type { PatternKind } from '../../types'
import { Badge } from '../ui/Badge'
import { kindLabel } from './lab-copy'

/** Etiqueta "Salida" / "Problema" de una regla: llena, verde o roja con el texto blanco (el mismo color que su opción elegida en «Qué es»). */
export function KindBadge({ kind }: { kind: PatternKind }) {
  return (
    <Badge tone={kind === 'opening' ? 'success' : 'danger'} shape="tag" size="sm" solid>
      {kindLabel(kind)}
    </Badge>
  )
}
