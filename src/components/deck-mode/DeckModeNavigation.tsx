import {
  type DeckModeNavigationItem,
  type DeckWorkflowStepKey,
} from './deck-workflow-navigation'

interface DeckModeNavigationProps {
  items: DeckModeNavigationItem[]
  activeStep: DeckWorkflowStepKey
  onStepChange: (step: DeckWorkflowStepKey) => void
}

export function DeckModeNavigation({
  items,
  activeStep,
  onStepChange,
}: DeckModeNavigationProps) {
  return (
    <nav aria-label="Pasos de la app" className="deck-mode-topbar-nav">
      {items.map((item) => {
        const isActive = item.key === activeStep

        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? 'step' : undefined}
            aria-pressed={isActive}
            data-active={isActive ? 'true' : 'false'}
            data-disabled={item.disabled ? 'true' : 'false'}
            className="deck-mode-topbar-step"
            onClick={() => onStepChange(item.key)}
          >
            <span className="deck-mode-topbar-step-index">{item.step}</span>
            <span className="deck-mode-topbar-step-label">{item.title}</span>
          </button>
        )
      })}
    </nav>
  )
}
