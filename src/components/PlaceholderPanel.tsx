import type { CalculatorMode } from '../app/model'
import { ModeTabs } from './ModeTabs'

interface PlaceholderPanelProps {
  mode: CalculatorMode
  onModeChange: (mode: CalculatorMode) => void
  title: string
  description: string
}

export function PlaceholderPanel({ mode, onModeChange, title, description }: PlaceholderPanelProps) {
  return (
    <section className="grid gap-3">
      <article className="surface-panel p-4">
        <div className="mb-3 flex items-start justify-between gap-3 max-[820px]:flex-col max-[820px]:items-stretch">
          <div>
            <p className="app-kicker m-0 mb-1 text-[0.72rem] uppercase tracking-[0.1em]">En preparación</p>
            <h2 className="m-0 text-[1.15rem] leading-[1.1]">{title}</h2>
          </div>
          <ModeTabs mode={mode} onChange={onModeChange} />
        </div>

        <div>
          <p className="surface-card p-3 text-[var(--text-muted)]">{description}</p>
        </div>
      </article>
    </section>
  )
}
