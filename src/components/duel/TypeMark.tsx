import { FRAME_FILL, FRAME_OUTLINE, type FrameKind } from '../../app/card-frame'
import { cx } from '../ui/cx'

/**
 * La marca del tipo de una carta en un registro (la última jugada, «Qué hizo el bot y por qué»): una ficha chica con el color de su marco (`frameKindOf`, lámina T), con el aro claro que ya usan los colores
 * oscuros. Sin texto: va junto al nombre, que ya lo dice (`aria-hidden`).
 */
export function TypeMark({ kind, className }: { kind: FrameKind; className?: string }) {
  return <i aria-hidden="true" data-type-mark={kind} className={cx('inline-block h-3 w-2 shrink-0', FRAME_FILL[kind], FRAME_OUTLINE, className)} />
}
