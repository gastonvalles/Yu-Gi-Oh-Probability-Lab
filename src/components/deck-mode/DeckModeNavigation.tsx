import {
  DECK_WORKFLOW_TONE_LABEL,
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
    <aside className="surface-panel grid h-full w-full content-start p-3 min-[1101px]:min-h-0">
      <div className="grid h-full content-start gap-3 min-[1101px]:min-h-0">
        <nav
          aria-label="Pasos del workflow"
          className="grid content-start gap-2 max-[1079px]:grid-cols-2 max-[719px]:grid-cols-1"
        >
          {items.map((item) => {
            const isActive = item.key === activeStep

            return (
              <button
                key={item.key}
                type="button"
                aria-current={isActive ? 'step' : undefined}
                aria-pressed={isActive}
                data-active={isActive ? 'true' : 'false'}
                data-tone={item.tone}
                className="workflow-step-button grid w-full gap-2 p-2.5 text-left"
                onClick={() => onStepChange(item.key)}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={[
                      'grid h-6 min-w-6 place-items-center px-1 text-[0.68rem] font-semibold leading-none',
                      isActive || item.tone === 'complete' ? 'app-chip-accent' : 'app-chip',
                    ].join(' ')}
                  >
                    {item.step}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-[0.84rem] text-(--text-main)">{item.title}</strong>
                      <small className="app-muted shrink-0 text-[0.64rem] uppercase tracking-widest">
                        {DECK_WORKFLOW_TONE_LABEL[item.tone]}
                      </small>
                    </div>

                    <p className="app-muted m-[0.2rem_0_0] text-[0.74rem] leading-[1.14]">
                      {item.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  <strong className="text-[0.8rem] text-(--text-main)">{item.metric}</strong>
                  <small className="app-soft text-right text-[0.7rem] leading-[1.14]">
                    {item.detail}
                  </small>
                </div>
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
