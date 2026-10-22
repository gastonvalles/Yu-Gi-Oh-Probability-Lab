import { useMemo, useState } from 'react'

import { compareBuilds } from '../../../app/build-comparison'
import { deriveMainDeckCardsFromZone } from '../../../app/calculator-state'
import type { ChangeEffectResult } from '../../../app/change-effects'
import { pairChanges } from '../../../app/change-pairs'
import { CURRENT_SOURCE } from '../../../app/comparison-selection'
import type { DeckCardInstance } from '../../../app/model'
import type { SavedBuild } from '../../../app/saved-builds'
import type { CardOrigin, CardRole, TurnView } from '../../../types'
import { BuildDeckView } from '../../comparison/BuildDeckView'
import { BuildPair, SourceSheet } from '../../comparison/BuildPicker'
import { sourceOptions, zoneMarks } from '../../comparison/build-sources'
import { ChangeList } from '../../comparison/ChangeList'
import { deltaPoints, mirrorGroups, verdictRows, type Side } from '../../comparison/comparison-rows'
import { MirrorRow, MirrorRowsCard, type MoversOf } from '../../comparison/MirrorRow'
import { cleanPair, CompareActionBar, VerdictAction, VerdictCard } from '../../comparison/VerdictCard'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

let serial = 0

/** `count` copias de una carta real (la imagen de YGOPRODeck) con su clasificación. */
function cards(id: number, name: string, count: number, roles: CardRole[], origin: CardOrigin | null = 'engine'): DeckCardInstance[] {
  return Array.from({ length: count }, () => {
    serial += 1

    return {
      instanceId: `muestra-${id}-${serial}`,
      name,
      origin,
      roles: [...roles],
      needsReview: false,
      apiCard: {
        ygoprodeckId: id,
        cardType: 'Effect Monster',
        frameType: 'effect',
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
      },
    }
  })
}

const filler = (count: number) => Array.from({ length: count }, (_, index) => cards(800000 + index, `Relleno ${index + 1}`, 1, ['enabler'], 'non_engine')).flat()

/** A: un deck Fire King de muestra. B: −2 Mulcharmy Purulia (bajan al Side), +1 Fire King Island y +1 Sanctuary; −1 Dominus Impulse y sube 1 Circle of the Fire Kings. */
function sampleDecks() {
  const ulcanix = cards(44455560, 'Fire King Courtier Ulcanix', 3, ['starter', 'searcher'])
  const island = cards(57554544, 'Fire King Island', 3, ['starter', 'searcher'])
  const sanctuary = cards(65305978, 'Fire King Sanctuary', 3, ['starter'])
  const ash = cards(14558127, 'Ash Blossom & Joyous Spring', 3, ['handtrap'], 'non_engine')
  const purulia = cards(84192580, 'Mulcharmy Purulia', 3, ['handtrap', 'draw'], 'non_engine')
  const dominus = cards(40366667, 'Dominus Impulse', 3, ['handtrap'], 'non_engine')
  const circle = cards(59388357, 'Circle of the Fire Kings', 1, ['extender', 'recovery'])
  const solemn = cards(78114463, 'Solemn Accusation', 2, ['disruption'], 'non_engine')
  const brick = cards(93170499, 'Jurrac Megalo', 3, ['brick'])
  const rest = filler(21)
  const a = { main: [...ulcanix, ...island.slice(0, 2), ...sanctuary.slice(0, 2), ...ash, ...purulia, ...dominus, ...brick, ...rest], extra: [], side: [...circle, ...solemn] }
  const b = { main: [...ulcanix, ...island, ...sanctuary, ...ash, purulia[0]!, ...dominus.slice(0, 2), ...circle, ...brick, ...rest], extra: [], side: [...purulia.slice(1), solemn[0]!] }

  return { a, b }
}

const done = (average: number): ChangeEffectResult => ({
  status: 'done',
  effect: { delta: { clean: { first: average, second: average, average } }, after: { values: {}, totals: { first: 0, second: 0 } } },
})

/** Las piezas de Comparar (`#workspace`), con datos de muestra medidos por el motor de verdad (en el hilo principal: es una herramienta). */
export function CompareSection() {
  const [view, setView] = useState<TurnView>('average')
  const [picker, setPicker] = useState<Side | null>(null)
  const sample = useMemo(() => {
    const { a, b } = sampleDecks()
    const rules = { patterns: [], disabledGenericRuleIds: [], handSize: 5 }
    const comparison = compareBuilds({ name: 'A', cards: deriveMainDeckCardsFromZone(a.main) }, { name: 'B', cards: deriveMainDeckCardsFromZone(b.main) }, rules)
    const changes = pairChanges(a, b)
    const build: SavedBuild = { id: 'build-muestra', name: 'fire-king-starters', savedAt: new Date().toISOString(), from: 'deck', ...b }
    const imported: SavedBuild = { id: 'build-importada', name: 'branded-importada', savedAt: new Date(Date.now() - 864e5).toISOString(), from: 'import', ...b, main: [...b.main.slice(0, -1), ...cards(6637331, 'Bystial Druiswurm', 1, [], null)] }
    const options = sourceOptions({ current: a, deckBefore: null, draft: null, savedBuilds: [build, imported] }, 'fire-king-jurrac')
    // Un cambio de cada: medido (▲3), que no mueve nada (=), sin clasificar (?) y midiéndose (el esqueleto).
    const statuses: ChangeEffectResult[] = [done(0.031), done(0.002), { status: 'pending' }, { status: 'loading' }]
    const results = Object.fromEntries(changes.main.map((change, index) => [change.key, statuses[index % statuses.length]!]))

    return { a, b, comparison, changes, options, results }
  }, [])
  const moversOf: MoversOf = () => ({ status: 'ready', movers: sample.changes.main.slice(0, 2).map((change, index) => ({ change, delta: index === 0 ? -0.06 : -0.031 })) })
  const [noOpening] = verdictRows(sample.comparison)
  const groups = mirrorGroups(sample.comparison)
  const marks = zoneMarks(sample.changes, 'main')

  return (
    <SpecimenGrid min="22rem">
      <Specimen
        title="El par A/B"
        layout="column"
        note={<>Cada build en su chip, con la insignia A (lila) y B (ámbar), el nombre y de dónde sale; tocar uno abre «Mis builds». En el celular, una caja con las dos (el ⇅ va en la barra de abajo); en escritorio, dos chips con el ⇅ en el medio, en la cabecera. Archivo: <Tag>comparison/BuildPicker.tsx</Tag></>}
      >
        <BuildPair a={sample.options[0]!} b={sample.options[1]!} layout="stacked" onPick={setPicker} />
        <BuildPair a={sample.options[0]!} b={sample.options[2]!} layout="row" onPick={setPicker} onSwap={() => {}} />
        <BuildPair a={sample.options[0]!} b={null} layout="stacked" onPick={setPicker} />
      </Specimen>

      <Specimen title="Mis builds" note={<>De dónde puede salir A o B: tu deck, «Tu deck de antes», el borrador del Lab y las builds guardadas (con su origen y su fecha); la elegida con el aro ámbar, la del otro lado apagada; renombrar y borrar en sus tres puntos. Hoja de abajo en el celular, diálogo chico en escritorio. Archivo: <Tag>comparison/BuildPicker.tsx</Tag></>}>
        <Button size="sm" onClick={() => setPicker('B')}>
          Abrir «Mis builds»
        </Button>
        <SourceSheet
          side={picker}
          options={sample.options}
          selection={{ a: CURRENT_SOURCE, b: 'build-muestra' }}
          onChoose={() => setPicker(null)}
          onRename={() => setPicker(null)}
          onDelete={() => setPicker(null)}
          onImport={() => setPicker(null)}
          onSaveCurrent={() => setPicker(null)}
          onClose={() => setPicker(null)}
        />
      </Specimen>

      <Specimen
        title="La tarjeta del veredicto"
        className="col-span-full"
        layout="column"
        note={<>Quién abre mejor (el veredicto y los umbrales de <Tag>compareBuilds</Tag>), los dos anillos de reparto (<Tag>SegmentedRing</Tag>: el centro es el tramo bueno), sin salida y con problema en filas espejo y la lente: tocar un turno cambia todos los números sin mover nada. Abajo, el número que decide con su acción (en escritorio; en el celular va en la barra). Archivo: <Tag>comparison/VerdictCard.tsx</Tag></>}
      >
        <div className="max-w-xl">
          <VerdictCard
            comparison={sample.comparison}
            view={view}
            onViewChange={setView}
            handSize={5}
            moversOf={moversOf}
            pending={null}
            footer={
              <div className="border-t border-border-subtle pt-4">
                <VerdictAction layout="card" points={deltaPoints(cleanPair(sample.comparison, view))} adopt={{ onClick: () => {}, emphasis: sample.comparison.verdict.kind === 'b' }} />
              </div>
            }
          />
        </div>
      </Specimen>

      <Specimen title="Fila espejo, cerrada y abierta" layout="column" note={<>`A | medida ▲/▼ | B`: el mejor en blanco y el otro atenuado; el chip verde si a B le conviene y rojo si no (en lo que traba, menos es mejor). Abierta: «Qué lo mueve» (cada cambio con lo que mueve solo) y las manos exactas de cada turno, en espejo. Archivo: <Tag>comparison/MirrorRow.tsx</Tag></>}>
        <Card>
          <MirrorRow row={noOpening!} view={view} moversOf={moversOf} dot="danger" />
          <MirrorRow row={noOpening!} view={view} moversOf={moversOf} dot="danger" defaultOpen />
        </Card>
      </Specimen>

      <Specimen title="Las filas de tus reglas y tus roles" layout="column" note={<>Agrupadas con su rótulo chico (lo que traba, tus reglas, qué robás de cada rol), de la mayor diferencia a la menor; lo que da igual en todas las vistas, plegado en una sola fila. Archivo: <Tag>comparison/MirrorRow.tsx</Tag></>}>
        <MirrorRowsCard groups={groups} view={view} moversOf={moversOf} />
      </Specimen>

      <Specimen title="«Qué cambiaste»" layout="column" note={<>Cada cambio del Main de a par (sale de A → entra en B, cartas rectas con el marco de su build) y, a la derecha, lo que mueve solo en las manos buenas: ▲/▼, «=», «?» si falta clasificar y el esqueleto mientras se mide. Debajo, el Extra y el Side en una línea y «Ver las dos listas». Archivo: <Tag>comparison/ChangeList.tsx</Tag></>}>
        <ChangeList changes={sample.changes} results={sample.results} view={view} onOpenLists={() => {}} />
      </Specimen>

      <Specimen title="Las dos listas (una zona)" layout="column" note={<>Lo que cambia con aro y cantidad en el color de su build: en A las copias que salen (−N), en B las que entran (+N); lo demás, atenuado. Archivo: <Tag>comparison/BuildDeckView.tsx</Tag></>}>
        <div className="grid grid-cols-2 gap-2">
          <div className="@container min-w-0">
            <BuildDeckView side="A" zone="main" cards={sample.a.main} marks={marks.A} onCardClick={() => {}} />
          </div>
          <div className="@container min-w-0">
            <BuildDeckView side="B" zone="main" cards={sample.b.main} marks={marks.B} onCardClick={() => {}} />
          </div>
        </div>
      </Specimen>

      <Specimen title="La barra de abajo (celular)" layout="column" note={<>Pegada abajo, al alcance del pulgar y sobre la barra de navegación: ⇅ a la izquierda y, a la derecha, el número con «Cargar B en el builder» (o «Clasificar N cartas»). En la pantalla va <Tag>sticky</Tag>; acá, quieta. Archivo: <Tag>comparison/VerdictCard.tsx</Tag></>}>
        {/* La caja recorta (`overflow-hidden`): así la barra no se pega a la pantalla del catálogo y sus márgenes negativos quedan adentro. */}
        <div className="max-w-md overflow-hidden rounded-card border border-border-subtle">
          <div className="px-gutter pb-6">
            <CompareActionBar onSwap={() => {}}>
              <VerdictAction layout="bar" points={4} adopt={{ onClick: () => {}, emphasis: true }} />
            </CompareActionBar>
          </div>
        </div>
      </Specimen>
    </SpecimenGrid>
  )
}
