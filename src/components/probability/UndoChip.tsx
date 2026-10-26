import { useEffect, useState } from 'react'

import { cardImageSrc } from '../../app/card-image-source'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/** Cuánto se ve el aviso de «Deshacer» después de una activación. */
export const UNDO_CHIP_MS = 6000

/** La activación que se puede deshacer: `key` cambia con cada una (el aviso vuelve a contar); `art`, el arte de su carta. */
export interface UndoPlay {
  key: number
  art: string | null
}

/** La jugada mientras dura su aviso (`UNDO_CHIP_MS` desde que llegó); null después o sin jugada. Lo demás (si todavía se puede deshacer) lo mira quien la muestra. */
export function useUndoPlay<P extends UndoPlay>(play: P | null): P | null {
  const [over, setOver] = useState<number | null>(null)
  const key = play?.key

  useEffect(() => {
    if (key === undefined) return
    const timer = window.setTimeout(() => setOver(key), UNDO_CHIP_MS)

    return () => window.clearTimeout(timer)
  }, [key])

  return play && over !== play.key ? play : null
}

/**
 * El aviso de que lo que acabás de activar se puede deshacer: el arte chico de la carta (sin arte, el ícono) y «Deshacer», un solo botón que hace lo mismo que el Deshacer de la barra (que sigue donde está).
 * Sin el nombre de la carta ni qué hace. Se va solo (`useUndoPlay`), con otra jugada o cuando ya no se puede deshacer; la mesa lo pone donde no tapa cartas. Sin velo, 44 px.
 */
export function UndoChip({ art, onUndo, className }: { art: string | null; onUndo: () => void; className?: string }) {
  return (
    <Button variant="secondary" data-undo-chip="" aria-label={t('practice.mat.undoPlay')} className={cx('whitespace-nowrap shadow-overlay animate-sheet-in motion-reduce:animate-none', className)} onClick={onUndo}>
      {/* El arte dice qué se deshace; sin arte, el ícono de Deshacer. Los dos no: el aviso entra junto a tus vidas en el celular. */}
      {art ? <img src={cardImageSrc(art)} alt="" draggable={false} className="h-7 w-5 rounded-tag object-cover" /> : <Icon name="undo" size={18} />}
      {t('practice.mat.undo')}
    </Button>
  )
}
