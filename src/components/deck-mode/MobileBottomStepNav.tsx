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

export function MobileBottomStepNav({ items, activeStep, onStepChange }: MobileBottomStepNavProps) {
  const [optimisticStep, setOptimisticStep] = useState<DeckWorkflowStepKey | null>(null)

  useEffect(() => {
    setOptimisticStep(null)
  }, [activeStep])

  const highlightedStep = optimisticStep ?? activeStep
  const renderStep = (item: DeckModeNavigationItem) => {
    const isActive = item.key === highlightedStep
    const statusLabel = DECK_WORKFLOW_TONE_LABEL[item.tone]

    // Misma regla que en desktop: todos los pasos se pueden abrir; cada paso explica qué le falta.
    // (Antes el botón quedaba deshabilitado y el motivo sólo salía en un tooltip, que en táctil no existe.)
    return (
      <button
        key={item.key}
        type="button"
        aria-current={isActive ? 'step' : undefined}
        aria-label={`${item.title}. ${statusLabel}. ${item.detail}`}
        className="group relative grid min-w-0 content-center justify-items-center gap-1 rounded-control px-1 pb-1 pt-1.5 transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus"
        title={`${item.title}: ${item.detail}`}
        onClick={() => {
          setOptimisticStep(item.key)
          onStepChange(item.key)
        }}
      >
        <span className="relative grid h-7 place-items-center" aria-hidden="true">
          <Icon
            name={item.icon}
            size={24}
            variant={isActive ? 'bold' : 'bulk'}
            className={cx('transition-colors duration-150 [--icon-cut:var(--lavender)]', isActive ? 'text-success drop-shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]' : 'text-primary-soft/55 group-hover:text-primary-soft')}
          />
        </span>
        <span className={cx('min-w-0 whitespace-nowrap text-center text-micro max-[400px]:text-[0.625rem]', isActive ? 'font-semibold text-success' : 'font-medium text-soft')}>{item.label}</span>
      </button>
    )
  }

  return (
    <nav
      aria-label="Pasos del workflow"
      className="fixed inset-x-0 bottom-0 z-120 rounded-t-panel bg-lavender pb-[calc(env(safe-area-inset-bottom,0px)+0.25rem)] pl-[calc(env(safe-area-inset-left,0px)+0.5rem)] pr-[calc(env(safe-area-inset-right,0px)+0.5rem)] pt-1.5 shadow-[0_-10px_28px_rgb(0_0_0/0.45)]"
    >
      <div className="grid min-h-[var(--deck-mobile-step-nav-height,4.3rem)] auto-cols-fr grid-flow-col gap-0.5">{items.map(renderStep)}</div>
    </nav>
  )
}
