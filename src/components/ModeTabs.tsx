import type { CalculatorMode } from '../app/model'

const MODES: Array<{ mode: CalculatorMode; label: string }> = [
  { mode: 'deck', label: 'Auto' },
  { mode: 'manual', label: 'Manual' },
  { mode: 'gambling', label: 'Gambling' },
]

interface ModeTabsProps {
  mode: CalculatorMode
  onChange: (mode: CalculatorMode) => void
  className?: string
}

export function ModeTabs({ mode, onChange, className = '' }: ModeTabsProps) {
  return (
    <section className={['flex flex-wrap gap-2', className].join(' ').trim()}>
      {MODES.map((entry) => (
        <button
          key={entry.mode}
          type="button"
          className={[
            'border border-[#2f2f2f] bg-[#101010] px-3 py-1.5 text-sm text-[#f0f0f0]',
            mode === entry.mode ? 'border-white text-white' : '',
          ].join(' ')}
          onClick={() => onChange(entry.mode)}
        >
          {entry.label}
        </button>
      ))}
    </section>
  )
}
