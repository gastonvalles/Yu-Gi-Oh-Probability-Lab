import { useState } from 'react'

import { readSavedCombos, writeSavedCombos, type SavedCombo } from '../../app/saved-combos'
import { showToastMessage } from '../../app/use-toast-message'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SavedCombosList } from './PracticeMatPanel'

/** Desde la mano: abre la lista de combos guardados para reproducir uno en la mesa sin jugar antes. */
export function SavedCombosButton({ onLoad }: { onLoad: (combo: SavedCombo) => void }) {
  const [combos, setCombos] = useState<SavedCombo[] | null>(null)

  const remove = (combo: SavedCombo) => {
    const next = (combos ?? []).filter((entry) => entry.id !== combo.id)
    writeSavedCombos(next)
    setCombos(next)
    showToastMessage(`Borraste “${combo.name}”.`, 'warning')
  }

  return (
    <>
      <IconButton tone="flat" size="md" aria-label="Combos guardados" title="Combos guardados" onClick={() => setCombos(readSavedCombos())}>
        <Icon name="list" />
      </IconButton>
      <Modal isOpen={combos !== null} onClose={() => setCombos(null)} size="md" kicker="Mesa" title="Combos guardados">
        <SavedCombosList combos={combos ?? []} deckName="" onLoad={onLoad} onDelete={remove} />
      </Modal>
    </>
  )
}
