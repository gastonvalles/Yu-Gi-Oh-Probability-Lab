import { useMemo, useState } from 'react'

import type { DraftLine } from '../../../app/build-draft'
import { createMatcherPattern } from '../../../app/pattern-factory'
import { computeLabResults } from '../../../app/probability-lab'
import { buildRoleDistributions } from '../../../app/role-distribution'
import type { ApiCardReference, CardEntry, CardRole, TurnView } from '../../../types'
import { LabAppliedCallout } from '../../probability/LabAppliedNotice'
import { LabChangeActions, LabChangeCard, LabChangeStale } from '../../probability/LabChangeCard'
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

/** «Probar el cambio»: el mismo deck con −1 Dominus Impulse y +1 Fire King Island (sin guardar). */
const OUT_ID = 'c40366667'
const IN_ID = 'c57554544'
const DRAFT_DECK = DECK.map((card) => (card.id === OUT_ID ? { ...card, copies: card.copies - 1 } : card.id === IN_ID ? { ...card, copies: card.copies + 1 } : card))
const lineOf = (id: string, delta: number): DraftLine => {
  const card = DECK.find((entry) => entry.id === id)!

  return { card: { instanceId: id, name: card.name, apiCard: card.apiCard!, origin: card.origin, roles: card.roles, needsReview: false }, before: card.copies, after: card.copies + delta }
}
const LINES = { out: lineOf(OUT_ID, -1), in: lineOf(IN_ID, 1) }

/** El Lab rediseñado (v2): el veredicto con su lente, lo que más te frena, qué robás de cada rol y el paso que falta para medir. Son los componentes reales con un deck de muestra. */
export function LabResultSection() {
  const [view, setView] = useState<TurnView>('average')
  const computation = useMemo(() => computeLabResults(DECK, CHECKS, 5), [])
  const draftComputation = useMemo(() => computeLabResults(DRAFT_DECK, CHECKS, 5), [])
  const roles = useMemo(() => buildRoleDistributions(DECK, view === 'average' ? [5, 6] : [view === 'first' ? 5 : 6]), [view])
  const draftRoles = useMemo(() => buildRoleDistributions(DRAFT_DECK, view === 'average' ? [5, 6] : [view === 'first' ? 5 : 6]), [view])

  if (computation.status !== 'ok' || draftComputation.status !== 'ok') {
    return null
  }

  const { results } = computation
  const draftResults = draftComputation.results

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
        note={<>El problema, el cambio de una carta con las dos cartas (en el celular, en dos columnas), lo que mejora cada turno y, abajo, el número con la acción: «Probar el cambio» (<Tag>onTry</Tag>, la principal: todo el Lab pasa a tu deck con el cambio) y «Comparar con mi deck» (<Tag>onCompare</Tag>). Sin ellas, o si ningún cambio suma, «Ver starters» (abre las cartas del rol). La carta que entra es una de las que cuentan las reglas de salida (un Extender solo no abre con «1+ Starter»), y el límite de copias cuenta el Extra y el Side (<Tag>deck</Tag>). Archivo: <Tag>probability/LabSuggestion.tsx</Tag></>}
      >
        <LabSuggestion deckFormat="tcg" cards={DECK} checks={CHECKS} handSize={5} view={view} result={results[view]} first={results.first} second={results.second} roles={roles} onOpenRole={noop} onTry={noop} onCompare={noop} />
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

      <Specimen
        title="Probando un cambio · el veredicto (LabScoreCard before)"
        layout="column"
        note={<>Todo el Lab muestra tu deck con el cambio: el mismo anillo, en el mismo lugar y del mismo tamaño, con el chip ámbar «Con el cambio» (el ámbar de la build B) y, bajo la frase, «▲ N antes M» (verde si sube; el lector oye una sola frase). «Sin salida» y «Con problema» llevan su ▲ / ▼ (bajar es lo bueno): debajo del número en el celular, a su izquierda desde 768 px. Prop <Tag>before</Tag> (tu deck de verdad). Archivo: <Tag>probability/LabScoreCard.tsx</Tag></>}
      >
        <LabScoreCard results={draftResults} before={results} view={view} onViewChange={setView} isRecalculating={false} handSize={5} onOpenDisclaimer={noop} />
      </Specimen>

      <Specimen
        title="Probando un cambio · midiendo (LabScoreCard measuring)"
        layout="column"
        note={<>Mientras se mide tu deck con el cambio: esqueletos del mismo tamaño en el anillo, la nota, el «antes», los números y los anillos de la lente (<Tag>aria-busy</Tag>); las filas no se abren y la ficha ⓘ espera. Nunca un número de antes como si fuera nuevo. Prop <Tag>measuring</Tag>.</>}
      >
        <LabScoreCard results={results} before={results} measuring view={view} onViewChange={setView} isRecalculating={false} handSize={5} onOpenDisclaimer={noop} />
      </Specimen>

      <Specimen
        title="Estás probando un cambio (LabChangeCard)"
        layout="column"
        note={<>Ocupa el lugar de «Lo que más te frena»: no se guarda nada hasta aplicarlo, las dos cartas rectas («quedan 2», «ahora son 3», con el rol que decide) y, desde 768 px, las tres acciones abajo: «Descartar» sin caja, «Comparar con mi deck» y la principal «Aplicar al deck», al final. Borde ámbar (<Tag>Card tone=&quot;info&quot;</Tag>). Archivo: <Tag>probability/LabChangeCard.tsx</Tag></>}
      >
        <LabChangeCard lines={LINES} actionsInCard onDiscard={noop} onCompare={noop} onApply={noop} />
      </Specimen>

      <Specimen
        title="La barra del celular (LabChangeBar)"
        layout="column"
        note={<>En el celular (menos de 768 px) las mismas acciones van fijas abajo, sobre la barra del armazón y por portal (<Tag>stagger</Tag> usa <Tag>transform</Tag>): la X (descartar, con <Tag>aria-label</Tag>), «Comparar» y «Aplicar al deck», la principal, al final y a mano del pulgar. La página deja libre el final para que no tape nada. Acá, la fila sin fijar.</>}
      >
        <div className="border-t border-border-subtle bg-background px-gutter py-3">
          <LabChangeActions compact onDiscard={noop} onCompare={noop} onApply={noop} />
        </div>
      </Specimen>

      <Specimen
        title="Qué robás de cada rol, con el cambio"
        layout="column"
        note={<>Los roles que cambiaron llevan su ▲ / ▼ en un renglón chico bajo las copias (entra en el alto de la fila; más Bricks es peor, del resto más es mejor); el botón lo dice como descripción («4 más»). Prop <Tag>before</Tag>.</>}
      >
        <LabRoleDistribution distributions={draftRoles} before={roles} onOpenRole={noop} />
      </Specimen>

      <Specimen
        title="Aplicaste el cambio (LabAppliedNotice)"
        layout="column"
        note={<>Después de «Aplicar al deck»: abajo y centrado (en el celular, donde estaba la barra), «Deshacer» sin caja; se va solo a los 10 s o al tocar otra cosa, con la salida de una hoja (<Tag>usePresence</Tag>), y la región <Tag>role=&quot;status&quot;</Tag> lo anuncia. Deshacer vuelve tu deck y el borrador. Pieza del Lab hasta que el aviso de la app lleve acciones.</>}
      >
        <div className="rounded-control bg-background shadow-overlay">
          <LabAppliedCallout onUndo={noop} />
        </div>
      </Specimen>

      <Specimen
        title="El cambio ya no se puede aplicar (LabChangeStale)"
        layout="column"
        note={<>Tu deck cambió (sacaste una de las dos cartas, o se llenó el límite): el aviso dice por qué y ofrece «Descartar el cambio». No se pierde en silencio; si el deck vuelve a dejarlo, el cambio vuelve solo.</>}
      >
        <LabChangeStale problem={{ ok: false, reason: 'missing-card' }} onDiscard={noop} />
      </Specimen>
    </SpecimenGrid>
  )
}
