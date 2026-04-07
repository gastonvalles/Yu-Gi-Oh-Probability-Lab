import { useEffect, useState, type SVGProps } from 'react'

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
      <g transform="rotate(-16 7.2 12)">
        <rect x="4.2" y="6.1" width="6.6" height="10.5" rx="1.1" strokeWidth="1.55" />
        <rect x="5" y="6.95" width="5" height="8.8" rx="0.82" strokeWidth="1.2" />
      </g>
      <g>
        <rect x="8.7" y="4.65" width="6.8" height="11.2" rx="1.12" strokeWidth="1.65" />
        <rect x="9.55" y="5.55" width="5.1" height="9.4" rx="0.86" strokeWidth="1.2" />
        <ellipse cx="12.1" cy="10.25" rx="1.45" ry="2.45" strokeWidth="1.15" />
      </g>
      <g transform="rotate(16 16.8 12)">
        <rect x="13.5" y="6.1" width="6.6" height="10.5" rx="1.1" strokeWidth="1.55" />
        <rect x="14.3" y="6.95" width="5" height="8.8" rx="0.82" strokeWidth="1.2" />
      </g>
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
  const [optimisticStep, setOptimisticStep] = useState<DeckWorkflowStepKey | null>(null)

  useEffect(() => {
    setOptimisticStep(null)
  }, [activeStep])

  const highlightedStep = optimisticStep ?? activeStep

  return (
    <nav aria-label="Pasos del workflow" className="mobile-step-nav">
      <div className="mobile-step-nav-grid">
        {items.map((item) => {
          const isActive = item.key === highlightedStep
          const isDisabled = item.disabled && !isActive
          const statusLabel = DECK_WORKFLOW_TONE_LABEL[item.tone]

          return (
            <button
              key={item.key}
              type="button"
              aria-current={isActive ? 'step' : undefined}
              aria-pressed={isActive}
              aria-disabled={isDisabled || undefined}
              aria-label={`${item.title}. ${statusLabel}. ${item.metric}.`}
              data-active={isActive ? 'true' : 'false'}
              data-tone={item.tone}
              data-disabled={isDisabled ? 'true' : 'false'}
              className={['mobile-step-nav-item', isActive ? 'mobile-step-nav-item-active' : ''].join(' ').trim()}
              disabled={isDisabled}
              title={isDisabled ? `${item.title}: ${item.detail}` : item.title}
              onClick={() => {
                setOptimisticStep(item.key)
                onStepChange(item.key)
              }}
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
