import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { getCopiesUsedByOtherConditions } from '../../app/pattern-card-usage'
import { RULE_EXAMPLES, moveCondition, type RuleExampleId } from '../../app/rule-edits'
import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { renderRich } from '../../i18n/rich'
import type { CardEntry, HandPattern, Matcher, PatternKind } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { CloseButton } from '../ui/IconButton'
import { OverflowMenu } from '../ui/OverflowMenu'
import { DraftImpactSummary } from './DraftImpactSummary'
import { KindBadge } from './KindBadge'
import type { PatternEditorActions } from './pattern-editor-actions'
import { RuleBuilder } from './rule-builder'
import { CategoryPicker, type PickerTab } from './rule-builder/CategoryPicker'
import { RuleReadback } from './rule-builder/RuleReadback'
import type { DraftImpact } from './use-draft-impact'

/** El texto de cada ejemplo, por id (las claves se leen al dibujar). */
const EXAMPLE_KEY = {
  'key-card': { title: 'builder.examples.keyCard.title', body: 'builder.examples.keyCard.body' },
  'starter-combo': { title: 'builder.examples.starterCombo.title', body: 'builder.examples.starterCombo.body' },
  'handtraps-second': { title: 'builder.examples.handtrapsSecond.title', body: 'builder.examples.handtrapsSecond.body' },
  'no-interaction': { title: 'builder.examples.noInteraction.title', body: 'builder.examples.noInteraction.body' },
} as const satisfies Record<RuleExampleId, { title: string; body: string }>

export function exampleTitle(id: RuleExampleId): string {
  return t(EXAMPLE_KEY[id].title)
}

export interface PatternEditorDrawerProps {
  isOpen: boolean
  /** Crear (primero los ejemplos) o editar una regla que ya está. */
  mode: 'create' | 'edit'
  /** Al crear desde el pie de una columna, el tipo pedido: los ejemplos se limitan a ese tipo. */
  createKind?: PatternKind | null
  /** Qué regla se edita: la etiqueta de la cabecera («Tuya» / «Genérica»). */
  tier?: 'custom' | 'generic' | null
  /** Al crear, se muestran los ejemplos hasta elegir uno (o «Empezar en blanco»). */
  showExamples: boolean
  pattern: HandPattern | null
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  impact: { impact: DraftImpact | null; pending: boolean }
  canSave: boolean
  /** Por qué no se puede guardar (va en rojo en el pie), o null. */
  blockReason: string | null
  /** El nombre de la regla que ya mide lo mismo, si la hay. */
  duplicateOf: string | null
  /** Elige un ejemplo (o el blanco): devuelve la condición que falta completar, para abrir su selector en «Cartas». */
  onPickExample: (id: RuleExampleId | 'blank') => string | null
  onClose: () => void
  onSave: () => void
  onDelete?: () => void
  onRestore?: () => void
  onDuplicate?: () => void
}

/**
 * El editor de reglas del Lab: en el celular, una hoja a pantalla completa; desde 768 px, un cajón de 560 px con el Lab atenuado detrás. Arriba y fijos, el número
 * en vivo y la regla leída en una frase; en el medio, el editor de una sola pantalla; abajo y fijas, las acciones. «Qué cuenta» se elige en el mismo cajón.
 */
export function PatternEditorDrawer({
  isOpen,
  mode,
  createKind = null,
  tier = null,
  showExamples,
  pattern,
  actions,
  derivedMainCards,
  impact,
  canSave,
  blockReason,
  duplicateOf,
  onPickExample,
  onClose,
  onSave,
  onDelete,
  onRestore,
  onDuplicate,
}: PatternEditorDrawerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLElement>(null)
  // El selector de qué cuenta reemplaza al editor (en el mismo cajón): la condición que se está eligiendo y la pestaña con la que abre.
  const [picking, setPicking] = useState<{ conditionId: string; tab: PickerTab } | null>(null)
  // Al volver del selector, el foco vuelve al botón de esa condición.
  const returnFocusRef = useRef<string | null>(null)
  const cardById = useMemo(() => new Map(derivedMainCards.map((card) => [card.id, card])), [derivedMainCards])
  const pickingIndex = picking && pattern ? pattern.conditions.findIndex((condition) => condition.id === picking.conditionId) : -1
  const pickingCondition = pickingIndex >= 0 ? pattern!.conditions[pickingIndex]! : null
  const view = showExamples ? 'examples' : pickingCondition ? 'picker' : 'editor'

  const back = () => {
    returnFocusRef.current = picking?.conditionId ?? null
    setPicking(null)
  }
  // Escape vuelve del selector a la regla; desde la regla, pide cerrar (con cambios, pregunta antes).
  useEscapeKey(view === 'picker' ? back : onClose, isOpen)
  useBodyScrollLock(isOpen)
  useFocusTrap(asideRef, isOpen)

  // Cada vista nueva lleva el foco a su comienzo (lo que tenía el foco ya no está); al volver del selector, al botón de esa condición. Al abrir no:
  // la trampa de foco ya lo lleva a `[data-initial-focus]` (y recuerda qué lo abrió, para devolvérselo al cerrar).
  const lastViewRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      lastViewRef.current = null
      return
    }

    const previous = lastViewRef.current
    lastViewRef.current = view

    if (previous === null || previous === view) {
      return
    }

    const aside = asideRef.current
    const returnTo = returnFocusRef.current
    returnFocusRef.current = null
    const target = returnTo && view === 'editor' ? aside?.querySelector<HTMLElement>(`[data-condition-pick="${returnTo}"]`) : aside?.querySelector<HTMLElement>('[data-initial-focus]')

    target?.focus({ preventScroll: true })
  }, [isOpen, view])

  const openPicker = (conditionId: string, tab: PickerTab = 'roles') => setPicking({ conditionId, tab })

  const pickExample = (id: RuleExampleId | 'blank') => {
    const pending = onPickExample(id)

    if (pending) {
      openPicker(pending, 'cards')
    }
  }

  const usePicked = (matcher: Matcher) => {
    if (pattern && pickingCondition) {
      actions.setRequirementMatcher(pattern.id, pickingCondition.id, matcher)
    }
    back()
  }

  const isCreating = mode === 'create'
  const title = isCreating ? t('builder.drawer.titleNew') : pattern?.name.trim() || t('builder.drawer.titleNew')
  const examples = RULE_EXAMPLES.filter((example) => !createKind || example.kind === createKind)
  const complete = pattern !== null && pattern.conditions.length > 0 && pattern.conditions.every((condition) => condition.matcher !== null)
  const menuItems = onDuplicate ? [{ label: t(tier === 'generic' ? 'builder.drawer.duplicateOwn' : 'builder.drawer.duplicate'), icon: 'cards' as const, onSelect: onDuplicate }] : []

  const drawer = (
    <div ref={rootRef} className="fixed inset-0 isolate z-150">
      <button
        type="button"
        tabIndex={-1}
        aria-label={t('builder.drawer.close')}
        className="absolute inset-0 h-full w-full animate-nav-scrim bg-background/60 motion-reduce:animate-none"
        onClick={onClose}
      />

      <aside
        ref={asideRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={view === 'picker' && pickingIndex >= 0 ? t('builder.picker.title', { index: pickingIndex + 1 }) : title}
        className="absolute inset-y-0 right-0 grid w-full animate-drawer-enter grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-card-background outline-none motion-reduce:animate-none md:w-140 md:border-l md:border-border-subtle md:shadow-overlay"
      >
        {view === 'picker' && pattern && pickingCondition ? (
          <CategoryPicker
            key={pickingCondition.id}
            index={pickingIndex + 1}
            currentMatcher={pickingCondition.matcher}
            derivedMainCards={derivedMainCards}
            usedCopies={getCopiesUsedByOtherConditions(pattern, pickingCondition.id, derivedMainCards)}
            initialTab={picking?.tab}
            onBack={back}
            onClose={onClose}
            onUse={usePicked}
          />
        ) : (
          <>
            <header className="grid gap-3 border-b border-border-subtle px-4 pb-3.5 pt-2.5 md:px-6 md:pb-4 md:pt-3">
              <div className="flex min-h-11 items-center gap-2">
                <Heading level="section" as="h2" tabIndex={-1} data-initial-focus={view === 'editor' ? true : undefined} className="min-w-0 flex-1 outline-none">
                  {title}
                </Heading>
                {!isCreating && tier ? (
                  <Badge tone="neutral" size="sm">
                    {t(tier === 'generic' ? 'builder.drawer.generic' : 'builder.list.own')}
                  </Badge>
                ) : null}
                {!isCreating && menuItems.length > 0 ? <OverflowMenu label={t('builder.drawer.more')} items={menuItems} /> : null}
                <CloseButton size="md" aria-label={t('builder.drawer.close')} onClick={onClose} />
              </div>

              {view === 'editor' && pattern ? (
                <>
                  <DraftImpactSummary kind={pattern.kind} complete={complete} impact={impact.impact} pending={impact.pending} />
                  <RuleReadback pattern={pattern} cardById={cardById} />
                  {duplicateOf ? <p className="m-0 text-body font-semibold text-danger-soft">{t('lab.entry.duplicate', { name: duplicateOf })}</p> : null}
                </>
              ) : null}
            </header>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5">
              {view === 'examples' ? (
                <div className="grid gap-4">
                  <p className="m-0 text-body text-muted">{t('builder.examples.intro')}</p>
                  <ul aria-label={t('builder.examples.label')} className="m-0 grid list-none gap-3 p-0">
                    {examples.map((example, index) => (
                      <li key={example.id}>
                        <button
                          type="button"
                          data-initial-focus={index === 0 ? true : undefined}
                          className="grid w-full gap-1.5 rounded-card border border-border-subtle bg-background px-4 py-3.5 text-left transition-[border-color,background-color] duration-150 hover:border-info focus-visible:border-info focus-visible:outline-none focus-visible:shadow-focus"
                          onClick={() => pickExample(example.id)}
                        >
                          <span className="flex items-center gap-2">
                            <KindBadge kind={example.kind} />
                            <span className="text-body font-semibold text-foreground">{t(EXAMPLE_KEY[example.id].title)}</span>
                          </span>
                          <span className="text-body text-muted">{renderRich(t(EXAMPLE_KEY[example.id].body), { b: (text) => <b className="font-semibold text-info-soft">{text}</b> })}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <Button variant="secondary" icon="plus" className="justify-self-start" onClick={() => pickExample('blank')}>
                    {t('builder.examples.blank')}
                  </Button>
                </div>
              ) : pattern ? (
                <RuleBuilder
                  actions={actions}
                  derivedMainCards={derivedMainCards}
                  pattern={pattern}
                  onPickCondition={(conditionId) => openPicker(conditionId)}
                  onMoveCondition={(from, to) => actions.replacePatterns([moveCondition(pattern, from, to)])}
                />
              ) : null}
            </div>

            <footer className="flex items-center gap-2 border-t border-border-subtle px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 md:px-6">
              {view === 'examples' ? (
                <span className="flex-1" />
              ) : onDelete ? (
                <span className="flex-1">
                  <Button variant="tertiary" color="danger" icon="trash" aria-label={t('builder.drawer.delete')} className="px-3" onClick={onDelete}>
                    {t('builder.list.delete')}
                  </Button>
                </span>
              ) : onRestore ? (
                <span className="flex-1">
                  <Button variant="tertiary" aria-label={t('builder.drawer.restore')} className="px-3" onClick={onRestore}>
                    <span className="sm:hidden">{t('builder.rename.restore')}</span>
                    <span className="max-sm:hidden">{t('builder.drawer.restore')}</span>
                  </Button>
                </span>
              ) : (
                <span className={cx('min-w-0 flex-1 text-body', blockReason ? 'font-semibold text-danger-soft' : 'text-muted')} aria-live="polite">
                  {blockReason}
                </span>
              )}
              <Button variant="tertiary" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              {view === 'examples' ? null : (
                <Button variant="primary" disabled={!canSave} onClick={onSave}>
                  {t(isCreating ? 'builder.drawer.create' : 'builder.drawer.saveChanges')}
                </Button>
              )}
            </footer>
          </>
        )}
      </aside>
    </div>
  )

  // Al cerrarse sale por donde entró (`usePresence`): el panel se corre a la derecha y se funde, y el velo también.
  return usePresence(isOpen, isOpen ? (typeof document === 'undefined' ? drawer : createPortal(drawer, document.body)) : null, () => [rootRef.current])
}
