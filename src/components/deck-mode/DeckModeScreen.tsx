import { DeckRolesPanel } from '../DeckRolesPanel'
import { ExportDeckPanel } from '../ExportDeckPanel'
import { HoverPreview } from '../HoverPreview'
import { ProbabilityPanel } from '../ProbabilityPanel'
import { DeckBuilderStep } from './DeckBuilderStep'
import { DeckModeDragOverlay } from './DeckModeDragOverlay'
import { useDeckModeController } from './use-deck-mode-controller'

export function DeckModeScreen() {
  const controller = useDeckModeController()

  return (
    <>
      <section className="grid gap-3">
        <DeckBuilderStep {...controller.deckBuilderStep} />

        <div id="step2" className="mx-auto w-full max-w-[1240px]">
          <DeckRolesPanel {...controller.roles} />
        </div>

        <div id="step3">
          <ProbabilityPanel {...controller.probability} />
        </div>

        <div id="step4" className="mx-auto w-full max-w-[1240px]">
          <ExportDeckPanel {...controller.exportDeck} />
        </div>
      </section>

      <HoverPreview preview={controller.feedback.hoverPreview} />
      <DeckModeDragOverlay
        overlay={controller.feedback.dragOverlay}
        overlayRef={controller.feedback.dragOverlayRef}
      />
    </>
  )
}
