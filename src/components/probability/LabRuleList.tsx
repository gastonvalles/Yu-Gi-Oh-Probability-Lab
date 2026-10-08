import { useId, useState, type ReactNode } from 'react'

import { formatInteger, formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
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
import { LAB_FOOTNOTE } from './lab-styles'
import { RuleRenameDialog } from './RuleRenameDialog'
import type { RuleEntry, RuleEntryGroups, TurnLean } from './probability-lab-helpers'

type KindFilter = 'all' | PatternKind

const KIND_FILTERS: ReadonlyArray<SegmentedOption<KindFilter>> = [
  { value: 'all', label: 'Todas' },
  { value: 'opening', label: 'Salidas' },
  { value: 'problem', label: 'Problemas' },
]

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

  return (
    <LabSection
      title="Reglas del análisis"
      icon="list"
      summary={`${formatInteger(groups.universal.length)} universales · ${formatInteger(enabledGeneric)}/${formatInteger(groups.generic.length)} genéricas · ${formatInteger(groups.custom.length)} propias`}
      className="order-5 min-[1101px]:col-span-full"
      actions={<Segmented variant="chips" size="sm" label="Filtrar reglas por tipo" value={kindFilter} onChange={setKindFilter} options={KIND_FILTERS} />}
    >
      {/* Desktop: reglas del sistema (plegables) a la izquierda, las propias a la derecha. */}
      <div className="grid gap-[1.1rem] min-[1101px]:grid-cols-2 min-[1101px]:items-start min-[1101px]:gap-5">
        <div className={RULE_STACK}>
          <RuleTier
            title="Universales"
            collapsible
            badge={
              <Badge icon="lock" size="sm">
                Siempre activas
              </Badge>
            }
            description="Valen para cualquier deck de Yu-Gi-Oh!: definen la base de una mano jugable. Solo podés cambiarles el nombre."
            entries={visible(groups.universal)}
            renderRow={(entry) => (
              <RuleRow entry={entry} actionLabel="Renombrar" showEditIcon onClick={() => setRenamingId(entry.patternId)} />
            )}
          />
          <RuleTier
            title="Genéricas"
            collapsible
            badge={
              enabledGeneric < groups.generic.length ? (
                <Badge size="sm" tone={enabledGeneric > 0 ? 'success' : 'neutral'}>
                  {formatInteger(enabledGeneric)} activas
                </Badge>
              ) : null
            }
            description="Aplican a la mayoría de los decks. Apagalas o editalas para ajustar cantidades de copias."
            entries={visible(groups.generic)}
            renderRow={(entry) => (
              <RuleRow
                entry={entry}
                showEditIcon
                onClick={() => onEditGenericRule(entry)}
                trailing={
                  <Switch
                    checked={entry.enabled}
                    label={`${entry.enabled ? 'Desactivar' : 'Activar'} ${entry.name}`}
                    onChange={(enabled) => entry.presetId && onToggleGenericRule(entry.presetId, enabled)}
                  />
                }
              />
            )}
          />
        </div>
        <div className={RULE_STACK}>
          <RuleTier
            title="Tus reglas"
            badge={
              <Button variant="secondary" size="sm" icon="plus" onClick={onCreateCustom}>
                Crear regla
              </Button>
            }
            description=""
            entries={visible(groups.custom)}
            emptyState={
              groups.custom.length === 0 ? (
                <EmptyState icon="sparkles" title="Todavía no creaste reglas" className="py-6">
                  Ejemplos: “Abrir tu carta clave”, “Starter + pieza de combo” o “2+ Handtraps yendo 2º”.
                </EmptyState>
              ) : (
                <p className={LAB_FOOTNOTE}>No hay reglas propias de este tipo.</p>
              )
            }
            renderRow={(entry) => (
              <RuleRow
                entry={entry}
                onClick={() => onEditRule(entry.patternId)}
              />
            )}
          />
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
  badge,
  description,
  entries,
  emptyState,
  renderRow,
  collapsible = false,
}: {
  title: string
  collapsible?: boolean
  badge: ReactNode
  description: string
  entries: RuleEntry[]
  emptyState?: ReactNode
  renderRow: (entry: RuleEntry) => ReactNode
}) {
  // Las reglas del sistema arrancan plegadas: lo que el usuario edita son las propias.
  const [isOpen, setIsOpen] = useState(!collapsible)
  const listId = useId()

  return (
    <section className="grid min-w-0 content-start gap-2" aria-label={title}>
      <header className="grid gap-1">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {collapsible ? (
            <h4 className="m-0 text-body font-semibold text-foreground">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-2 rounded-control border-0 bg-transparent py-1 pr-2 font-[inherit] text-inherit hover:text-primary-soft focus-visible:outline-none focus-visible:shadow-focus"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen((current) => !current)}
              >
                <Icon name="chevron-right" size={14} className={cx('text-soft transition-transform duration-150', isOpen && 'rotate-90')} />
                {title}
                <Badge tone="brand" size="sm">{formatInteger(entries.length)}</Badge>
              </button>
            </h4>
          ) : (
            <h4 className="m-0 text-body font-semibold text-foreground">{title}</h4>
          )}
          {badge}
        </div>
        {description ? <p className={cx('m-0 text-micro text-muted', !isOpen && 'hidden')}>{description}</p> : null}
      </header>

      {!isOpen ? null : entries.length === 0 ? (
        (emptyState ?? <p className={LAB_FOOTNOTE}>No hay reglas de este tipo.</p>)
      ) : (
        <ul id={listId} className="m-0 grid list-none gap-0 divide-y divide-border-subtle p-0">
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
  actionLabel = 'Editar',
  showEditIcon = false,
}: {
  entry: RuleEntry
  trailing?: ReactNode
  onClick?: () => void
  /** Verbo del botón para lectores de pantalla ("Editar" / "Renombrar"). */
  actionLabel?: string
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
            <TurnBadge>{entry.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}</TurnBadge>
          ) : null}
          {entry.ignoresDraw && entry.turnContext !== 'first' ? <TurnBadge title="Yendo 2º no cuenta la carta robada">5 cartas</TurnBadge> : null}
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
    // El interruptor no puede ir dentro de un botón: la fila entera es el botón y el interruptor frena el toque.
    return (
      <div
        role="button"
        tabIndex={0}
        className={rowClass(true)}
        aria-label={`${actionLabel} regla ${entry.name}: ${formatRuleValue(entry)}`}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault()
            onClick()
          }
        }}
      >
        {body}
        <span className="flex" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          {trailing}
        </span>
      </div>
    )
  }

  if (onClick) {
    return (
      <button
        type="button"
        className={rowClass(true)}
        aria-label={`${actionLabel} regla ${entry.name}: ${formatRuleValue(entry)}${entry.turnLean ? `, más yendo ${entry.turnLean.favored === 'first' ? '1º' : '2º'}` : ''}`}
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
    return 'Falta carta'
  }

  if (!entry.enabled) {
    return 'Apagada'
  }

  if (!entry.isComplete) {
    return 'Incompleta'
  }

  if (!entry.appliesToView) {
    return 'No aplica'
  }

  return entry.probability === null ? '—' : formatShortPercent(entry.probability)
}

/** Aviso automático: la regla se da claramente más en un turno (aunque valga para ambos). */
function TurnLeanBadge({ kind, lean }: { kind: RuleEntry['kind']; lean: TurnLean }) {
  const turn = lean.favored === 'first' ? '1º' : '2º'
  const detail = `Yendo 1º: ${formatShortPercent(lean.first)} · yendo 2º: ${formatShortPercent(lean.second)}`
  const meaning =
    kind === 'opening'
      ? `Esta salida aparece más yendo ${turn}.`
      : `Este problema pesa más yendo ${turn}.`

  return (
    <Badge tone="brand" size="sm" shape="tag" className="cursor-help" title={`${meaning} ${detail}`}>
      Más yendo {turn}
      <span className="sr-only">
        . {meaning} {detail}
      </span>
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
