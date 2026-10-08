import type { PatternKind } from '../../types'
import { Badge } from '../ui/Badge'

/** Etiqueta "Salida" / "Problema" de una regla. */
export function KindBadge({ kind }: { kind: PatternKind }) {
  return (
    <Badge tone={kind === 'opening' ? 'success' : 'danger'} shape="tag" size="sm">
      {kind === 'opening' ? 'Salida' : 'Problema'}
    </Badge>
  )
}
