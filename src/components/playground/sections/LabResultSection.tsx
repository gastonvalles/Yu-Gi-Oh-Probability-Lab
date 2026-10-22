import { useMemo, useState } from 'react'

import { createMatcherPattern } from '../../../app/pattern-factory'
import { computeLabResults } from '../../../app/probability-lab'
import { buildRoleDistributions } from '../../../app/role-distribution'
import type { ApiCardReference, CardEntry, CardRole, TurnView } from '../../../types'
import { LabPendingClassification } from '../../probability/LabPendingClassification'
import { LabRoleDistribution } from '../../probability/LabRoleDistribution'
import { LabScoreCard } from '../../probability/LabScoreCard'
import { LabSuggestion } from '../../probability/LabSuggestion'
import { TurnViewToggle } from '../../probability/TurnViewToggle'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

/** Una carta de muestra con su arte de YGOPRODeck. */
function sample(id: number, name: string, copies: number, roles: CardRole[], origin: CardEntry['origin'], needsReview = false): CardEntry {
  const apiCard: ApiCardReference = {
    ygoprodeckId: id,
    cardType: '',
    frameType: '',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: `https://images.ygoprodeck.com/images/cards/${id}.jpg`,
    imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }

  return { id: `c${id}`, name, copies, source: 'manual', apiCard, origin, roles, needsReview }
}

/** Un deck Fire King de 40, con los roles de la pantalla de Roles. */
const DECK: CardEntry[] = [
  sample(57554544, 'Fire King Island', 2, ['starter'], 'engine'),
  sample(90681088, 'Legendary Fire King Ponix', 3, ['starter'], 'engine'),
  sample(44455560, 'Fire King Courtier Ulcanix', 3, ['starter'], 'engine'),
  sample(66431519, 'Sacred Fire King Garunix', 3, ['extender'], 'engine'),
  sample(2526224, 'Fire King High Avatar Kirin', 3, ['extender'], 'engine'),
  sample(40366667, 'Dominus Impulse', 3, ['handtrap'], 'non_engine'),
  sample(14558127, 'Ash Blossom & Joyous Spring', 3, ['handtrap'], 'non_engine'),
  sample(42141493, 'Mulcharmy Fuwalos', 3, ['handtrap'], 'non_engine'),
  sample(65305978, 'Fire King Sanctuary', 3, ['searcher'], 'engine'),
  sample(91703676, 'Fire King Sky Burn', 2, ['searcher'], 'engine'),
  sample(38572779, 'Miscellaneousaurus', 3, ['searcher'], 'engine'),
  sample(18621798, 'Fire King Avatar Arvata', 3, ['searcher'], 'engine'),
  sample(96594609, 'Fire King Avatar Kirin', 3, ['searcher'], 'engine'),
  sample(23015896, 'Fire King High Avatar Garunix', 3, ['searcher'], 'engine'),
]
const CHECKS = [createMatcherPattern('Salida básica', 'opening', [{ matcher: { type: 'role', value: 'starter' }, quantity: 1, kind: 'include' }])]
const PENDING = DECK.slice(0, 5).map((card) => ({ ...card, needsReview: true }))
const noop = () => {}

/** El Lab rediseñado (v2): el veredicto con su lente, lo que más te frena, qué robás de cada rol y el paso que falta para medir. Son los componentes reales con un deck de muestra. */
export function LabResultSection() {
  const [view, setView] = useState<TurnView>('average')
  const computation = useMemo(() => computeLabResults(DECK, CHECKS, 5), [])
  const roles = useMemo(() => buildRoleDistributions(DECK, view === 'average' ? [5, 6] : [view === 'first' ? 5 : 6]), [view])

  if (computation.status !== 'ok') {
    return null
  }

  const { results } = computation

  return (
    <SpecimenGrid min="26rem">
      <Specimen
        title="Veredicto (LabScoreCard)"
        layout="column"
        note={<>Una tarjeta común con <b>un</b> anillo de reparto (140 px en el celular, 184 desde 768; el arco verde es el número del centro, «de cada 100» adentro), la nota junto a la frase, «Sin salida» y «Con problema» como filas que se abren con los problemas de esas manos (<Tag>LabFailureBreakdown</Tag>) y la lente debajo. Archivo: <Tag>probability/LabScoreCard.tsx</Tag></>}
      >
        <LabScoreCard results={results} view={view} onViewChange={setView} isRecalculating={false} handSize={5} onOpenDisclaimer={noop} />
      </Specimen>

      <Specimen
        title="Lo que más te frena (LabSuggestion)"
        layout="column"
        note={<>El problema, el cambio de una carta con las dos cartas (en el celular, en dos columnas), lo que mejora cada turno y, abajo, el número con la acción. Sin <Tag>onTry</Tag> la acción es «Ver starters» (abre las cartas del rol); con <Tag>onTry</Tag> / <Tag>onCompare</Tag>, «Probar el cambio» y «Comparar con mi deck». Archivo: <Tag>probability/LabSuggestion.tsx</Tag></>}
      >
        <LabSuggestion deckFormat="tcg" cards={DECK} checks={CHECKS} handSize={5} view={view} result={results[view]} first={results.first} second={results.second} roles={roles} onOpenRole={noop} />
      </Specimen>

      <Specimen
        title="La lente (TurnViewToggle · Segmented lens)"
        note={<>Un radiogroup en la pista lavanda: cada opción con su anillo de 36 px; la elegida, enmarcada en ámbar (no rellena) y sin repetir su número. Archivos: <Tag>probability/TurnViewToggle.tsx</Tag>, <Tag>ui/Segmented.tsx</Tag> (variante <Tag>lens</Tag>)</>}
      >
        <TurnViewToggle activeView={view} onChange={setView} values={{ average: results.average.cleanProbability, first: results.first.cleanProbability, second: results.second.cleanProbability }} details={{ average: '5 y 6 cartas', first: '5 cartas', second: '6 cartas' }} />
      </Specimen>

      <Specimen
        title="Qué robás de cada rol (LabRoleDistribution)"
        layout="column"
        note={<>Una fila por rol con su anillo de identidad (52 px, el color del rol), el nombre y las copias: el dato se ve sin abrir; la fila abre las cartas del rol. Lista desde 768 px, 2 × 2 en el celular. Archivo: <Tag>probability/LabRoleDistribution.tsx</Tag></>}
      >
        <LabRoleDistribution distributions={roles} onOpenRole={noop} />
      </Specimen>

      <Specimen
        title="Falta un paso para medir (LabPendingClassification)"
        className="col-span-full"
        layout="column"
        note={<>La tarjeta con el anillo de progreso («0 de 5», ámbar; verde al terminar). En el celular la cola va plegada («Revisarlas una por una») y «Confirmar las N sugerencias y medir» queda fija sobre la barra de abajo. Archivo: <Tag>probability/LabPendingClassification.tsx</Tag></>}
      >
        <LabPendingClassification cards={PENDING} message="" onSetOrigin={noop} onToggleRole={noop} onConfirm={noop} onConfirmAll={noop} onEditingChange={noop} />
      </Specimen>
    </SpecimenGrid>
  )
}
