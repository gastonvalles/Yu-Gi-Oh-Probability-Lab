import { CardEffectText } from '../../card-detail/CardEffectText'
import { InfoTip } from '../../ui/InfoTip'
import { ProgressRing } from '../../ui/ProgressRing'
import { SegmentedRing } from '../../ui/SegmentedRing'
import { TONE, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const TONES = Object.keys(TONE) as Tone[]

const ASH_BLOSSOM = 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card, then target 1 card on the field; negate that effect. You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.'
const BULLETS =
  'Once per turn, during your Standby Phase: You can pay 500 LP; draw 1 card.\n● If this card is Special Summoned from the GY: You can send 1 monster from your hand to the GY; add 1 card from your Deck to your hand.\nThis card gains 500 ATK for each monster you control.'

/** Cómo se muestran los datos: anillos de progreso y repartidos, el texto de una carta con sus partes resaltadas y la explicación a pedido (“i”). */
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

      <Specimen title="CardEffectText" note={<>El efecto de una carta con sus partes marcadas: verde la condición, ámbar «(Quick Effect)», rojo el costo, violeta el objetivo y subrayado el límite; lo que no es seguro queda común. Capa 0 del motor de cartas (<Tag>docs/motor-de-cartas.md</Tag>). Archivo: <Tag>card-detail/CardEffectText.tsx</Tag></>}>
        <div className="grid gap-3 text-body text-foreground">
          <CardEffectText text={ASH_BLOSSOM} />
          <CardEffectText text={BULLETS} />
        </div>
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
