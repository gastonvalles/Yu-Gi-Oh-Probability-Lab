import { t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { Button } from '../ui/Button'

/** Acciones sobre una carta que ya está en el deck (se abre tocándola en una zona). */
export interface DeckCopyActions {
  zoneLabel: string
  copies: number
  canAddCopy: boolean
  onRemoveCopy: () => void
  onAddCopy: () => void
}

export function DeckCopyControls({ deckCopy }: { deckCopy: DeckCopyActions }) {
  return (
    <div className="grid gap-2">
      <p className="m-0 text-center text-body text-muted" aria-live="polite">
        {tRich('search.copies.inZone', { b: (text) => <strong className="text-foreground">{text}</strong> }, { count: deckCopy.copies, zone: deckCopy.zoneLabel })}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" color="danger" size="sm" fullWidth icon="minus" className="whitespace-nowrap" onClick={deckCopy.onRemoveCopy}>
          {t('search.copies.removeOne')}
        </Button>
        <Button variant="primary" size="sm" fullWidth icon="plus" className="whitespace-nowrap" disabled={!deckCopy.canAddCopy} onClick={deckCopy.onAddCopy}>
          {t('search.copies.addOne')}
        </Button>
      </div>
    </div>
  )
}
