import { useId, useState, type ReactNode } from 'react'

import { formatInteger, formatShortPercent } from '../../app/utils'
import type { PatternKind } from '../../types'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { Switch } from '../ui/Switch'
import { KindBadge } from './KindBadge'
import { LabSection } from './LabSection'
import { LAB_FOOTNOTE } from './lab-styles'
import { RuleRenameDialog } from './RuleRenameDialog'
import type { RuleEntry, RuleEntryGroups, TurnLean } from './probability-lab-helpers'

type KindFilter = 'all' | PatternKind

const KIND_FILTERS: ReadonlyArray<{ value: KindFilter; label: string }> = [
  { value: 'all', label: 'Todas' },
  { value: 'opening', label: 'Salidas' },
  { value: 'problem', label: 'Problemas' },
]

const TIER_BADGE = 'inline-flex items-center gap-[0.3rem] rounded-full bg-foreground/6 px-[0.55rem] py-[0.2rem] text-micro text-muted'

const RULE_ROW =
  'group relative grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 overflow-hidden rounded-control border border-[rgb(var(--lab-kind-rgb)/0.22)] bg-[rgb(var(--lab-kind-rgb)/0.04)] px-3 pb-3 pt-[0.6rem] text-left transition-[border-color,background,opacity,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary/70'
const RULE_ROW_INTERACTIVE =
  'cursor-pointer hover:border-[rgb(var(--lab-kind-rgb)/0.55)] hover:bg-[rgb(var(--lab-kind-rgb)/0.08)] active:scale-[0.99]'
const RULE_KIND_RGB: Record<PatternKind, string> = {
  opening: '[--lab-kind-rgb:var(--accent-rgb)]',
  problem: '[--lab-kind-rgb:var(--danger-rgb)]',
}
const RULE_STACK = 'contents min-[1101px]:grid min-[1101px]:min-w-0 min-[1101px]:content-start min-[1101px]:gap-5'
const RULE_TURN_BADGE = 'flex-none rounded-tag bg-warning/14 px-[0.3rem] py-[0.05rem] text-micro font-semibold text-warning'

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
      summary={`${formatInteger(groups.universal.length)} universales · ${formatInteger(enabledGeneric)}/${formatInteger(groups.generic.length)} genéricas · ${formatInteger(groups.custom.length)} propias`}
      className="order-5 min-[1101px]:col-span-full"
      actions={
        <div className="inline-flex gap-[0.2rem] rounded-full border border-border p-[0.2rem]" role="radiogroup" aria-label="Filtrar reglas por tipo">
          {KIND_FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              role="radio"
              aria-checked={kindFilter === filter.value}
              className={cx(
                'rounded-full px-[0.7rem] py-[0.3rem] text-caption font-semibold',
                kindFilter === filter.value ? 'bg-primary/22 text-foreground' : 'text-muted',
              )}
              onClick={() => setKindFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      }
    >
      <p className={LAB_FOOTNOTE}>
        Una mano es <strong>limpia</strong> si cumple al menos una salida y ningún problema activo.
      </p>

      {/* Desktop: reglas del sistema (plegables) a la izquierda, las propias a la derecha. */}
      <div className="grid gap-[1.1rem] min-[1101px]:grid-cols-2 min-[1101px]:items-start min-[1101px]:gap-5">
        <div className={RULE_STACK}>
          <RuleTier
            title="Universales"
            collapsible
            badge={
              <span className={TIER_BADGE}>
                <Icon name="lock" size={14} /> Siempre activas
              </span>
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
            badge={<span className={TIER_BADGE}>{formatInteger(enabledGeneric)} activas</span>}
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
              <Button variant="secondary" size="sm" onClick={onCreateCustom}>
                <Icon name="plus" size={14} strokeWidth={2} /> Crear regla
              </Button>
            }
            description="Combos, cartas clave o problemas propios de tu deck. Tocá una para editarla."
            entries={visible(groups.custom)}
            emptyState={
              groups.custom.length === 0 ? (
                <div className="grid gap-1 rounded-control border border-dashed border-border p-3 text-caption text-muted [&_strong]:text-small [&_strong]:text-foreground">
                  <strong>Todavía no creaste reglas</strong>
                  <span>
                    Ejemplos: “Abrir tu carta clave”, “Starter + pieza de combo” o “2+ Handtraps yendo 2º”.
                  </span>
                </div>
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
    <section className="grid min-w-0 content-start gap-[0.55rem]" aria-label={title}>
      <header className="grid gap-[0.2rem]">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
          {collapsible ? (
            <h4 className="m-0 text-body text-foreground">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center gap-[0.4rem] border-0 bg-transparent py-[0.2rem] pl-0 pr-[0.3rem] font-[inherit] text-inherit hover:text-primary"
                aria-expanded={isOpen}
                aria-controls={listId}
                onClick={() => setIsOpen((current) => !current)}
              >
                <Icon name="chevron-right" size={14} className={cx('text-soft transition-transform duration-150', isOpen && 'rotate-90')} />
                {title}
                <span className="rounded-full bg-secondary/90 px-[0.45rem] py-[0.05rem] text-micro font-bold text-muted">{formatInteger(entries.length)}</span>
              </button>
            </h4>
          ) : (
            <h4 className="m-0 text-body text-foreground">{title}</h4>
          )}
          {badge}
        </div>
        <p className={cx('m-0 text-caption text-muted', !isOpen && 'hidden')}>{description}</p>
      </header>

      {!isOpen ? null : entries.length === 0 ? (
        (emptyState ?? <p className={LAB_FOOTNOTE}>No hay reglas de este tipo.</p>)
      ) : (
        <ul id={listId} className="m-0 grid list-none gap-[0.4rem] p-0">
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
  const body = (
    <>
      <span className="grid min-w-0 gap-[0.15rem]">
        <span className="flex min-w-0 flex-wrap items-center gap-[0.4rem] text-body font-bold text-foreground">
          <KindBadge kind={entry.kind} />
          <span className="min-w-0 [overflow-wrap:anywhere]">{entry.name}</span>
          {showEditIcon ? <Icon name="pencil" size={13} className="size-[0.8rem] flex-none text-soft group-hover:text-foreground" /> : null}
          {entry.turnContext !== 'either' ? (
            <span className={RULE_TURN_BADGE}>{entry.turnContext === 'first' ? 'Solo 1º' : 'Solo 2º'}</span>
          ) : null}
          {entry.ignoresDraw && entry.turnContext !== 'first' ? <span className={RULE_TURN_BADGE} title="Yendo 2º no cuenta la carta robada">5 cartas</span> : null}
          {entry.turnLean ? <TurnLeanBadge kind={entry.kind} lean={entry.turnLean} /> : null}
        </span>
        <span className="truncate text-caption text-foreground opacity-85">{entry.summary}</span>
        {entry.description ? <span className="text-caption text-muted">{entry.description}</span> : null}
      </span>
      <span className="whitespace-nowrap text-body font-extrabold text-foreground tabular-nums">{formatRuleValue(entry)}</span>
      {entry.probability !== null ? (
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-[rgb(var(--lab-kind-rgb)/0.1)]" aria-hidden="true">
          <span
            className="block h-full origin-left bg-[rgb(var(--lab-kind-rgb)/0.85)] transition-transform duration-[240ms] motion-reduce:transition-none"
            style={{ transform: `scaleX(${Math.min(1, entry.probability)})` }} />
        </span>
      ) : null}
    </>
  )
  const isActive = entry.enabled && entry.appliesToView && !entry.missingCards
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
    <span className="flex-none cursor-help rounded-tag border border-primary/40 px-[0.3rem] py-[0.02rem] text-micro font-semibold text-foreground" title={`${meaning} ${detail}`}>
      Más yendo {turn}
      <span className="sr-only">. {meaning} {detail}</span>
    </span>
  )
}
