import { useEffect, useMemo, useRef, useState } from 'react'

import { createPattern } from '../../app/pattern-factory'
import { buildActiveRuleSet, type PatternPreset } from '../../app/pattern-presets'
import type { LabResults } from '../../app/probability-lab'
import { buildRuleExample, duplicateRule, findDuplicateRule, removeRule, restoreGenericRule, restoreRemovedRule, type RemovedRule, type RuleCandidate, type RuleExampleId } from '../../app/rule-edits'
import { useShellInsets } from '../../app/shell-layout'
import { useToastMessage } from '../../app/use-toast-message'
import type { PatternEditorDefaults } from '../../app/use-pattern-editor-actions'
import { createId } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, HandPattern, PatternKind } from '../../types'
import { cx } from '../ui/cx'
import { formatPer100 } from '../ui/ring-shared'
import { textLink } from '../ui/typography'
import { ConfirmDialog } from './ConfirmDialog'
import { LabRuleList } from './LabRuleList'
import { PatternEditorDrawer, exampleTitle } from './PatternEditorDrawer'
import type { PatternEditorActions } from './pattern-editor-actions'
import { buildPatternCompactSummary } from './pattern-helpers'
import type { RuleEntry, RuleEntryGroups } from './probability-lab-helpers'
import { turnViewOf, useDraftImpact, useLabPreview } from './use-draft-impact'
import { usePatternDraft } from './use-pattern-draft'

/** Cuánto queda el «Deshacer» a la vista después de borrar. */
const UNDO_MS = 6000

interface LabRulesProps {
  groups: RuleEntryGroups
  /** Las reglas propias tal como están guardadas (las que se reemplazan, borran y restauran). */
  patterns: HandPattern[]
  /** Las propias que entran al cálculo (sin las que perdieron su carta). */
  customPatterns: HandPattern[]
  presets: PatternPreset[]
  /** El deck (para medir) y el deck con las cartas que faltan (para los nombres). */
  cards: CardEntry[]
  labelCards: CardEntry[]
  disabledGenericRuleIds: string[]
  handSize: number
  /** El resultado del Lab de hoy: el «antes» del número en vivo y de borrar. */
  results: LabResults | null
  patternActions: PatternEditorActions
  patternEditorDefaults: PatternEditorDefaults
  onToggleGenericRule: (presetId: string, enabled: boolean) => void
  onRenameSystemRule: (presetId: string, name: string) => void
  className?: string
}

interface EditorState {
  /** create: «Nueva regla», con los ejemplos primero · edit: la regla con su nombre. */
  mode: 'create' | 'edit'
  /** El tipo pedido al crear desde una columna (limita los ejemplos). */
  createKind: PatternKind | null
  showExamples: boolean
  /** Al guardar: se suma (nueva, o la primera edición de una genérica) o reemplaza a la guardada. */
  persist: 'append' | 'replace'
  tier: 'custom' | 'generic' | null
  /** La genérica del catálogo que se edita, si es una. */
  presetId: string | null
}

interface UndoState {
  removed: RemovedRule
  message: string
}

/**
 * La tarjeta de reglas y todo lo que se hace con ellas: crear (ejemplos o en blanco), editar, renombrar, duplicar, restaurar la genérica original y borrar con
 * confirmación y «Deshacer». El editor trabaja sobre un borrador: el Lab sólo recalcula al guardar.
 */
export function LabRules({
  groups,
  patterns,
  customPatterns,
  presets,
  cards,
  labelCards,
  disabledGenericRuleIds,
  handSize,
  results,
  patternActions,
  patternEditorDefaults,
  onToggleGenericRule,
  onRenameSystemRule,
  className,
}: LabRulesProps) {
  const { showToast } = useToastMessage()
  const draft = usePatternDraft(patternEditorDefaults)
  const draftPattern = draft.draft
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<HandPattern | null>(null)
  const [undo, setUndo] = useState<UndoState | null>(null)

  const cleanBefore = useMemo(
    () => (results ? { first: results.first.cleanProbability, second: results.second.cleanProbability, average: results.average.cleanProbability } : null),
    [results],
  )
  const impact = useDraftImpact({ draft: editor && !editor.showExamples ? draftPattern : null, cards, customPatterns, disabledGenericRuleIds, handSize, cleanBefore })

  const candidates = useMemo<RuleCandidate[]>(() => {
    const disabled = new Set(disabledGenericRuleIds)
    const overridden = new Set(customPatterns.flatMap((pattern) => (pattern.systemRuleId ? [pattern.systemRuleId] : [])))

    return [
      ...presets.filter((preset) => (preset.tier === 'universal' || !disabled.has(preset.id)) && !overridden.has(preset.id)).map((preset) => ({ id: preset.id, name: preset.title, pattern: preset.pattern })),
      ...customPatterns.filter((pattern) => !(pattern.systemRuleId && disabled.has(pattern.systemRuleId))).map((pattern) => ({ id: pattern.id, name: pattern.name, pattern })),
    ]
  }, [customPatterns, disabledGenericRuleIds, presets])

  const complete = draftPattern !== null && draftPattern.conditions.length > 0 && draftPattern.conditions.every((condition) => condition.matcher !== null)
  const duplicateOf = draftPattern && editor && !editor.showExamples ? findDuplicateRule(draftPattern, candidates) : null
  const canSave = editor !== null && !editor.showExamples && complete && duplicateOf === null && (editor.persist === 'append' && !editor.presetId ? true : draft.isDirty)
  const blockReason = !complete ? t('builder.hint.pick') : duplicateOf ? t('builder.hint.duplicate') : null

  // Cómo quedan las manos buenas sin la regla que se va a borrar: el texto de la confirmación.
  const removalInput = useMemo(
    () => (pendingDelete ? { cards, patterns: buildActiveRuleSet(cards, customPatterns.filter((pattern) => pattern.id !== pendingDelete.id), disabledGenericRuleIds), handSize } : null),
    [cards, customPatterns, disabledGenericRuleIds, handSize, pendingDelete],
  )
  const removal = useLabPreview(removalInput)

  // Si la regla abierta desaparece del store (p. ej. la curaron), se cierra el editor.
  useEffect(() => {
    if (editor?.persist === 'replace' && draftPattern && !patterns.some((pattern) => pattern.id === draftPattern.id)) {
      draft.close()
      setEditor(null)
    }
  }, [draft, draftPattern, editor, patterns])

  const closeEditor = () => {
    draft.close()
    setEditor(null)
    setConfirmDiscard(false)
  }

  const openCreate = (kind: PatternKind | null) => {
    draft.open(createPattern('', undefined, kind ?? 'opening'))
    setEditor({ mode: 'create', createKind: kind, showExamples: true, persist: 'append', tier: null, presetId: null })
  }

  const openEdit = (patternId: string) => {
    const pattern = patterns.find((candidate) => candidate.id === patternId)

    if (pattern) {
      draft.open(pattern)
      setEditor({ mode: 'edit', createKind: null, showExamples: false, persist: 'replace', tier: pattern.systemRuleId ? 'generic' : 'custom', presetId: pattern.systemRuleId ?? null })
    }
  }

  // Editar una genérica = editar su versión propia: la primera vez se arma desde la del catálogo y, al guardar, la reemplaza en su lugar (sigue siendo genérica).
  const openEditGeneric = (entry: RuleEntry) => {
    if (patterns.some((pattern) => pattern.id === entry.patternId)) {
      openEdit(entry.patternId)
      return
    }

    const preset = presets.find((candidate) => candidate.id === entry.presetId)

    if (preset) {
      draft.open({ ...preset.pattern, id: createId('pattern'), systemRuleId: preset.id, conditions: preset.pattern.conditions.map((condition) => ({ ...condition })) })
      setEditor({ mode: 'edit', createKind: null, showExamples: false, persist: 'append', tier: 'generic', presetId: preset.id })
    }
  }

  const openDuplicate = (pattern: HandPattern, name: string) => {
    draft.open(duplicateRule(pattern, t('builder.drawer.copyName', { name })))
    setEditor({ mode: 'create', createKind: null, showExamples: false, persist: 'append', tier: null, presetId: null })
  }

  const pickExample = (id: RuleExampleId | 'blank'): string | null => {
    setEditor((current) => (current ? { ...current, showExamples: false } : current))

    if (id === 'blank') {
      return null
    }

    const example = buildRuleExample(id, exampleTitle(id))
    draft.open(example.pattern)

    return example.pendingConditionId
  }

  // Guardar es el único momento en que la regla llega al store (y se recalcula). Sin nombre, se usa la frase corta.
  const save = () => {
    if (!draftPattern || !editor || !canSave) {
      return
    }

    const cardById = new Map(labelCards.map((card) => [card.id, card]))
    const saved = draftPattern.name.trim().length > 0 ? draftPattern : { ...draftPattern, name: buildPatternCompactSummary(draftPattern, cardById) }

    if (editor.persist === 'append') {
      patternActions.appendPattern(saved)
    } else {
      patternActions.replacePatterns(patterns.map((pattern) => (pattern.id === saved.id ? saved : pattern)))
    }

    showToast(editor.mode === 'create' ? t('lab.panel.toast.created') : t('lab.panel.toast.saved'), 'success')
    closeEditor()
  }

  const requestClose = () => {
    const hasUnsavedWork =
      editor?.mode === 'create' ? !editor.showExamples && ((draftPattern?.conditions.some((condition) => condition.matcher !== null) ?? false) || draft.isDirty) : draft.isDirty

    if (hasUnsavedWork) {
      setConfirmDiscard(true)
      return
    }

    closeEditor()
  }

  const requestDelete = (patternId: string) => {
    const pattern = patterns.find((candidate) => candidate.id === patternId)

    if (pattern) {
      setPendingDelete(pattern)
    }
  }

  const confirmDelete = () => {
    if (!pendingDelete) {
      return
    }

    const { patterns: next, removed } = removeRule(patterns, pendingDelete.id)
    patternActions.replacePatterns(next)

    if (draftPattern?.id === pendingDelete.id) {
      closeEditor()
    }

    if (removed) {
      setUndo({ removed, message: t('builder.undo.deleted', { name: pendingDelete.name }) })
    }

    setPendingDelete(null)
  }

  // Restaurar la genérica original también se deshace: lo que se va es la versión editada.
  const restoreOriginal = () => {
    const presetId = editor?.presetId
    const edited = patterns.find((pattern) => pattern.systemRuleId === presetId)
    const preset = presets.find((candidate) => candidate.id === presetId)

    if (!presetId || !edited) {
      return
    }

    const index = patterns.indexOf(edited)
    patternActions.replacePatterns(restoreGenericRule(patterns, presetId))
    closeEditor()
    setUndo({ removed: { pattern: edited, index }, message: t('builder.undo.restored', { name: preset?.title ?? edited.name }) })
  }

  const undoLast = () => {
    if (!undo) {
      return
    }

    patternActions.replacePatterns(restoreRemovedRule(patterns, undo.removed))
    setUndo(null)
    showToast(t('builder.undo.done', { name: undo.removed.pattern.name }), 'success')
  }

  const deleteText = (() => {
    if (!pendingDelete) {
      return ''
    }

    const view = turnViewOf(pendingDelete.turnContext)

    if (!cleanBefore || removal?.status !== 'ok') {
      return t('builder.delete.plain')
    }

    const before = formatPer100(cleanBefore[view])
    const after = formatPer100(removal.results[view].cleanProbability)

    return before === after ? t('builder.delete.same') : t(`builder.delete.impact.${pendingDelete.turnContext}`, { before, after })
  })()

  const editingStored = editor?.persist === 'replace'

  return (
    <>
      <LabRuleList
        groups={groups}
        className={className}
        onEditRule={openEdit}
        onToggleGenericRule={onToggleGenericRule}
        onEditGenericRule={openEditGeneric}
        onRenameSystemRule={onRenameSystemRule}
        onCreate={openCreate}
        onDuplicateRule={(patternId) => {
          const pattern = patterns.find((candidate) => candidate.id === patternId)
          if (pattern) openDuplicate(pattern, pattern.name)
        }}
        onDeleteRule={requestDelete}
      />

      <PatternEditorDrawer
        isOpen={editor !== null}
        mode={editor?.mode ?? 'create'}
        createKind={editor?.createKind ?? null}
        tier={editor?.tier ?? null}
        showExamples={editor?.showExamples ?? false}
        pattern={draftPattern}
        actions={draft.actions}
        derivedMainCards={labelCards}
        impact={impact}
        canSave={canSave}
        blockReason={blockReason}
        duplicateOf={duplicateOf}
        onPickExample={pickExample}
        onClose={requestClose}
        onSave={save}
        onDelete={editingStored && editor?.tier === 'custom' && draftPattern ? () => requestDelete(draftPattern.id) : undefined}
        onRestore={editingStored && editor?.tier === 'generic' ? restoreOriginal : undefined}
        onDuplicate={editor?.mode === 'edit' && draftPattern ? () => openDuplicate(draftPattern, draftPattern.name.trim() || (editor.tier === 'generic' ? t('builder.drawer.generic') : '')) : undefined}
      />

      <ConfirmDialog
        cancelLabel={t('builder.discard.keep')}
        confirmLabel={t('builder.discard.confirm')}
        confirmColor="danger"
        description={t(editor?.mode === 'create' ? 'builder.discard.bodyNew' : 'builder.discard.bodyEdit')}
        isOpen={confirmDiscard}
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={closeEditor}
        title={t(editor?.mode === 'create' ? 'builder.discard.titleNew' : 'builder.discard.titleEdit')}
      />

      <ConfirmDialog
        confirmLabel={t('builder.delete.confirm')}
        confirmColor="danger"
        description={deleteText}
        isOpen={pendingDelete !== null}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title={t('builder.delete.title', { name: pendingDelete?.name ?? '' })}
      />

      {undo ? <UndoBar key={undo.removed.pattern.id} message={undo.message} kind={undo.removed.pattern.kind} onUndo={undoLast} onExpire={() => setUndo(null)} /> : null}
    </>
  )
}

/**
 * El aviso de abajo después de borrar (o de restaurar una genérica): el mensaje y «Deshacer», unos segundos. En el celular va sobre la barra de abajo, a lo ancho;
 * en escritorio, abajo a la derecha. Recibe el foco (la fila borrada ya no está); si se va con el foco adentro, el foco pasa a «Crear …» de esa columna.
 */
function UndoBar({ message, kind, onUndo, onExpire }: { message: string; kind: PatternKind; onUndo: () => void; onExpire: () => void }) {
  const { bottom } = useShellInsets()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const expireRef = useRef(onExpire)

  useEffect(() => {
    expireRef.current = onExpire
  })

  useEffect(() => {
    buttonRef.current?.focus({ preventScroll: true })
    const timer = window.setTimeout(() => {
      if (buttonRef.current && buttonRef.current === document.activeElement) {
        document.querySelector<HTMLElement>(`[data-create-kind="${kind}"]`)?.focus({ preventScroll: true })
      }
      expireRef.current()
    }, UNDO_MS)

    return () => window.clearTimeout(timer)
  }, [kind])

  return (
    <div
      role="status"
      className="fixed inset-x-4 z-160 flex animate-toast-in items-center gap-3 rounded-card border border-tint/10 bg-surface-raised py-1.5 pl-4 pr-1.5 text-body text-foreground shadow-overlay motion-reduce:animate-none min-[1101px]:left-auto min-[1101px]:right-6 min-[1101px]:w-110"
      style={{ bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottom}px + 0.75rem)` }}
    >
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{message}</span>
      <button ref={buttonRef} type="button" className={cx(textLink, 'min-h-11 shrink-0 rounded-control px-3')} onClick={onUndo}>
        {t('builder.undo.action')}
      </button>
    </div>
  )
}
