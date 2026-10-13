import { InfoTip } from '../../ui/InfoTip'
import { ProgressRing } from '../../ui/ProgressRing'
import { SegmentedRing } from '../../ui/SegmentedRing'
import { TONE, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const TONES = Object.keys(TONE) as Tone[]

/** Cómo se muestran los datos: anillos de progreso y repartidos, y la explicación a pedido (“i”). */
export function DataSection() {
  return (
    <SpecimenGrid min="22rem">
      <Specimen title="ProgressRing" note={<>Un valor = un anillo; nunca barras de progreso. Archivo: <Tag>ui/ProgressRing.tsx</Tag></>}>
        {TONES.map((tone, index) => (
          <ProgressRing key={tone} value={0.2 + index * 0.15} tone={tone} label={`Tono ${tone}`} delay={index * 100} />
        ))}
        <ProgressRing value={0.87} size={76} strokeWidth={7} label="Grande" />
        <ProgressRing value={0.996} label="Casi cien" />
        <ProgressRing value={0.004} label="Casi cero" />
      </Specimen>

      <Specimen title="SegmentedRing" note={<>Un reparto en tramos. Archivo: <Tag>ui/SegmentedRing.tsx</Tag></>}>
        <SegmentedRing
          size={132}
          label="Limpias, con problema y sin salida"
          segments={[
            { key: 'clean', value: 0.62, color: 'var(--success-rgb)' },
            { key: 'problem', value: 0.23, color: 'var(--danger-rgb)' },
            { key: 'none', value: 0.15, color: 'var(--warning-rgb)' },
          ]}
        />
      </Specimen>

      <Specimen title="InfoTip" note={<>La explicación larga, sólo a pedido. Archivo: <Tag>ui/InfoTip.tsx</Tag></>}>
        <span className="flex items-center gap-1 text-body text-foreground">
          Pasá el mouse o tocá
          <InfoTip label="Qué es esto">Un texto que explica algo que no se ve en otro lado.</InfoTip>
        </span>
      </Specimen>
    </SpecimenGrid>
  )
}
