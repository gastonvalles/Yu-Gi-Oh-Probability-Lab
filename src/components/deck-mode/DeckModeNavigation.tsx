import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { type DeckModeNavigationItem, type DeckWorkflowStepKey } from './deck-workflow-navigation'

interface DeckModeNavigationProps {
  items: DeckModeNavigationItem[]
  activeStep: DeckWorkflowStepKey
  onStepChange: (step: DeckWorkflowStepKey) => void
}

const TAB_BASE =
  'group flex min-w-0 items-center gap-2.5 rounded-control px-3 py-1.5 text-left transition-[background-color,color] duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none'

export function DeckModeNavigation({ items, activeStep, onStepChange }: DeckModeNavigationProps) {
  return (
    <nav aria-label="Pasos de la app" className="flex min-w-0 items-center gap-1">
      {items.map((item) => {
        const isActive = item.key === activeStep

        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? 'step' : undefined}
            title={`${item.title}: ${item.detail}`}
            className={cx(TAB_BASE, isActive ? 'bg-lavender text-success' : 'text-muted hover:bg-tint/5 hover:text-foreground')}
            onClick={() => onStepChange(item.key)}
          >
            <Icon
              name={item.icon}
              size={24}
              variant={isActive ? 'bold' : 'bulk'}
              className={cx('shrink-0 transition-colors duration-150 [--icon-cut:var(--lavender)]', isActive ? 'text-success drop-shadow-[0_0_8px_rgb(var(--success-rgb)/0.55)]' : 'text-primary-soft/60 group-hover:text-primary-soft')}
            />
            <span className={cx('truncate text-body', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
