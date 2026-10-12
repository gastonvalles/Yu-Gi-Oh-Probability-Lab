import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildComparisonInputs, compareBuilds } from '../../app/build-comparison'
import { useLabComputation } from '../probability/use-lab-computation'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import type { DeckBuilderState, DeckCardInstance } from '../../app/model'
import { withReferenceClassification, type BuildZones } from '../../app/saved-builds'
import { setDeckName } from '../../app/deck-builder-slice'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import type { CardOrigin, CardRole } from '../../types'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckImportDrawer } from '../deck-mode/DeckImportDrawer'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { SideBadge } from './SideBadge'
import { StepHero } from '../StepHero'
import { StepPage } from '../ui/StepPage'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { BuildBCardEditor } from './BuildBCardEditor'
import { BuildDeckView } from './BuildDeckView'
import { ComparisonReport, CURRENT_DECK_NAME } from './ComparisonReport'
import { useSavedBuilds } from './use-saved-builds'
import { field } from '../ui/surfaces'

const CURRENT = 'current'
const SELECTION_KEY = 'ygo-lab:comparison-selection'

type Tab = 'report' | 'cards'

interface ResolvedBuild {
  source: string
  name: string
  zones: BuildZones
  isSaved: boolean
}

function readSelection(): { a: string; b: string | null } {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as { a?: unknown; b?: unknown } | null
    return {
      a: typeof parsed?.a === 'string' ? parsed.a : CURRENT,
      b: typeof parsed?.b === 'string' ? parsed.b : null,
    }
  } catch {
    return { a: CURRENT, b: null }
  }
}

function writeSelection(selection: { a: string; b: string | null }) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  } catch {
    // La selección es una comodidad: si no se puede guardar, se vuelve a elegir.
  }
}

export function ComparisonScreen() {
  const deckBuilder = useAppSelector((state) => state.deckBuilder)
  const patterns = useAppSelector((state) => state.patterns.patterns)
  const disabledGenericRuleIds = useAppSelector((state) => state.patterns.disabledGenericRuleIds)
  const systemRuleNames = useAppSelector((state) => state.patterns.systemRuleNames)
  const handSize = useAppSelector((state) => state.settings.handSize)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const dispatch = useAppDispatch()
  const savedBuilds = useSavedBuilds()
  const { showToast } = useToastMessage()
  const [selection, setSelection] = useState(readSelection)
  const [tab, setTab] = useState<Tab>('report')
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [detailCard, setDetailCard] = useState<ApiCardSearchResult | null>(null)
  const [editing, setEditing] = useState<{ buildId: string; card: DeckCardInstance } | null>(null)

  useEffect(() => writeSelection(selection), [selection])

  // Tu deck actual se llama como en el Deck builder.
  const currentName = deckBuilder.deckName.trim() || CURRENT_DECK_NAME

  const resolve = useCallback((source: string | null): ResolvedBuild | null => {
    if (source === CURRENT) {
      return {
        source,
        name: currentName,
        zones: { main: deckBuilder.main, extra: deckBuilder.extra, side: deckBuilder.side },
        isSaved: false,
      }
    }

    const saved = savedBuilds.builds.find((build) => build.id === source)
    if (!saved) {
      return null
    }

    // Las cartas que ya clasificaste en tu deck se miden igual en todas las builds.
    return {
      source: saved.id,
      name: saved.name,
      zones: { ...saved, main: withReferenceClassification(saved.main, deckBuilder.main) },
      isSaved: true,
    }
  }, [currentName, deckBuilder, savedBuilds.builds])

  const buildA = useMemo(() => resolve(selection.a) ?? resolve(CURRENT)!, [resolve, selection.a])
  const buildB = useMemo(() => resolve(selection.b), [resolve, selection.b])

  // La enumeración de manos de cada build corre en los workers (y queda en caché por contenido);
  // compareBuilds sólo arma el informe con esos resultados.
  const rules = useMemo(
    () => ({ patterns, disabledGenericRuleIds, systemRuleNames, handSize }),
    [patterns, disabledGenericRuleIds, systemRuleNames, handSize],
  )
  const inputA = useMemo(() => ({ name: buildA.name, cards: deriveMainDeckCardsFromZone(buildA.zones.main) }), [buildA])
  const inputB = useMemo(() => (buildB ? { name: buildB.name, cards: deriveMainDeckCardsFromZone(buildB.zones.main) } : null), [buildB])
  const labInputs = useMemo(() => (inputB ? buildComparisonInputs(inputA, inputB, rules) : null), [inputA, inputB, rules])
  const labA = useLabComputation(labInputs?.a ?? null)
  const labB = useLabComputation(labInputs?.b ?? null)

  const comparison = useMemo(() => {
    if (!inputB) {
      return null
    }

    return compareBuilds(inputA, inputB, rules, {
      a: labA.isComputing ? undefined : labA.computation,
      b: labB.isComputing ? undefined : labB.computation,
    })
  }, [inputA, inputB, rules, labA.computation, labA.isComputing, labB.computation, labB.isComputing])

  const deltaByCardId = useMemo(
    () => new Map((comparison?.cardDiffs ?? []).map((diff) => [diff.cardId, diff.delta])),
    [comparison],
  )

  const options = [
    { value: CURRENT, label: `${currentName} (${formatInteger(deckBuilder.main.length)})` },
    ...savedBuilds.builds.map((build) => ({ value: build.id, label: `${build.name} (${formatInteger(build.main.length)})` })),
  ]

  const selectAsB = (id: string) => setSelection((current) => ({ ...current, b: id }))

  const handleSaveCurrent = () => {
    if (deckBuilder.main.length === 0) {
      showToast('Tu deck actual está vacío', 'warning')
      return
    }
    const build = savedBuilds.save(currentName, deckBuilder)
    if (selection.b === null || selection.b === CURRENT) {
      selectAsB(build.id)
    }
    showToast(`Guardaste "${build.name}"`, 'success')
  }

  const handleImport = (deck: DeckBuilderState) => {
    const build = savedBuilds.save(deck.deckName || 'Build importada', deck)
    selectAsB(build.id)
    setIsImportOpen(false)
    showToast(`Guardaste "${build.name}" y la elegiste como B`, 'success')
  }

  const handleCardClick = (build: ResolvedBuild) => (card: DeckCardInstance) => {
    const isPending = card.origin === null || card.roles.length === 0 || card.needsReview
    if (build.isSaved && isPending) {
      setEditing({ buildId: build.source, card })
      return
    }
    setDetailCard({ ...card.apiCard, name: card.name })
  }

  const editingBuild = editing ? resolve(editing.buildId) : null
  const pendingOfEditingBuild = editingBuild
    ? editingBuild.zones.main.filter((card) => card.origin === null || card.roles.length === 0 || card.needsReview)
    : []

  const handleClassify = (ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) => {
    if (editing) {
      savedBuilds.classifyCard(editing.buildId, ygoprodeckId, origin, roles)
    }
  }

  const renderPicker = (side: 'A' | 'B', value: string | null) => {
    const build = side === 'A' ? buildA : buildB
    return (
      <div className="grid min-w-0 gap-1.5">
        <label className="flex min-w-0 items-center gap-2.5">
          <SideBadge side={side} />
          <select
            className={`${field} h-10 w-full min-w-0 px-3 text-body`}
            value={value ?? ''}
            aria-label={`Build ${side}`}
            onChange={(event) => setSelection((current) => ({ ...current, [side.toLowerCase()]: event.target.value || null }))}
          >
            {side === 'B' ? <option value="">Elegí una build…</option> : null}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {build ? (
          <div className="flex gap-1 pl-9">
            <Button variant="tertiary" size="sm" icon="pencil" onClick={() => setRenameTarget({ id: build.source, name: build.name })}>
              Renombrar
            </Button>
            {build.isSaved ? (
              <Button variant="tertiary" color="danger" size="sm" icon="trash" onClick={() => setDeleteTarget({ id: build.source, name: build.name })}>
                Borrar
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <StepPage aria-label="Comparar builds">
      <StepHero
        title="Compará builds"
        icon="columns"
        subtitle="Tu build contra otra, lado a lado."
        side={
          <>
            <Button variant="secondary" size="sm" icon="save" onClick={handleSaveCurrent}>
              Guardar deck actual
            </Button>
            <Button variant="primary" size="sm" icon="upload" onClick={() => setIsImportOpen(true)}>
              Importar build
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3 max-[519px]:grid-cols-[minmax(0,1fr)]">
        {renderPicker('A', selection.a)}
        <span className="grid h-10 place-items-center text-micro font-bold uppercase text-soft max-[519px]:hidden" aria-hidden="true">
          vs
        </span>
        {renderPicker('B', selection.b)}
      </div>

      {!buildB ? (
        <EmptyState icon="columns" title="Elegí qué comparar">
          {savedBuilds.builds.length === 0
            ? 'Todavía no guardaste builds. Usá “Guardar deck actual” antes de probar cambios, o “Importar build” para traer otra lista.'
            : 'Elegí una build B arriba para compararla con A.'}
        </EmptyState>
      ) : (
        <>
          <Segmented
            label="Vista"
            value={tab}
            onChange={setTab}
            fullWidth
            className="max-w-sm"
            options={[
              { value: 'report', label: 'Resumen' },
              { value: 'cards', label: 'Cartas' },
            ]}
          />

          {tab === 'report' ? (
            comparison ? (
              <ComparisonReport
                comparison={comparison}
                isCurrentDeck={{ A: !buildA.isSaved, B: !buildB.isSaved }}
                onShowCards={() => setTab('cards')}
              />
            ) : null
          ) : (
            <div className="grid min-w-0 gap-5 min-[1101px]:grid-cols-2 min-[1101px]:items-start">
              <BuildDeckView side="A" name={buildA.name} zones={buildA.zones} deltaByCardId={deltaByCardId} onCardClick={handleCardClick(buildA)} />
              <BuildDeckView side="B" name={buildB.name} zones={buildB.zones} deltaByCardId={deltaByCardId} onCardClick={handleCardClick(buildB)} />
            </div>
          )}
        </>
      )}

      <DeckImportDrawer
        deckBuilder={deckBuilder}
        deckFormat={deckFormat}
        isOpen={isImportOpen}
        target="comparison"
        onApplyImport={handleImport}
        onClose={() => setIsImportOpen(false)}
      />

      <RenameBuildDialog
        target={renameTarget}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          if (renameTarget?.id === CURRENT) {
            dispatch(setDeckName(name.trim()))
          } else if (renameTarget) {
            savedBuilds.rename(renameTarget.id, name)
          }
          setRenameTarget(null)
        }}
      />

      <ConfirmDialog
        confirmLabel="Borrar build"
        confirmColor="danger"
        description={`Se borra "${deleteTarget?.name ?? ''}" de tus builds guardadas. Tu deck actual no cambia.`}
        isOpen={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            savedBuilds.remove(deleteTarget.id)
            setSelection((current) => ({
              a: current.a === deleteTarget.id ? CURRENT : current.a,
              b: current.b === deleteTarget.id ? null : current.b,
            }))
          }
          setDeleteTarget(null)
        }}
        title="Borrar build"
      />

      <CardDetailModal
        card={detailCard}
        deckFormat={deckFormat}
        isOpen={detailCard !== null}
        showActions={false}
        onAddToZone={() => false}
        onClose={() => setDetailCard(null)}
      />

      {editing ? (
        <BuildBCardEditor
          card={pendingOfEditingBuild.find((card) => card.apiCard.ygoprodeckId === editing.card.apiCard.ygoprodeckId) ?? editing.card}
          currentEdit={undefined}
          allCards={pendingOfEditingBuild.length > 0 ? pendingOfEditingBuild : [editing.card]}
          onSave={handleClassify}
          onNavigate={(card) => setEditing({ buildId: editing.buildId, card })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </StepPage>
  )
}

function RenameBuildDialog({
  target,
  onCancel,
  onConfirm,
}: {
  target: { id: string; name: string } | null
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState('')

  useEffect(() => {
    setName(target?.name ?? '')
  }, [target])

  return (
    <Modal
      isOpen={target !== null}
      onClose={onCancel}
      size="sm"
      title="Renombrar build"
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onConfirm(name)}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (name.trim()) {
            onConfirm(name)
          }
        }}
      >
        <label className="grid gap-1.5">
          <span className="text-body text-muted">Nombre</span>
          <input
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            className={`${field} h-11 w-full px-3 text-base`}
          />
        </label>
      </form>
    </Modal>
  )
}
