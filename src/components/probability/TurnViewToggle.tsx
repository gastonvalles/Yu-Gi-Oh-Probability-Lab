import { t, type MessageKey } from '../../i18n'
import type { TurnView } from '../../types'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { Segmented, type SegmentedOption } from '../ui/Segmented'
import { judgeTone } from '../ui/tone'

interface TurnViewToggleProps {
  activeView: TurnView
  onChange: (nextView: TurnView) => void
  /** Manos buenas de cada turno (0 a 1): cada opción lleva su anillo; la elegida no lo repite (su número es el grande del veredicto). */
  values?: Partial<Record<TurnView, number>>
  /** Cuántas cartas tiene la mano de cada turno («5 y 6 cartas»): lo dice la opción elegida. */
  details?: Partial<Record<TurnView, string>>
}

// Las opciones guardan claves de mensajes, no textos: el texto se arma al dibujar, en el idioma de ese momento.
const OPTIONS = [
  { value: 'average', label: 'lab.turnView.average' },
  { value: 'first', label: 'lab.turnView.first' },
  { value: 'second', label: 'lab.turnView.second' },
] as const satisfies ReadonlyArray<{ value: TurnView; label: MessageKey }>

/** La lente del Lab: qué manos se miran (el promedio o cada turno). Cada opción con su anillo; la elegida, enmarcada en ámbar y con cuántas cartas tiene la mano. */
export function TurnViewToggle({ activeView, onChange, values, details }: TurnViewToggleProps) {
  const options: SegmentedOption<TurnView>[] = OPTIONS.map((option) => {
    const label = t(option.label)
    const value = values?.[option.value]
    const active = option.value === activeView

    return active || value === undefined
      ? { value: option.value, label, detail: active ? details?.[option.value] : undefined }
      : {
          value: option.value,
          label,
          ariaLabel: t('lab.turnView.option', { label, value: formatPer100(value) }),
          leading: <ProgressRing value={value} tone={judgeTone(true)} size={36} label={t('lab.turnView.option', { label, value: formatPer100(value) })} />,
        }
  })

  return <Segmented label={t('lab.turnView.label')} value={activeView} onChange={onChange} options={options} variant="lens" fullWidth />
}
