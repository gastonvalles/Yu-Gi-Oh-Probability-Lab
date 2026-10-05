import { cx } from '../ui/cx'
import {
  type DeckModeNavigationItem,
  type DeckWorkflowStepKey,
} from './deck-workflow-navigation'

interface DeckModeNavigationProps {
  items: DeckModeNavigationItem[]
  activeStep: DeckWorkflowStepKey
  onStepChange: (step: DeckWorkflowStepKey) => void
}

const STEP_BASE =
  'flex min-w-0 items-center justify-center border px-[0.85rem] py-[0.68rem] text-foreground transition-[border-color,background,box-shadow,opacity] duration-150 focus-visible:shadow-[0_0_0_2px_rgb(var(--background-rgb)),0_0_0_4px_rgb(var(--primary-rgb)/0.34)] focus-visible:outline-none motion-reduce:transition-none'

export function DeckModeNavigation({
  items,
  activeStep,
  onStepChange,
}: DeckModeNavigationProps) {
  return (
    <nav aria-label="Pasos de la app" className="grid w-[min(100%,72rem)] min-w-0 grid-cols-5 gap-[0.55rem]">
      {items.map((item) => {
        const isActive = item.key === activeStep

        return (
          <button
            key={item.key}
            type="button"
            aria-current={isActive ? 'step' : undefined}
            aria-pressed={isActive}
            className={cx(
              STEP_BASE,
              isActive
                ? 'border-primary/82 bg-linear-to-b from-primary/16 to-card-background/96 shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_0_0_1px_rgb(var(--primary-rgb)/0.14)]'
                : 'border-border bg-linear-to-b from-secondary/94 to-background/98 hover:border-primary/42 hover:from-primary/8 hover:to-background/98',
              item.disabled && 'opacity-76',
            )}
            onClick={() => onStepChange(item.key)}
          >
            <span className="truncate text-[0.88rem] font-bold leading-none">{item.title}</span>
          </button>
        )
      })}
    </nav>
  )
}
