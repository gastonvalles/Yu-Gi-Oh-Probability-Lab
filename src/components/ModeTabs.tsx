import type { CalculatorMode } from '../app/model'
import { Button } from './ui/Button'

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
        <Button
          key={entry.mode}
          variant={mode === entry.mode ? 'primary' : 'secondary'}
          size="md"
          className="min-w-[96px]"
          onClick={() => onChange(entry.mode)}
        >
          {entry.label}
        </Button>
      ))}
    </section>
  )
}
