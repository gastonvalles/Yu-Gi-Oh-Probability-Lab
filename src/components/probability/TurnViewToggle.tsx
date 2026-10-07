import type { TurnView } from '../../types'
import { Segmented, type SegmentedOption } from '../ui/Segmented'

interface TurnViewToggleProps {
  activeView: TurnView
  onChange: (nextView: TurnView) => void
  /** Texto secundario por opción (p. ej. "5 cartas · 57%"). */
  details?: Partial<Record<TurnView, string>>
}

const OPTIONS: ReadonlyArray<{ value: TurnView; label: string }> = [
  { value: 'first', label: 'Primero' },
  { value: 'second', label: 'Segundo' },
  { value: 'average', label: 'Promedio' },
]

/** Selector de turno del Probability Lab: cambia qué mano se analiza (5 o 6 cartas). */
export function TurnViewToggle({ activeView, onChange, details }: TurnViewToggleProps) {
  const options: SegmentedOption<TurnView>[] = OPTIONS.map((option) => ({ ...option, detail: details?.[option.value] }))

  return <Segmented label="Vista de turno" value={activeView} onChange={onChange} options={options} fullWidth className="max-w-[34rem]" />
}
