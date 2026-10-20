import { useState, type ReactNode } from 'react'

import { formatInteger, formatShortPercent } from '../../app/utils'
import { t, type MessageKey } from '../../i18n'
import type { PatternKind } from '../../types'
import { Heading } from '../ui/Heading'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { Segmented, type SegmentedOption } from '../ui/Segmented'
import { Switch } from '../ui/Switch'
import { TONE } from '../ui/tone'
import { KindBadge } from './KindBadge'
import { LabSection } from './LabSection'
import { formatCardCount, turnWord } from './lab-copy'
import { LAB_FOOTNOTE } from './lab-styles'
import { RuleRenameDialog } from './RuleRenameDialog'
import type { RuleEntry, RuleEntryGroups, TurnLean } from './probability-lab-helpers'

type KindFilter = 'all' | PatternKind

// Las tablas guardan claves de mensajes, no textos: el texto se arma al dibujar, en el idioma de ese momento.
const KIND_FILTER_KEY = {
  all: 'lab.rules.filter.all',
  opening: 'lab.rules.filter.opening',
  problem: 'lab.rules.filter.problem',
} as const satisfies Record<KindFilter, MessageKey>

function kindFilterOptions(): SegmentedOption<KindFilter>[] {
  return (['all', 'opening', 'problem'] as const).map((value) => ({ value, label: t(KIND_FILTER_KEY[value]) }))
}

/** Cada acción de la fila tiene su frase entera (con y sin el aviso de turno): el orden de las palabras lo decide el idioma. */
const ROW_LABEL_KEY = {
  edit: { plain: 'lab.rules.row.edit', lean: 'lab.rules.row.editLean' },
  rename: { plain: 'lab.rules.row.rename', lean: 'lab.rules.row.renameLean' },
} as const

/** Fila sin caja: las separa una línea fina y sólo se marca al pasar el mouse o tocarla. */
const RULE_ROW =
  'group relative grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 rounded-control px-2 py-2.5 text-left transition-[background-color,opacity] duration-150 focus-visible:outline-none focus-visible:shadow-focus'
const RULE_ROW_INTERACTIVE = 'cursor-pointer hover:bg-tint/6 active:bg-tint/10'
const RULE_KIND_RGB: Record<PatternKind, string> = {
  opening: TONE.success.rgb,
  problem: TONE.danger.rgb,
}
const RULE_STACK = 'contents min-[1101px]:grid min-[1101px]:min-w-0 min-[1101px]:content-start min-[1101px]:gap-5'

interface LabRuleListProps {
  groups: RuleEntryGroups
  onEditRule: (patternId: string) => void
  onToggleGenericRule: (presetId: string, enabled: boolean) => void
  /** Abre el editor de una regla genérica (cantidades de copias, cartas, etc.). */
  onEditGenericRule: (entry: RuleEntry) => void
  /** Cambia el nombre de una regla universal (vacío = el original). */
  onRenameSystemRule: (presetId: string, name: string) => void
  onCreateCustom: () => void
}

export function LabRuleList({
  groups,
  onEditRule,
  onToggleGenericRule,
  onEditGenericRule,
  onRenameSystemRule,
  onCreateCustom,
}: LabRuleListProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const renaming = groups.universal.find((entry) => entry.patternId === renamingId) ?? null
  const visible = (entries: RuleEntry[]) =>
    kindFilter === 'all' ? entries : entries.filter((entry) => entry.kind === kindFilter)
  const enabledGeneric = groups.generic.filter((entry) => entry.enabled).length
  // Las reglas con cartas que ya no están en el deck no cuentan: van aparte, plegadas, para limpiarlas o arreglarlas.
  const liveCustom = groups.custom.filter((entry) => !entry.missingCards)
  const orphans = visible(groups.custom.filter((entry) => entry.missingCards))

  return (
    <LabSection
      title={t('lab.rules.title')}
      icon="list"
      summary={t('lab.rules.summary', {
        universal: formatInteger(groups.universal.length),
        enabled: formatInteger(enabledGeneric),
        generic: formatInteger(groups.generic.length),
        custom: formatInteger(groups.custom.length),
      })}
      className="order-5 min-[1101px]:col-span-full"
      actions={<Segmented variant="chips" size="sm" label={t('lab.rules.filter.label')} value={kindFilter} onChange={setKindFilter} options={kindFilterOptions()} />}
    >
      {/* Desktop: reglas del sistema (plegables) a la izquierda, las propias a la derecha. */}
      <div className="grid gap-[1.1rem] min-[1101px]:grid-cols-2 min-[1101px]:items-start min-[1101px]:gap-5">
        <div className={RULE_STACK}>
          <RuleTier
            title={t('lab.rules.universal.title')}
            count={groups.universal.length}
            badge={
              <Badge icon="lock" size="sm">
                {t('lab.rules.universal.badge')}
              </Badge>
            }
            description={t('lab.rules.universal.description')}
            entries={visible(groups.universal)}
            renderRow={(entry) => (
              <RuleRow entry={entry} action="rename" showEditIcon onClick={() => setRenamingId(entry.patternId)} />
            )}
          />
          <RuleTier
            title={t('lab.rules.generic.title')}
            count={groups.generic.length}
            badge={
              enabledGeneric < groups.generic.length ? (
                <Badge size="sm" tone={enabledGeneric > 0 ? 'success' : 'neutral'}>
                  {t('lab.rules.generic.badge', { n: formatInteger(enabledGeneric) })}
                </Badge>
              ) : null
            }
            description={t('lab.rules.generic.description')}
            entries={visible(groups.generic)}
            renderRow={(entry) => (
              <RuleRow
                entry={entry}
                showEditIcon
                onClick={() => onEditGenericRule(entry)}
                trailing={
                  <Switch
                    checked={entry.enabled}
                    label={entry.enabled ? t('lab.rules.toggle.off', { name: entry.name }) : t('lab.rules.toggle.on', { name: entry.name })}
                    onChange={(enabled) => entry.presetId && onToggleGenericRule(entry.presetId, enabled)}
                  />
                }
              />
            )}
          />
        </div>
        <div className={RULE_STACK}>
          <RuleTier
            title={t('lab.rules.custom.title')}
            badge={
              <Button variant="secondary" size="sm" icon="plus" onClick={onCreateCustom}>
                {t('lab.rules.custom.create')}
              </Button>
            }
            description=""
            entries={visible(liveCustom)}
            emptyState={
              liveCustom.length === 0 ? (
                <EmptyState icon="list" title={t('lab.rules.custom.emptyTitle')} className="py-6">
                  {t('lab.rules.custom.emptyExamples')}
                </EmptyState>
              ) : (
                <p className={LAB_FOOTNOTE}>{t('lab.rules.custom.noneOfKind')}</p>
              )
            }
            renderRow={(entry) => (
              <RuleRow
                entry={entry}
                onClick={() => onEditRule(entry.patternId)}
              />
            )}
          />
          {orphans.length > 0 ? (
            <details className="group grid gap-1" aria-label={t('lab.rules.orphans.title')}>
              <summary className="m-0 flex cursor-pointer list-none items-center justify-between gap-2 rounded-control py-1.5 text-body font-semibold text-foreground focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-2">
                  {t('lab.rules.orphans.title')}
                  <Badge tone="warning" size="sm">{formatInteger(orphans.length)}</Badge>
                </span>
                <Icon name="chevron-down" size={16} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
              </summary>
              <p className="m-0 text-micro text-muted">{t('lab.rules.orphans.description')}</p>
              <ul className="m-0 grid list-none gap-0 divide-y divide-border-subtle p-0">
                {orphans.map((entry) => (
                  <li key={entry.patternId}>
                    <RuleRow entry={entry} onClick={() => onEditRule(entry.patternId)} />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>
      {renaming?.presetId ? (
        <RuleRenameDialog
          entry={renaming}
          onSave={(name) => onRenameSystemRule(renaming.presetId!, name)}
          onClose={() => setRenamingId(null)}
        />
      ) : null}
    </LabSection>
  )
}

function RuleTier({
  title,
  count,
  badge,
  description,
  entries,
  emptyState,
  renderRow,
}: {
  title: string
  /** Cantidad de reglas del grupo (se muestra junto al título). */
  count?: number
  badge: ReactNode
  description: string
  entries: RuleEntry[]
  emptyState?: ReactNode
  renderRow: (entry: RuleEntry) => ReactNode
}) {
  return (
    <section className="grid min-w-0 content-start gap-2" aria-label={title}>
      <header className="grid gap-1">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          <Heading level="card" as="h4" className="flex items-center gap-2">
            {title}
            {count !== undefined ? <Badge tone="neutral" size="sm">{formatInteger(count)}</Badge> : null}
          </Heading>
          {badge}
        </div>
        {description ? <p className="m-0 text-micro text-muted">{description}</p> : null}
      </header>

      {entries.length === 0 ? (
        (emptyState ?? <p className={LAB_FOOTNOTE}>{t('lab.rules.noneOfKind')}</p>)
      ) : (
        <ul className="m-0 grid list-none gap-0 divide-y divide-border-subtle p-0">
          {entries.map((entry) => (
            <li key={entry.patternId}>{renderRow(entry)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RuleRow({
  entry,
  trailing,
  onClick,
  action = 'edit',
  showEditIcon = false,
}: {
  entry: RuleEntry
  trailing?: ReactNode
  onClick?: () => void
  /** Qué hace el botón para lectores de pantalla: editar o renombrar. */
  action?: 'edit' | 'rename'
  showEditIcon?: boolean
}) {
  const isActive = entry.enabled && entry.appliesToView && !entry.missingCards
  const body = (
    <>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-body font-semibold text-foreground">
          <KindBadge kind={entry.kind} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{entry.name}</span>
          {showEditIcon ? <Icon name="pencil" size={13} className="flex-none text-soft group-hover:text-foreground" /> : null}
          {entry.turnContext !== 'either' ? (
            <TurnBadge>{entry.turnContext === 'first' ? t('lab.rules.badge.onlyFirst') : t('lab.rules.badge.onlySecond')}</TurnBadge>
          ) : null}
          {entry.ignoresDraw && entry.turnContext !== 'first' ? <TurnBadge title={t('lab.rules.badge.ignoresDraw')}>{formatCardCount(5)}</TurnBadge> : null}
          {entry.turnLean ? <TurnLeanBadge kind={entry.kind} lean={entry.turnLean} /> : null}
        </span>
        {entry.description ? (
          <span className="text-micro text-muted">{entry.description}</span>
        ) : (
          <span className="truncate text-micro text-muted">{entry.summary}</span>
        )}
      </span>
      {entry.probability !== null && isActive ? (
        <ProgressRing
          value={entry.probability}
          size={44}
          tone={entry.kind === 'opening' ? 'success' : 'danger'}
          label={`${entry.name}: ${formatShortPercent(entry.probability)}`}
        />
      ) : (
        <span className="whitespace-nowrap text-micro font-semibold text-soft">{formatRuleValue(entry)}</span>
      )}
    </>
  )
  const rowClass = (interactive: boolean) =>
    cx(RULE_ROW, RULE_KIND_RGB[entry.kind], interactive && RULE_ROW_INTERACTIVE, !isActive && 'opacity-55')

  if (onClick && trailing) {
    // El interruptor no puede ir dentro de un botón (un role="button" oculta a sus hijos para lectores de
    // pantalla): la fila es un contenedor, el cuerpo es el botón de editar y el interruptor queda al lado.
    return (
      <div className={cx(rowClass(true), 'has-[button:focus-visible]:shadow-focus')}>
        {/* `contents`: el botón no genera caja y sus hijos ocupan las columnas de la grilla como antes. */}
        <button
          type="button"
          className="contents cursor-pointer text-left focus-visible:outline-none"
          aria-label={t(ROW_LABEL_KEY[action].plain, { name: entry.name, value: formatRuleValue(entry) })}
          onClick={onClick}
        >
          {body}
        </button>
        <span className="flex">{trailing}</span>
      </div>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={rowClass(true)}
        aria-label={
          entry.turnLean
            ? t(ROW_LABEL_KEY[action].lean, { name: entry.name, value: formatRuleValue(entry), turn: turnWord(entry.turnLean.favored) })
            : t(ROW_LABEL_KEY[action].plain, { name: entry.name, value: formatRuleValue(entry) })
        }
        onClick={onClick}
      >
        {body}
      </button>
    )
  }

  return (
    <div className={rowClass(false)}>
      {body}
      {trailing ? <span className="flex">{trailing}</span> : null}
    </div>
  )
}

function formatRuleValue(entry: RuleEntry): string {
  if (entry.missingCards) {
    return t('lab.rules.value.missingCard')
  }

  if (!entry.enabled) {
    return t('lab.rules.value.off')
  }

  if (!entry.isComplete) {
    return t('lab.rules.value.incomplete')
  }

  if (!entry.appliesToView) {
    return t('lab.rules.value.notApplicable')
  }

  return entry.probability === null ? '—' : formatShortPercent(entry.probability)
}

/** Aviso automático: la regla se da claramente más en un turno (aunque valga para ambos). */
function TurnLeanBadge({ kind, lean }: { kind: RuleEntry['kind']; lean: TurnLean }) {
  const turn = turnWord(lean.favored)
  const title = t(kind === 'opening' ? 'lab.rules.lean.opening' : 'lab.rules.lean.problem', {
    turn,
    first: formatShortPercent(lean.first),
    second: formatShortPercent(lean.second),
  })

  return (
    <Badge tone="brand" size="sm" shape="tag" className="cursor-help" title={title}>
      {t('lab.rules.lean.badge', { turn })}
      <span className="sr-only">. {title}</span>
    </Badge>
  )
}

function TurnBadge({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Badge tone="warning" size="sm" shape="tag" title={title}>
      {children}
    </Badge>
  )
}
