import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { type DeckModeNavigationItem, type DeckWorkflowStepKey, type DeckWorkflowStepTone } from './deck-workflow-navigation'

interface DeckModeNavigationProps {
  items: DeckModeNavigationItem[]
  activeStep: DeckWorkflowStepKey
  onStepChange: (step: DeckWorkflowStepKey) => void
}

/** Punto de estado de cada paso: verde = listo, ámbar = a medio hacer, sin punto = todavía no. */
const STATUS_DOT: Record<DeckWorkflowStepTone, string> = {
  complete: 'bg-success',
  progress: 'bg-warning',
  pending: 'bg-tint/20',
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
            className={cx(TAB_BASE, isActive ? 'bg-lavender text-foreground' : 'text-muted hover:bg-tint/5 hover:text-foreground')}
            onClick={() => onStepChange(item.key)}
          >
            <Icon
              name={item.icon}
              size={24}
              variant={isActive ? 'bold' : 'bulk'}
              className={cx('shrink-0 transition-colors duration-150 [--icon-cut:var(--lavender)]', isActive ? 'text-primary-soft' : 'text-primary-soft/60 group-hover:text-primary-soft')}
            />
            <span className="grid min-w-0 leading-tight">
              <span className={cx('truncate text-body', isActive ? 'font-semibold' : 'font-medium')}>{item.label}</span>
              {item.metric ? (
                <span className="flex items-center gap-1.5 text-micro tabular-nums text-soft">
                  <span className={cx('size-1.5 shrink-0 rounded-full', STATUS_DOT[item.tone])} aria-hidden="true" />
                  <span className="truncate">{item.metric}</span>
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
