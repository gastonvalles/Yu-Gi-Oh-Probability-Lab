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
        <strong className="text-foreground">{deckCopy.copies}</strong>{' '}
        {deckCopy.copies === 1 ? 'copia' : 'copias'} en {deckCopy.zoneLabel}
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="secondary" color="danger" size="sm" fullWidth icon="minus" className="whitespace-nowrap" onClick={deckCopy.onRemoveCopy}>
          Quitar una
        </Button>
        <Button variant="primary" size="sm" fullWidth icon="plus" className="whitespace-nowrap" disabled={!deckCopy.canAddCopy} onClick={deckCopy.onAddCopy}>
          Sumar una
        </Button>
      </div>
    </div>
  )
}
