import { visibleFactNames, type EffectFactName } from '../../app/card-effect-facts'
import { useCardEffectFacts } from '../../app/use-card-effect-facts'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import type { Tone } from '../ui/tone'

/** El color de cada rasgo es el mismo con que `CardEffectText` resalta esa parte del texto: ámbar el efecto rápido, rojo el costo, violeta el objetivo; los límites, sin color. */
const TRAITS: ReadonlyArray<{ fact: EffectFactName; tone: Tone }> = [
  { fact: 'quick', tone: 'warning' },
  { fact: 'hardOnce', tone: 'neutral' },
  { fact: 'once', tone: 'neutral' },
  { fact: 'perDuel', tone: 'neutral' },
  { fact: 'shared', tone: 'neutral' },
  { fact: 'cost', tone: 'danger' },
  { fact: 'target', tone: 'brand' },
]

/** Los rasgos que se muestran de una lista de hechos confirmados, con su color (cuáles y en qué orden: `visibleFactNames`, que también usa la lista de efectos de la mesa). */
export function visibleTraits(facts: readonly EffectFactName[]): ReadonlyArray<{ fact: EffectFactName; tone: Tone }> {
  const shown = visibleFactNames(facts)

  return TRAITS.filter(({ fact }) => shown.includes(fact))
}

/**
 * Lo que se sabe con certeza de los efectos de una carta, a primera vista (capa 1 del motor de cartas, `docs/motor-de-cartas.md`): sólo lo que su script de EDOPro **y** su texto dicen los dos. Un rasgo que falta no
 * quiere decir que la carta no lo tenga, sólo que no está confirmado. Son de la carta entera, no de cada efecto. Sin ninguno confirmado (o sin carta) no muestra nada.
 */
export function CardEffectTraits({ ygoprodeckId, className }: { ygoprodeckId: number | null | undefined; className?: string }) {
  const traits = visibleTraits(useCardEffectFacts(ygoprodeckId))

  if (traits.length === 0) return null

  return (
    <ul aria-label={t('search.traits.label')} className={['m-0 flex list-none flex-wrap gap-1 p-0', className].filter(Boolean).join(' ')}>
      {traits.map(({ fact, tone }) => (
        <li key={fact} className="m-0">
          <Badge size="sm" tone={tone} title={t(`search.traits.${fact}.hint`)}>
            {t(`search.traits.${fact}`)}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
