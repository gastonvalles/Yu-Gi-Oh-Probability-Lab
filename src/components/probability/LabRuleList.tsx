import { useId, useState, type ReactNode } from 'react'

import { formatInteger, formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { Button } from '../ui/Button'
import { ChevronLeftIcon, LockIcon, PlusIcon } from '../ui/icons'
import { Switch } from '../ui/Switch'
import { LabSection } from './LabSection'
import type { RuleEntry, RuleEntryGroups, TurnLean } from './probability-lab-helpers'

type KindFilter = 'all' | PatternKind

const KIND_FILTERS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'opening', label: 'Salidas' },
  { value: 'problem', label: 'Problemas' },
]

interface LabRuleListProps {
  groups: RuleEntryGroups
  onEditRule: (patternId: string) => void
  onToggleGenericRule: (presetId: string, enabled: boolean) => void
  onCreateCustom: () => void
}

export function LabRuleList({
  groups,
  onEditRule,
  onToggleGenericRule,
  onCreateCustom,
}: LabRuleListProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>('all')
  const visible = (entries: RuleEntry[]) =>
    kindFilter === 'all' ? entries : entries.filter((entry) => entry.kind === kindFilter)
  const enabledGeneric = groups.generic.filter((entry) => entry.enabled).length

  return (
    <LabSection
      title="Reglas del análisis"
      summary={`${formatInteger(groups.universal.length)} universales · ${formatInteger(enabledGeneric)}/${formatInteger(groups.generic.length)} genéricas · ${formatInteger(groups.custom.length)} propias`}
      className="lab-rules"
      actions={
        <div className="lab-filter" role="radiogroup" aria-label="Filtrar reglas por tipo">
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={kindFilter === filter.value}
              data-active={kindFilter === filter.value ? 'true' : 'false'}
              className="lab-filter-option"
              onClick={() => setKindFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      }
    >
      <p className="lab-footnote m-0">
        Una mano es <strong>limpia</strong> si cumple al menos una salida y ningún problema activo.
      </p>

      {/* Desktop: reglas del sistema (plegables) a la izquierda, las propias a la derecha. */}
      <div className="lab-rule-tiers">
        <div className="lab-rule-stack">
          <RuleTier
            title="Universales"
            collapsible
            badge={
              <span className="lab-tier-badge">
                <LockIcon /> Siempre activas
              </span>
            }
            description="Valen para cualquier deck de Yu-Gi-Oh!: definen la base de una mano jugable."
            entries={visible(groups.universal)}
            renderRow={(entry) => <RuleRow entry={entry} />}
          />
          <RuleTier
            title="Genéricas"
            collapsible
            badge={<span className="lab-tier-badge">{formatInteger(enabledGeneric)} activas</span>}
            description="Aplican a la mayoría de los decks. Apagá las que no tengan sentido para el tuyo."
            entries={visible(groups.generic)}
            renderRow={(entry) => (
              <RuleRow
                entry={entry}
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
        <div className="lab-rule-stack">
          <RuleTier
            title="Tus reglas"
            badge={
              <Button variant="secondary" size="sm" onClick={onCreateCustom}>
                <PlusIcon width={14} height={14} /> Crear regla
              </Button>
            }
            description="Combos, cartas clave o problemas propios de tu deck. Tocá una para editarla."
            entries={visible(groups.custom)}
            emptyState={
              groups.custom.length === 0 ? (
                <div className="lab-rule-empty">
                  <strong>Todavía no creaste reglas</strong>
                  <span>
                    Ejemplos: “Abrir tu carta clave”, “Starter + pieza de combo” o “2+ Handtraps yendo 2º”.
                  </span>
                </div>
              ) : (
                <p className="lab-empty-note">No hay reglas propias de este tipo.</p>
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
    <section className="lab-rule-tier" aria-label={title} data-open={isOpen ? 'true' : 'false'}>
      <header className="lab-rule-tier-head">
        <div className="lab-rule-tier-title">
          {collapsible ? (
            <h4>
              <button
                type="button"
                className="lab-rule-tier-toggle"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen((current) => !current)}
              >
                <ChevronLeftIcon className="lab-rule-tier-chevron" width={14} height={14} />
                {title}
                <span className="lab-rule-tier-count">{formatInteger(entries.length)}</span>
              </button>
            </h4>
          ) : (
            <h4>{title}</h4>
          )}
          {badge}
        </div>
        <p>{description}</p>
      </header>

      {!isOpen ? null : entries.length === 0 ? (
        (emptyState ?? <p className="lab-empty-note">No hay reglas de este tipo.</p>)
      ) : (
        <ul id={listId} className="lab-rule-list">
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
}: {
  entry: RuleEntry
  trailing?: ReactNode
  onClick?: () => void
}) {
  const body = (
    <>
      <span className="lab-rule-main">
        <span className="lab-rule-name">
          <span className="lab-kind-badge" data-kind={entry.kind}>
            {entry.kind === 'opening' ? 'Salida' : 'Problema'}
          </span>
          <span className="lab-rule-title">{entry.name}</span>
          {entry.turnContext !== 'either' ? (
            <span className="lab-rule-turn">{entry.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}</span>
          ) : null}
          {entry.turnLean ? <TurnLeanBadge kind={entry.kind} lean={entry.turnLean} /> : null}
        </span>
        <span className="lab-rule-support">{entry.summary}</span>
        {entry.description ? <span className="lab-rule-description">{entry.description}</span> : null}
      </span>
      <span className="lab-rule-value">{formatRuleValue(entry)}</span>
      {entry.probability !== null ? (
        <span className="lab-rule-bar" aria-hidden="true">
          <span style={{ width: `${Math.min(100, entry.probability * 100)}%` }} />
        </span>
      ) : null}
    </>
  )
  const state = {
    'data-kind': entry.kind,
    'data-enabled': entry.enabled && entry.appliesToView && !entry.missingCards ? 'true' : 'false',
  }

  if (onClick) {
    return (
      <button
        type="button"
        className="lab-rule"
        {...state}
        aria-label={`Editar regla ${entry.name}: ${formatRuleValue(entry)}${entry.turnLean ? `, más yendo ${entry.turnLean.favored === 'first' ? '1º' : '2º'}` : ''}`}
        onClick={onClick}
      >
        {body}
      </button>
    )
  }

  return (
    <div className="lab-rule" {...state}>
      {body}
      {trailing ? <span className="lab-rule-trailing">{trailing}</span> : null}
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
    <span className="lab-rule-lean" data-kind={kind} title={`${meaning} ${detail}`}>
      Más yendo {turn}
      <span className="sr-only">. {meaning} {detail}</span>
    </span>
  )
}
