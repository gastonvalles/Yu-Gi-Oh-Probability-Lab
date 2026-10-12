import type { PatternKind } from '../../types'
import { Badge } from '../ui/Badge'
import { kindLabel } from './lab-copy'

/** Etiqueta "Salida" / "Problema" de una regla. */
export function KindBadge({ kind }: { kind: PatternKind }) {
  return (
    <Badge tone={kind === 'opening' ? 'success' : 'danger'} shape="tag" size="sm">
      {kindLabel(kind)}
    </Badge>
  )
}
