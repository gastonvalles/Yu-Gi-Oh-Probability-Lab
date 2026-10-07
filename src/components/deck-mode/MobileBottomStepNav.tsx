import { useEffect, useState } from 'react'

import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
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

export function MobileBottomStepNav({ items, activeStep, onStepChange }: MobileBottomStepNavProps) {
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
          'group relative grid min-w-0 content-center justify-items-center gap-1 rounded-control px-1 pb-1 pt-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed',
          isActive ? 'text-foreground' : 'text-soft hover:text-foreground',
          isDisabled && 'opacity-40',
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
            'relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-150',
            isActive ? 'bg-primary/22 text-primary-soft' : 'group-hover:bg-white/5',
          )}
          aria-hidden="true"
        >
          <Icon name={item.icon} size={22} strokeWidth={isActive ? 2 : 1.75} />
          {needsAttention ? <span className="absolute right-3 top-0.5 size-2 rounded-full border-2 border-card-background bg-warning" /> : null}
        </span>
        <span className={cx('min-w-0 whitespace-nowrap text-center text-micro', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Pasos del workflow"
      className="fixed inset-x-0 bottom-0 z-120 border-t border-border-subtle bg-card-background pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pl-[calc(env(safe-area-inset-left,0px)+0.25rem)] pr-[calc(env(safe-area-inset-right,0px)+0.25rem)] pt-1 shadow-[0_-10px_28px_rgb(0_0_0/0.4)]"
    >
      <div className="grid min-h-[var(--deck-mobile-step-nav-height,4.3rem)] auto-cols-fr grid-flow-col gap-0.5">{items.map(renderStep)}</div>
    </nav>
  )
}
