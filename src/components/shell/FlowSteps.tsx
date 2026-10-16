import { t } from '../../i18n'
import { cx } from '../ui/cx'
import type { NavGroup } from './nav-model'

interface FlowStepsProps {
  /** El grupo «Tu deck»: sus destinos son los pasos del flujo, en orden. */
  group: NavGroup
  activeKey: string | null
  onSelect: (key: string) => void
  className?: string
}

/**
 * La barra de pasos del flujo Deck → Roles → Lab → Comparar → Exportar: cinco segmentos, encendidos hasta el paso de ahora.
 * En el celular son sólo las barritas (el nombre del paso lo dice la pantalla; el lector de pantalla oye «Paso 2 de 5»); en escritorio, una fila con «1 · Deck»
 * que también lleva a cada paso. Se arma con los destinos del menú, así no tiene otra lista que mantener.
 */
export function FlowSteps({ group, activeKey, onSelect, className }: FlowStepsProps) {
  const current = group.items.findIndex((item) => item.key === activeKey)

  if (current === -1) {
    return null
  }

  const total = group.items.length
  const active = group.items[current]!

  return (
    <nav aria-label={t('shell.flow.label')} className={className}>
      <p className="sr-only" aria-live="polite">
        {t('shell.flow.progress', { step: current + 1, total, name: active.title })}
      </p>

      <div aria-hidden="true" className="grid h-1 grid-cols-5 gap-1 min-[1101px]:hidden">
        {group.items.map((item, index) => (
          <span key={item.key} className={index <= current ? 'bg-primary' : 'bg-surface-hover'} />
        ))}
      </div>

      <ol className="m-0 hidden list-none grid-cols-5 gap-2 p-0 min-[1101px]:grid">
        {group.items.map((item, index) => (
          <li key={item.key} className="min-w-0">
            <button
              type="button"
              aria-current={index === current ? 'step' : undefined}
              title={item.title}
              className="group grid w-full min-w-0 cursor-pointer gap-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus"
              onClick={() => onSelect(item.key)}
            >
              <i className={cx('block h-1', index <= current ? 'bg-primary' : 'bg-surface-hover')} />
              <span className={cx('truncate text-micro', index === current ? 'font-semibold text-foreground' : 'text-muted group-hover:text-foreground')}>
                {index + 1} · {item.label}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}
