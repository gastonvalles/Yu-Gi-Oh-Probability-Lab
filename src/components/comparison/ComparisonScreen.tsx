import { useCallback, useEffect, useMemo, useState } from 'react'

import { buildComparisonInputs, compareBuilds, isCardPendingClassification } from '../../app/build-comparison'
import type { BuildDraft } from '../../app/build-draft'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { whatMovesMeasure, type MeasureKey } from '../../app/change-effects'
import { pairChanges, type MainChange } from '../../app/change-pairs'
import { CURRENT_SOURCE, type BuildSource } from '../../app/comparison-selection'
import { adoptBuild, undoDeckChange, type DeckChangeToken } from '../../app/deck-change-actions'
import type { DeckBuilderState, DeckCardInstance } from '../../app/model'
import { useAppDispatch, useAppSelector } from '../../app/store-hooks'
import { useChangeEffects } from '../../app/use-change-effects'
import { useComparisonSelection } from '../../app/use-comparison-selection'
import { useDeckBefore } from '../../app/use-deck-before'
import { useLabDraft } from '../../app/use-lab-draft'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { CardOrigin, CardRole, TurnView } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { DeckImportDrawer } from '../deck-mode/DeckImportDrawer'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { useLabComputation } from '../probability/use-lab-computation'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { StepPage } from '../ui/StepPage'
import { field } from '../ui/surfaces'
import { BuildBCardEditor } from './BuildBCardEditor'
import { BuildPair, SourceSheet } from './BuildPicker'
import { joinList, sourceOptions, type SourceOption } from './build-sources'
import { ChangeList } from './ChangeList'
import { FirstTimeCard, SameDeckCard } from './CompareEmpty'
import { deltaPoints, mirrorGroups, type Side } from './comparison-rows'
import { MirrorRowsCard, type MoversInfo } from './MirrorRow'
import { TwoLists } from './TwoLists'
import { useSavedBuilds } from './use-saved-builds'
import { cleanPair, CompareActionBar, VerdictAction, VerdictCard, type PendingInfo } from './VerdictCard'

const NO_CHANGES: readonly MainChange[] = []
/** Cuántos nombres de cartas sin clasificar se dicen en el aviso (las demás, «y N más»). */
const NAMED_PENDING = 3

/** A otra pantalla del recorrido (el armazón escucha la dirección). */
const goTo = (step: 'probability-lab' | 'deck-builder' | 'categorization') => {
  window.location.hash = `#${step}`
}

/**
 * Comparar (`#workspace`): cuál de dos builds abre mejor. Arriba el par A/B (ya elegido al entrar: tu deck contra «Tu deck de antes» o tu última build); el
 * veredicto con sus dos anillos y la lente de turno; las filas espejo de tus reglas y tus roles; «Qué cambiaste» de a pares, con lo que mueve cada cambio; y
 * la acción que sigue, «Cargar B en el builder», pegada a su número (en el celular, en una barra fija al alcance del pulgar) y con «Deshacer».
 */
export function ComparisonScreen() {
  const deckBuilder = useAppSelector((state) => state.deckBuilder)
  const patterns = useAppSelector((state) => state.patterns.patterns)
  const disabledGenericRuleIds = useAppSelector((state) => state.patterns.disabledGenericRuleIds)
  const systemRuleNames = useAppSelector((state) => state.patterns.systemRuleNames)
  const handSize = useAppSelector((state) => state.settings.handSize)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const dispatch = useAppDispatch()
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const savedBuilds = useSavedBuilds()
  const deckBefore = useDeckBefore()
  const draft = useLabDraft()
  const { showToast } = useToastMessage()
  const [view, setView] = useState<TurnView>('average')
  const [picker, setPicker] = useState<Side | null>(null)
  const [listsOpen, setListsOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [detailCard, setDetailCard] = useState<ApiCardSearchResult | null>(null)
  const [editing, setEditing] = useState<{ buildId: string; card: DeckCardInstance } | null>(null)
  // Lo que dice la región `aria-live` (el aviso de «Cargaste B» también se lee, no sólo se ve).
  const [announcement, setAnnouncement] = useState('')

  const sources = useMemo(
    () => ({ current: deckBuilder, deckBefore, draft: draft.zones, savedBuilds: savedBuilds.builds }),
    [deckBuilder, deckBefore, draft.zones, savedBuilds.builds],
  )
  const { selection, setA, setB, swap } = useComparisonSelection(sources)
  const options = useMemo(() => sourceOptions(sources, deckBuilder.deckName.trim()), [sources, deckBuilder.deckName])
  const optionA = options.find((option) => option.source === selection.a) ?? options[0]!
  const optionB = selection.b === null ? null : (options.find((option) => option.source === selection.b) ?? null)
  const zonesA = optionA.zones
  const zonesB = optionB?.zones ?? null
  const nameA = optionA.name
  const nameB = optionB?.name ?? ''

  // La enumeración de manos de cada build corre en los workers (y queda en caché por contenido); compareBuilds sólo arma el informe con esos resultados.
  const rules = useMemo(() => ({ patterns, disabledGenericRuleIds, systemRuleNames, handSize }), [patterns, disabledGenericRuleIds, systemRuleNames, handSize])
  const inputA = useMemo(() => ({ name: nameA, cards: deriveMainDeckCardsFromZone(zonesA.main) }), [nameA, zonesA])
  const inputB = useMemo(() => (zonesB ? { name: nameB, cards: deriveMainDeckCardsFromZone(zonesB.main) } : null), [nameB, zonesB])
  const labInputs = useMemo(() => (inputB ? buildComparisonInputs(inputA, inputB, rules) : null), [inputA, inputB, rules])
  const labA = useLabComputation(labInputs?.a ?? null)
  const labB = useLabComputation(labInputs?.b ?? null)
  const comparison = useMemo(
    () =>
      inputB
        ? compareBuilds(inputA, inputB, rules, { a: labA.isComputing ? undefined : labA.computation, b: labB.isComputing ? undefined : labB.computation })
        : null,
    [inputA, inputB, rules, labA.computation, labA.isComputing, labB.computation, labB.isComputing],
  )

  // «Qué cambiaste» y lo que mueve cada cambio solo (en los workers, con prioridad baja: lo que se espera va primero).
  const changes = useMemo(() => (zonesB ? pairChanges(zonesA, zonesB) : null), [zonesA, zonesB])
  const effects = useChangeEffects(changes && !changes.identical ? zonesA.main : null, changes?.main ?? NO_CHANGES, rules)
  const moversOf = useCallback(
    (measure: MeasureKey): MoversInfo => ({
      status: !effects.isDone ? 'loading' : changes?.main.some((change) => change.pending) ? 'pending' : 'ready',
      movers: changes ? whatMovesMeasure(changes.main, effects.results, measure, view) : [],
    }),
    [changes, effects, view],
  )
  const groups = useMemo(() => (comparison && comparison.verdict.kind !== 'computing' ? mirrorGroups(comparison) : null), [comparison])

  // Las cartas de tu deck se clasifican en Roles; las que sólo están en una build guardada, acá.
  const referenceIds = useMemo(() => new Set(deckBuilder.main.map((card) => card.apiCard.ygoprodeckId)), [deckBuilder.main])
  const classifiableHere = (option: SourceOption | null) =>
    option?.kind === 'saved' ? option.zones.main.filter((card) => isCardPendingClassification(card) && !referenceIds.has(card.apiCard.ygoprodeckId)) : []

  const pendingSide: Side | null = comparison ? (comparison.b.pendingCards.length > 0 ? 'B' : comparison.a.pendingCards.length > 0 ? 'A' : null) : null
  const pendingCards = pendingSide && comparison ? (pendingSide === 'A' ? comparison.a : comparison.b).pendingCards : []
  const pending: PendingInfo | null = pendingSide
    ? {
        side: pendingSide,
        count: pendingCards.length,
        names: joinList([
          ...pendingCards.slice(0, NAMED_PENDING).map((card) => card.name),
          ...(pendingCards.length > NAMED_PENDING ? [t('meta.compare.more', { n: formatInteger(pendingCards.length - NAMED_PENDING) })] : []),
        ]),
      }
    : null

  const classifyPending = () => {
    const option = pendingSide === 'A' ? optionA : optionB
    const here = classifiableHere(option)

    if (option && here.length > 0) {
      setEditing({ buildId: option.source, card: here[0]! })
    } else {
      goTo('categorization')
    }
  }

  const undo = (token: DeckChangeToken, fromDraft: BuildDraft | null) => {
    const undone = dispatch(undoDeckChange(token))

    // Si B era el borrador del Lab, vuelve a serlo: Deshacer deja todo como estaba.
    if (undone && fromDraft) {
      draft.start(fromDraft)
    }

    const message = t(undone ? 'meta.compare.undone' : 'meta.compare.undoBlocked')
    setAnnouncement(message)
    showToast(message, undone ? 'info' : 'warning')
  }

  const adoptB = () => {
    if (!optionB || optionB.kind === 'current') {
      return
    }

    const fromDraft = optionB.kind === 'draft' ? draft.draft : null
    // El deck se llama como la build (o como la copia de antes); el borrador es tu deck con un cambio: conserva su nombre.
    const token = dispatch(adoptBuild({ zones: optionB.zones, name: optionB.kind === 'draft' ? undefined : optionB.deckName || undefined }))

    if (fromDraft) {
      draft.discard()
    }

    // A pasa a ser tu deck nuevo y B, solo, el que dejaste («Tu deck de antes» es más nuevo que lo elegido).
    if (selection.a !== CURRENT_SOURCE) {
      setA(CURRENT_SOURCE)
    }

    setListsOpen(false)
    const message = t('meta.compare.adopted', { name: optionB.kind === 'deck-before' && optionB.deckName ? optionB.deckName : optionB.name })
    setAnnouncement(message)
    showToast(message, 'success', { action: { label: t('meta.compare.undo'), onAction: () => undo(token, fromDraft) } })
  }

  const saveCurrent = () => {
    setPicker(null)

    if (deckBuilder.main.length === 0) {
      showToast(t('meta.compare.toastEmpty'), 'warning')
      return
    }

    const build = savedBuilds.save(deckBuilder.deckName, deckBuilder, 'deck')
    showToast(t('meta.compare.toastSaved', { name: build.name }), 'success')
  }

  const saveDraft = () => {
    const build = draft.saveAsBuild()

    if (build) {
      setB(build.id)
      showToast(t('meta.compare.toastSaved', { name: build.name }), 'success')
    }
  }

  const handleImport = (deck: DeckBuilderState) => {
    // Sin nombre, la build queda con uno genérico en el idioma de ese momento (se guarda con ella; después se puede renombrar).
    const build = savedBuilds.save(deck.deckName || t('meta.compare.importedBuild'), deck, 'import')
    setB(build.id)
    setImportOpen(false)
    showToast(t('meta.compare.toastImported', { name: build.name }), 'success')
  }

  const choose = (side: Side, source: BuildSource) => {
    setPicker(null)

    if (side === 'A') setA(source)
    else setB(source)
  }

  const openImport = () => {
    setPicker(null)
    setImportOpen(true)
  }

  const handleCardClick = (side: Side, card: DeckCardInstance) => {
    const option = side === 'A' ? optionA : optionB

    if (classifiableHere(option).some((candidate) => candidate.apiCard.ygoprodeckId === card.apiCard.ygoprodeckId)) {
      setEditing({ buildId: option!.source, card })
      return
    }

    setDetailCard({ ...card.apiCard, name: card.name })
  }

  const editingOption = editing ? (options.find((option) => option.source === editing.buildId) ?? null) : null
  const editingPending = classifiableHere(editingOption)
  const handleClassify = (ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) => {
    if (editing) {
      savedBuilds.classifyCard(editing.buildId, ygoprodeckId, origin, roles)
    }
  }

  // Si la B desaparece (se borró la build, se descartó el borrador) con las listas abiertas, se cierran.
  useEffect(() => {
    if (!optionB) setListsOpen(false)
  }, [optionB])

  const computing = comparison?.verdict.kind === 'computing'
  const points = comparison && !computing ? deltaPoints(cleanPair(comparison, view)) : null
  const adopt = optionB && optionB.kind !== 'current' && comparison ? { onClick: adoptB, emphasis: comparison.verdict.kind === 'b' } : null
  const classifyLabel = pending ? t('meta.compare.classify', { count: pending.count, n: formatInteger(pending.count) }) : ''
  const comparing = optionB !== null && changes !== null && !changes.identical && comparison !== null
  const pair = <BuildPair a={optionA} b={optionB} layout={isDesktop ? 'row' : 'stacked'} onPick={setPicker} onSwap={isDesktop ? swap : undefined} />

  return (
    // Hasta 1101 px todo va en una columna: en una tableta no pasa del ancho de un celular grande (las filas espejo no se leen con A y B a 1000 px).
    <StepPage aria-label={t('meta.compare.label')} aria-busy={computing} className="max-[1101px]:max-w-2xl">
      <StepHero title={t('meta.compare.title')} icon="columns" subtitle={t('meta.compare.subtitle')} side={isDesktop ? pair : undefined} />
      {isDesktop ? null : pair}

      {!optionB || !changes || !comparison ? (
        <FirstTimeCard onTryLab={() => goTo('probability-lab')} onImport={openImport} />
      ) : changes.identical ? (
        <SameDeckCard result={comparison.a.results?.average ?? null} computing={computing} cards={zonesA.main.length + zonesA.extra.length + zonesA.side.length} onGoToBuilder={() => goTo('deck-builder')} onTryLab={() => goTo('probability-lab')} />
      ) : (
        // Dos columnas en escritorio: el veredicto y sus filas a la izquierda, «Qué cambiaste» a la derecha, pegado arriba mientras se leen las filas (por eso `items-start`).
        <div className="grid min-w-0 gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] min-[1101px]:items-start min-[1101px]:gap-5">
          <div className="grid min-w-0 gap-4 min-[1101px]:gap-5">
            <VerdictCard
              comparison={comparison}
              view={view}
              onViewChange={setView}
              handSize={handSize}
              moversOf={moversOf}
              pending={pending}
              classifyButton={
                isDesktop && pending ? (
                  <Button variant="primary" icon="tag" onClick={classifyPending}>
                    {classifyLabel}
                  </Button>
                ) : undefined
              }
              footer={
                pending ? null : isDesktop ? (
                  <div className="border-t border-border-subtle pt-4">
                    <VerdictAction layout="card" points={points} loading={computing} adopt={adopt} onSaveDraft={optionB.kind === 'draft' ? saveDraft : undefined} />
                  </div>
                ) : optionB.kind === 'draft' ? (
                  <Button variant="secondary" icon="save" className="justify-self-start" onClick={saveDraft}>
                    {t('meta.compare.saveDraft')}
                  </Button>
                ) : null
              }
            />
            {pending || comparison.verdict.kind === 'incomplete' ? null : <MirrorRowsCard groups={groups} view={view} moversOf={moversOf} />}
          </div>
          <ChangeList changes={changes} results={effects.results} view={view} onOpenLists={() => setListsOpen(true)} className="min-[1101px]:sticky min-[1101px]:top-6" />
        </div>
      )}

      {!isDesktop && comparing ? (
        <CompareActionBar onSwap={swap}>
          {pending ? (
            <Button variant="primary" icon="tag" className="min-w-0 flex-1 sm:ml-auto sm:flex-none" onClick={classifyPending}>
              {classifyLabel}
            </Button>
          ) : (
            <VerdictAction layout="bar" points={points} loading={computing} adopt={adopt} />
          )}
        </CompareActionBar>
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {optionB && changes ? (
        <TwoLists
          isOpen={listsOpen}
          onClose={() => setListsOpen(false)}
          a={optionA}
          b={optionB}
          changes={changes}
          onCardClick={handleCardClick}
          footer={pending ? undefined : <VerdictAction layout={isDesktop ? 'card' : 'bar'} points={points} loading={computing} adopt={adopt} className="w-full" />}
        />
      ) : null}

      <SourceSheet
        side={picker}
        options={options}
        selection={selection}
        onChoose={choose}
        onRename={(option) => {
          setPicker(null)
          setRenameTarget({ id: option.source, name: option.name })
        }}
        onDelete={(option) => {
          setPicker(null)
          setDeleteTarget({ id: option.source, name: option.name })
        }}
        onImport={openImport}
        onSaveCurrent={saveCurrent}
        onClose={() => setPicker(null)}
      />

      <DeckImportDrawer deckBuilder={deckBuilder} deckFormat={deckFormat} isOpen={importOpen} target="comparison" onApplyImport={handleImport} onClose={() => setImportOpen(false)} />

      <RenameBuildDialog
        target={renameTarget}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(name) => {
          if (renameTarget) savedBuilds.rename(renameTarget.id, name)
          setRenameTarget(null)
        }}
      />

      <ConfirmDialog
        title={t('meta.compare.deleteTitle')}
        confirmLabel={t('meta.compare.deleteConfirm')}
        confirmColor="danger"
        description={t('meta.compare.deleteBody', { name: deleteTarget?.name ?? '' })}
        isOpen={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) savedBuilds.remove(deleteTarget.id)
          setDeleteTarget(null)
        }}
      />

      <CardDetailModal card={detailCard} deckFormat={deckFormat} isOpen={detailCard !== null} showActions={false} onAddToZone={() => false} onClose={() => setDetailCard(null)} />

      {editing ? (
        <BuildBCardEditor
          card={editingPending.find((card) => card.apiCard.ygoprodeckId === editing.card.apiCard.ygoprodeckId) ?? editing.card}
          currentEdit={undefined}
          allCards={editingPending.length > 0 ? editingPending : [editing.card]}
          onSave={handleClassify}
          onNavigate={(card) => setEditing({ buildId: editing.buildId, card })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </StepPage>
  )
}

function RenameBuildDialog({ target, onCancel, onConfirm }: { target: { id: string; name: string } | null; onCancel: () => void; onConfirm: (name: string) => void }) {
  const [name, setName] = useState('')

  useEffect(() => {
    setName(target?.name ?? '')
  }, [target])

  return (
    <Modal
      isOpen={target !== null}
      onClose={onCancel}
      size="sm"
      title={t('meta.compare.renameTitle')}
      footer={
        <>
          <Button variant="tertiary" size="md" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" size="md" disabled={!name.trim()} onClick={() => onConfirm(name)}>
            {t('common.save')}
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
          <span className="text-body text-muted">{t('meta.compare.renameField')}</span>
          <input value={name} autoFocus onChange={(event) => setName(event.target.value)} className={cx(field, 'h-11 w-full px-3 text-base')} />
        </label>
      </form>
    </Modal>
  )
}
