import { t, type MessageKey } from '../../i18n'
import type { TurnView } from '../../types'
import { Segmented, type SegmentedOption } from '../ui/Segmented'

interface TurnViewToggleProps {
  activeView: TurnView
  onChange: (nextView: TurnView) => void
  /** Texto secundario por opción (p. ej. "5 cartas · 57%"). */
  details?: Partial<Record<TurnView, string>>
}

// Las opciones guardan claves de mensajes, no textos: el texto se arma al dibujar, en el idioma de ese momento.
const OPTIONS = [
  { value: 'first', label: 'lab.turnView.first' },
  { value: 'second', label: 'lab.turnView.second' },
  { value: 'average', label: 'lab.turnView.average' },
] as const satisfies ReadonlyArray<{ value: TurnView; label: MessageKey }>

/** Selector de turno del Probability Lab: cambia qué mano se analiza (5 o 6 cartas). */
export function TurnViewToggle({ activeView, onChange, details }: TurnViewToggleProps) {
  const options: SegmentedOption<TurnView>[] = OPTIONS.map((option) => ({ value: option.value, label: t(option.label), detail: details?.[option.value] }))

  return <Segmented label={t('lab.turnView.label')} value={activeView} onChange={onChange} options={options} variant="cards" fullWidth className="max-w-[34rem]" />
}
