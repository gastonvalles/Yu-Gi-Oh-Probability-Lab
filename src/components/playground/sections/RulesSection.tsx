import { useEffect, useMemo, useRef, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../../app/deck-groups'
import { createMatcherPattern } from '../../../app/pattern-factory'
import { buildRuleExample, type RuleExampleId } from '../../../app/rule-edits'
import type { CardEntry, HandPattern } from '../../../types'
import { Button } from '../../ui/Button'
import { DraftImpactSummary } from '../../probability/DraftImpactSummary'
import { LabRuleList } from '../../probability/LabRuleList'
import { PatternEditorDrawer, exampleTitle } from '../../probability/PatternEditorDrawer'
import type { RuleEntry, RuleEntryGroups } from '../../probability/probability-lab-helpers'
import { CategoryPicker } from '../../probability/rule-builder/CategoryPicker'
import { ConditionBlock } from '../../probability/rule-builder/ConditionBlock'
import { RuleReadback } from '../../probability/rule-builder/RuleReadback'
import { usePatternDraft } from '../../probability/use-pattern-draft'
import { Specimen, Tag } from '../Specimen'

/** Un deck chico de muestra: con roles de todos los colores y uno sin copias (para ver los roles apagados). */
const CARDS: CardEntry[] = [
  { id: 'fki', name: 'Fire King Island', copies: 3, source: 'manual', apiCard: null, origin: 'engine', roles: ['starter', 'searcher'], needsReview: false },
  { id: 'ponix', name: 'Legendary Fire King Ponix', copies: 2, source: 'manual', apiCard: null, origin: 'engine', roles: ['extender'], needsReview: false },
  { id: 'ash', name: 'Ash Blossom & Joyous Spring', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false },
  { id: 'imperm', name: 'Infinite Impermanence', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['disruption'], needsReview: false },
  { id: 'pot', name: 'Pot of Prosperity', copies: 2, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['draw'], needsReview: false },
]

const entry = (overrides: Partial<RuleEntry>): RuleEntry => ({
  patternId: 'p',
  presetId: null,
  tier: 'custom',
  kind: 'opening',
  name: 'Regla',
  defaultName: null,
  summary: '',
  description: null,
  turnContext: 'either',
  enabled: true,
  appliesToView: true,
  isComplete: true,
  probability: 0.5,
  possible: true,
  turnLean: null,
  missingCards: false,
  ...overrides,
})

const GROUPS: RuleEntryGroups = {
  universal: [
    entry({ patternId: 'u1', tier: 'universal', presetId: 'starter_opening', name: 'Salida básica', defaultName: 'Salida básica', probability: 0.81, turnLean: { favored: 'second', first: 0.78, second: 0.84 } }),
    entry({ patternId: 'u2', tier: 'universal', presetId: 'dead_cards_problem', name: '2+ cartas muertas', defaultName: '2+ cartas muertas', kind: 'problem', probability: 0 }),
  ],
  generic: [
    entry({ patternId: 'g1', tier: 'generic', presetId: 'starter_extender_opening', name: 'Salida con seguimiento', probability: 0.8 }),
    entry({ patternId: 'g2', tier: 'generic', presetId: 'starter_boardbreaker_opening', name: 'Salida que rompe campo', turnContext: 'second', probability: 0 }),
    entry({ patternId: 'g3', tier: 'generic', presetId: 'no_answer_second_problem', name: 'Sin respuesta yendo 2º', kind: 'problem', turnContext: 'second', probability: 0.003 }),
    entry({ patternId: 'g4', tier: 'generic', presetId: 'starter_interaction_opening', name: 'Salida con interacción', enabled: false, probability: null }),
  ],
  custom: [
    entry({ patternId: 'c1', name: '2+ Handtraps yendo 2º', turnContext: 'second', probability: 0.99 }),
    entry({ patternId: 'c2', name: 'Hornet + Engage', kind: 'problem', missingCards: true, probability: null }),
  ],
}

const role = (value: 'starter' | 'extender' | 'searcher' | 'handtrap' | 'disruption') => ({ type: 'role', value }) as const
const noop = () => {}
const DEFAULTS = { derivedMainCards: CARDS }

/** Las reglas de muestra de la frase y de las condiciones (una vez: cada una arma ids nuevos). */
function samplePatterns() {
  const single = createMatcherPattern('', 'opening', [{ matcher: role('handtrap'), quantity: 2, kind: 'include' }], { turnContext: 'second' })
  const none = createMatcherPattern('', 'problem', [
    { matcher: role('handtrap'), quantity: 1, kind: 'exclude' },
    { matcher: role('disruption'), quantity: 1, kind: 'exclude' },
  ])
  const atLeast = createMatcherPattern(
    '',
    'opening',
    [
      { matcher: role('starter'), quantity: 1, kind: 'include' },
      { matcher: role('extender'), quantity: 1, kind: 'include' },
      { matcher: role('searcher'), quantity: 1, kind: 'include' },
    ],
    { matchMode: 'at-least', minimumMatches: 2 },
  )
  const missing: HandPattern = { ...none, conditions: [{ ...none.conditions[0]!, matcher: null }] }

  return { single, none, atLeast, missing }
}

/** La sección «Reglas del Lab»: la tarjeta de reglas y cada pieza del editor, con los componentes reales. */
export function RulesSection() {
  const cardById = useMemo(() => new Map(CARDS.map((card) => [card.id, card])), [])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(CARDS), [])
  const [deleted, setDeleted] = useState<string | null>(null)

  const { single, none, atLeast, missing } = useMemo(samplePatterns, [])

  return (
    <div className="grid gap-4">
      <Specimen
        title="Tarjeta de reglas"
        layout="column"
        note={
          <>
            <Tag>probability/LabRuleList.tsx</Tag> Salidas | Problemas, una fila de 60 px por regla: el anillo y, a la derecha, el candado (universal), el interruptor (genérica) o el ⋯
            (Editar · Duplicar · Borrar) de las tuyas, con la etiqueta «Tuya». «Crear regla» arriba (abajo en el celular) y «Crear una salida / un problema» al pie de cada columna.
          </>
        }
      >
        <LabRuleList
          groups={GROUPS}
          className=""
          onEditRule={noop}
          onToggleGenericRule={noop}
          onEditGenericRule={noop}
          onRenameSystemRule={noop}
          onCreate={noop}
          onDuplicateRule={noop}
          onDeleteRule={(id) => setDeleted(id)}
        />
        {deleted ? <p className="m-0 text-micro text-soft">Pediste borrar «{deleted}» (en la app, primero se confirma y queda «Deshacer»).</p> : null}
      </Specimen>

      <Specimen
        title="El número en vivo"
        layout="column"
        note={
          <>
            <Tag>probability/DraftImpactSummary.tsx</Tag> arriba y fijo en el editor: el anillo de 56 px (verde si es salida, rojo claro si es problema), cuántas de cada 100 manos
            y el antes → después de tus manos buenas. A medias: sin medir y qué falta (nunca un 0 falso). Calculando: «Calculando…» y <Tag>aria-busy</Tag>.
          </>
        }
      >
        <DraftImpactSummary kind="opening" complete pending={false} impact={{ rule: { first: null, second: 0.99, main: 0.99, scope: 'second' }, clean: { before: 0.84, after: 0.96 } }} />
        <DraftImpactSummary kind="problem" complete pending={false} impact={{ rule: { first: null, second: 0.003, main: 0.003, scope: 'second' }, clean: { before: 0.84, after: 0.84 } }} />
        <DraftImpactSummary kind="opening" complete={false} pending={false} impact={null} />
        <DraftImpactSummary kind="opening" complete pending impact={null} />
      </Specimen>

      <Specimen title="La regla en una frase" layout="column" note={<><Tag>rule-builder/RuleReadback.tsx</Tag> lo que decide en negrita; si falta qué cuenta, en rojo.</>}>
        <RuleReadback pattern={single} cardById={cardById} />
        <RuleReadback pattern={none} cardById={cardById} />
        <RuleReadback pattern={atLeast} cardById={cardById} />
        <RuleReadback pattern={missing} cardById={cardById} />
      </Specimen>

      <Specimen
        title="Una condición"
        layout="column"
        note={
          <>
            <Tag>rule-builder/ConditionBlock.tsx</Tag> [⋮⋮] [Tiene | No tiene] [− N +] [×] y debajo qué cuenta (● rol ×copias ›). El agarre sólo con dos o más condiciones: se
            arrastra o se mueve con ↑ ↓. Sin qué cuenta: el borde rojo y qué falta.
          </>
        }
      >
        <ConditionSample pattern={atLeast} count={3} groupsByKey={groupsByKey} />
        <ConditionSample pattern={missing} count={1} groupsByKey={groupsByKey} />
      </Specimen>

      <Specimen
        title="Qué cuenta (Roles · Cartas · Más)"
        layout="column"
        note={<><Tag>rule-builder/CategoryPicker.tsx</Tag> vive dentro del cajón del editor (en el celular, a pantalla completa): se elige y se confirma abajo.</>}
      >
        <div className="grid h-[38rem] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-card border border-border-subtle bg-card-background">
          <CategoryPicker index={1} currentMatcher={role('handtrap')} derivedMainCards={CARDS} usedCopies={new Map()} onBack={noop} onClose={noop} onUse={noop} />
        </div>
      </Specimen>

      <Specimen title="El editor entero" note={<><Tag>probability/PatternEditorDrawer.tsx</Tag> primero los cuatro ejemplos (o «Empezar en blanco»); después, la regla en una sola pantalla.</>}>
        <EditorSample />
      </Specimen>
    </div>
  )
}

/** Una condición que se puede tocar: trabaja sobre su propio borrador (la primera condición de la regla de muestra). */
function ConditionSample({ pattern, count, groupsByKey }: { pattern: HandPattern; count: number; groupsByKey: ReturnType<typeof buildDerivedDeckGroupMap> }) {
  const draft = usePatternDraft(DEFAULTS)
  const opened = useRef(false)

  useEffect(() => {
    if (!opened.current) {
      opened.current = true
      draft.open(pattern)
    }
  })

  const shown = draft.draft ?? pattern

  return (
    <div className="max-w-140">
      <ConditionBlock
        index={0}
        count={count}
        patternId={shown.id}
        pattern={shown}
        condition={shown.conditions[0]!}
        derivedMainCards={CARDS}
        groupsByKey={groupsByKey}
        actions={draft.actions}
        onRemove={noop}
        onPick={noop}
        onMoveBy={noop}
        onDragStart={noop}
      />
    </div>
  )
}

function EditorSample() {
  const draft = usePatternDraft(DEFAULTS)
  const [state, setState] = useState<{ examples: boolean } | null>(null)

  const pick = (id: RuleExampleId | 'blank') => {
    setState({ examples: false })

    if (id === 'blank') {
      return null
    }

    const example = buildRuleExample(id, exampleTitle(id))
    draft.open(example.pattern)
    return example.pendingConditionId
  }

  return (
    <>
      <Button
        variant="secondary"
        icon="plus"
        onClick={() => {
          draft.open(createMatcherPattern('', 'opening', [{ matcher: role('starter'), quantity: 1, kind: 'include' }]))
          setState({ examples: true })
        }}
      >
        Abrir el editor
      </Button>
      <PatternEditorDrawer
        isOpen={state !== null}
        mode="create"
        showExamples={state?.examples ?? false}
        pattern={draft.draft}
        actions={draft.actions}
        derivedMainCards={CARDS}
        impact={{ impact: null, pending: false }}
        canSave={false}
        blockReason={null}
        duplicateOf={null}
        onPickExample={pick}
        onClose={() => {
          draft.close()
          setState(null)
        }}
        onSave={noop}
      />
    </>
  )
}
