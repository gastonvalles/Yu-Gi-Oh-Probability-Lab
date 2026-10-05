import { useEffect, useState, type SVGProps } from 'react'

import { cx } from '../ui/cx'
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

// Pasos que llevan un punto de aviso mientras están a medio completar.
const ATTENTION_STEPS = new Set<DeckWorkflowStepKey>(['deck-builder', 'categorization'])

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

function WorkspaceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M4.75 8.25v10.5h14.5V8.25" strokeWidth="1.8" />
      <path d="M3.5 5.25h17v3h-17z" strokeWidth="1.8" />
      <path d="M9.5 12.25h5" strokeWidth="1.8" strokeLinecap="square" />
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

  if (step === 'workspace') {
    return <WorkspaceIcon />
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
  const renderStep = (item: DeckModeNavigationItem) => {
    const isActive = item.key === highlightedStep
    const isDisabled = item.disabled && !isActive
    const statusLabel = DECK_WORKFLOW_TONE_LABEL[item.tone]
    const needsAttention = !isActive && item.tone === 'progress' && ATTENTION_STEPS.has(item.key)

    return (
      <button
        key={item.key}
        type="button"
        aria-current={isActive ? 'step' : undefined}
        aria-disabled={isDisabled || undefined}
        aria-label={`${item.title}. ${statusLabel}. ${item.metric}.`}
        className={cx(
          'group relative grid min-w-0 content-center justify-items-center gap-[0.18rem] border border-transparent bg-transparent px-[0.2rem] pb-[0.24rem] pt-[0.32rem] text-foreground/96 transition-[color,opacity] duration-160 hover:text-foreground focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--accent-rgb)/0.24)] focus-visible:outline-none disabled:cursor-not-allowed',
          isDisabled && 'text-soft opacity-42',
        )}
        disabled={isDisabled}
        title={isDisabled ? `${item.title}: ${item.detail}` : item.title}
        onClick={() => {
          setOptimisticStep(item.key)
          onStepChange(item.key)
        }}
      >
        <span
          className={cx(
            'relative grid h-7 w-[3.1rem] place-items-center rounded-full transition-[color,background] duration-160 [&_svg]:size-full [&_svg]:max-w-[1.6rem] [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]',
            isActive && 'bg-accent/14 text-accent [filter:drop-shadow(0_0_0.32rem_rgb(var(--accent-rgb)/0.18))]',
          )}
          aria-hidden="true"
        >
          <StepIcon step={item.key} />
          {needsAttention ? <span className="absolute right-[0.55rem] top-[0.1rem] size-2 rounded-full border-2 border-background bg-warning" /> : null}
        </span>
        <span
          className={cx(
            'min-w-0 whitespace-nowrap text-center text-[0.69rem] font-bold leading-[1.1] tracking-[0.01em] transition-[color,text-shadow] duration-160',
            isActive && 'text-accent [text-shadow:0_0_0.3rem_rgb(var(--accent-rgb)/0.14)]',
          )}
        >
          {item.shortTitle}
        </span>
      </button>
    )
  }
  return (
    <nav
      aria-label="Pasos del workflow"
      className="fixed inset-x-0 bottom-0 z-120 border-t border-border/96 bg-linear-to-b from-secondary/92 to-background/98 pb-[calc(env(safe-area-inset-bottom,0px)+0.35rem)] pl-[calc(env(safe-area-inset-left,0px)+0.35rem)] pr-[calc(env(safe-area-inset-right,0px)+0.35rem)] pt-[0.24rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_-14px_32px_rgba(0,0,0,0.34)]"
    >
      <div className="grid min-h-[var(--deck-mobile-step-nav-height,4.3rem)] auto-cols-fr grid-flow-col gap-[0.1rem]">
        {items.map(renderStep)}
      </div>
    </nav>
  )
}
