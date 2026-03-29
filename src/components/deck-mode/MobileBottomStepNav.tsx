import type { SVGProps } from 'react'

import {
  DECK_WORKFLOW_TONE_LABEL,
  type DeckModeNavigationItem,
  type DeckWorkflowStepKey,
} from './deck-workflow-navigation'

interface MobileBottomStepNavProps {
  items: DeckModeNavigationItem[]
  activeStep: DeckWorkflowStepKey
  onStepChange: (step: DeckWorkflowStepKey) => void
}

function DeckBuilderIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <rect
        x="2.75"
        y="6.6"
        width="8.2"
        height="11.2"
        rx="1.15"
        transform="rotate(-18 2.75 6.6)"
        strokeWidth="1.8"
      />
      <rect
        x="7.9"
        y="4.35"
        width="8.2"
        height="11.2"
        rx="1.15"
        strokeWidth="1.8"
      />
      <rect
        x="12.85"
        y="5.2"
        width="8.2"
        height="11.2"
        rx="1.15"
        transform="rotate(18 12.85 5.2)"
        strokeWidth="1.8"
      />
    </svg>
  )
}

function CategorizationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4.75 6.25h14.5v14.5H4.75z" strokeWidth="1.8" />
      <path d="M4.75 10.75h14.5M9.25 6.25v14.5" strokeWidth="1.8" />
      <path d="M13 4.75h2.75v2.5H13z" strokeWidth="1.8" />
    </svg>
  )
}

function ProbabilityLabIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M8.25 4.75h7.5" strokeWidth="1.8" />
      <path d="M10 4.75v3.8l-3.55 6.05A2.1 2.1 0 0 0 8.25 17.75h7.5a2.1 2.1 0 0 0 1.8-3.15L14 8.55v-3.8" strokeWidth="1.8" />
      <path d="M9.45 13.9v1.95M12 11.9v3.95M14.55 12.95v2.9" strokeWidth="1.8" />
      <path d="M8.75 14.9h6.5" strokeWidth="1.8" />
    </svg>
  )
}

function ExportIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M12 4.5v9.25" strokeWidth="1.8" strokeLinecap="square" />
      <path d="m8.5 10.5 3.5 3.5 3.5-3.5" strokeWidth="1.8" strokeLinecap="square" />
      <path d="M5.5 18.5h13" strokeWidth="1.8" strokeLinecap="square" />
    </svg>
  )
}

function StepIcon({ step }: { step: DeckWorkflowStepKey }) {
  if (step === 'deck-builder') {
    return <DeckBuilderIcon />
  }

  if (step === 'categorization') {
    return <CategorizationIcon />
  }

  if (step === 'probability-lab') {
    return <ProbabilityLabIcon />
  }

  return <ExportIcon />
}

export function MobileBottomStepNav({
  items,
  activeStep,
  onStepChange,
}: MobileBottomStepNavProps) {
  return (
    <nav aria-label="Pasos del workflow" className="mobile-step-nav">
      <div className="mobile-step-nav-grid">
        {items.map((item) => {
          const isActive = item.key === activeStep
          const isDisabled = item.disabled && !isActive
          const statusLabel = DECK_WORKFLOW_TONE_LABEL[item.tone]

          return (
            <button
              key={item.key}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              aria-disabled={isDisabled || undefined}
              aria-label={`${item.title}. ${statusLabel}. ${item.metric}.`}
              data-active={isActive ? 'true' : 'false'}
              data-tone={item.tone}
              data-disabled={isDisabled ? 'true' : 'false'}
              className="mobile-step-nav-item"
              disabled={isDisabled}
              title={isDisabled ? `${item.title}: ${item.detail}` : item.title}
              onClick={() => onStepChange(item.key)}
            >
              <span className="mobile-step-nav-icon" aria-hidden="true">
                <StepIcon step={item.key} />
              </span>
              <span className="mobile-step-nav-label">{item.shortTitle}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
