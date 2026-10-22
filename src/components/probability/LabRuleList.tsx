import { useState, type ReactNode } from 'react'

import { Presence } from '../../app/use-presence'
import { formatInteger, formatShortPercent } from '../../app/utils'
import { t } from '../../i18n'
import type { PatternKind } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { OverflowMenu } from '../ui/OverflowMenu'
import { ProgressRing } from '../ui/ProgressRing'
import { Switch } from '../ui/Switch'
import { judgeTone } from '../ui/tone'
import { LabSection } from './LabSection'
import { formatCardCount, turnWord } from './lab-copy'
import { RuleRenameDialog } from './RuleRenameDialog'
import type { RuleEntry, RuleEntryGroups, TurnLean } from './probability-lab-helpers'

/** Cada acción de la fila tiene su frase entera (con y sin el aviso de turno): el orden de las palabras lo decide el idioma. */
const ROW_LABEL_KEY = {
  edit: { plain: 'lab.rules.row.edit', lean: 'lab.rules.row.editLean' },
  rename: { plain: 'lab.rules.row.rename', lean: 'lab.rules.row.renameLean' },
} as const

const COLUMN = {
  opening: { title: 'builder.list.openings', hint: 'builder.list.openingsHint', create: 'builder.list.createOpening' },
  problem: { title: 'builder.list.problems', hint: 'builder.list.problemsHint', create: 'builder.list.createProblem' },
} as const

interface LabRuleListProps {
  groups: RuleEntryGroups
  /** Abre el editor de una regla propia (también las que perdieron su carta). */
  onEditRule: (patternId: string) => void
  onToggleGenericRule: (presetId: string, enabled: boolean) => void
  /** Abre el editor de una regla genérica (cantidades de copias, cartas, etc.). */
  onEditGenericRule: (entry: RuleEntry) => void
  /** Cambia el nombre de una regla universal (vacío = el original). */
  onRenameSystemRule: (presetId: string, name: string) => void
  /** Crear una regla: arriba elige el tipo en el editor (null); al pie de cada columna, ya viene elegido. */
  onCreate: (kind: PatternKind | null) => void
  onDuplicateRule: (patternId: string) => void
  onDeleteRule: (patternId: string) => void
  className?: string
}

/**
 * La tarjeta de reglas del Lab: dos columnas, **Salidas | Problemas**, con una fila de 60 px por regla (su anillo y, a la derecha, el candado de las universales,
 * el interruptor de las genéricas o el ⋯ de las tuyas) y «Crear una salida / un problema» al pie de cada una. El tipo de regla se dice con esos controles y la
 * etiqueta «Tuya»; la letra chica (de dónde sale cada regla) queda en la línea del candado.
 */
export function LabRuleList({ groups, onEditRule, onToggleGenericRule, onEditGenericRule, onRenameSystemRule, onCreate, onDuplicateRule, onDeleteRule, className = 'order-5 min-[1101px]:col-span-full' }: LabRuleListProps) {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const renaming = groups.universal.find((entry) => entry.patternId === renamingId) ?? null
  // Las reglas con cartas que ya no están en el deck no cuentan: van aparte, plegadas, para arreglarlas o borrarlas.
  const liveCustom = groups.custom.filter((entry) => !entry.missingCards)
  const orphans = groups.custom.filter((entry) => entry.missingCards)
  const all = [...groups.universal, ...groups.generic, ...liveCustom]
  const ofKind = (kind: PatternKind) => all.filter((entry) => entry.kind === kind)
  const openings = ofKind('opening').length
  const problems = ofKind('problem').length

  const renderRow = (entry: RuleEntry) =>
    entry.tier === 'universal' ? (
      <RuleRow entry={entry} action="rename" onOpen={() => setRenamingId(entry.patternId)} control={<LockMark />} />
    ) : entry.tier === 'generic' ? (
      <RuleRow
        entry={entry}
        onOpen={() => onEditGenericRule(entry)}
        control={
          <Switch
            size="lg"
            checked={entry.enabled}
            label={entry.enabled ? t('lab.rules.toggle.off', { name: entry.name }) : t('lab.rules.toggle.on', { name: entry.name })}
            onChange={(enabled) => entry.presetId && onToggleGenericRule(entry.presetId, enabled)}
          />
        }
      />
    ) : (
      <RuleRow
        entry={entry}
        own
        onOpen={() => onEditRule(entry.patternId)}
        control={
          <OverflowMenu
            label={t('builder.list.more', { name: entry.name })}
            items={[
              { label: t('builder.list.edit'), icon: 'pencil', onSelect: () => onEditRule(entry.patternId) },
              { label: t('builder.list.duplicate'), icon: 'cards', onSelect: () => onDuplicateRule(entry.patternId) },
              { label: t('builder.list.delete'), icon: 'trash', tone: 'danger', onSelect: () => onDeleteRule(entry.patternId) },
            ]}
          />
        }
      />
    )

  return (
    <LabSection
      title={t('lab.rules.title')}
      icon="list"
      summary={[
        t('builder.list.summaryOpenings', { count: openings, n: formatInteger(openings) }),
        t('builder.list.summaryProblems', { count: problems, n: formatInteger(problems) }),
        liveCustom.length > 0 ? t('builder.list.summaryOwn', { count: liveCustom.length, n: formatInteger(liveCustom.length) }) : t('builder.list.summaryNoOwn'),
      ].join(' · ')}
      className={className}
      actions={
        <Button variant="secondary" size="sm" icon="plus" className="max-[1101px]:hidden" onClick={() => onCreate(null)}>
          {t('builder.list.create')}
        </Button>
      }
    >
      <div className="grid gap-4">
        <p className="-mt-3.5 pl-8 text-body text-muted">{t('builder.list.description')}</p>
        <p className="m-0 flex items-start gap-2 text-body text-muted">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-foreground" />
          {t('builder.list.lockNote')}
        </p>

        <div className="grid gap-6 md:grid-cols-2 md:gap-8">
          {(['opening', 'problem'] as const).map((kind) => {
            const entries = ofKind(kind)

            return (
              <section key={kind} aria-label={t(COLUMN[kind].title)} className="grid min-w-0 content-start gap-1">
                <h3 className="m-0 flex min-h-8 flex-wrap items-center gap-2 text-body font-semibold text-foreground">
                  {t(COLUMN[kind].title)}
                  <Badge tone="neutral" size="sm">
                    {formatInteger(entries.length)}
                  </Badge>
                  <span className="font-normal text-muted">{t(COLUMN[kind].hint)}</span>
                </h3>
                <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
                  {entries.map((entry) => (
                    <li key={entry.patternId}>{renderRow(entry)}</li>
                  ))}
                  <li>
                    <button
                      type="button"
                      data-create-kind={kind}
                      className="group grid min-h-15 w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-control py-1 text-left text-body font-semibold text-muted transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => onCreate(kind)}
                    >
                      <span className="grid size-11 place-items-center rounded-full border border-dashed border-border text-muted transition-colors duration-150 group-hover:border-info group-hover:text-info">
                        <Icon name="plus" size={18} />
                      </span>
                      {t(COLUMN[kind].create)}
                    </button>
                  </li>
                </ul>
              </section>
            )
          })}
        </div>

        <Button variant="secondary" icon="plus" className="justify-self-start min-[1101px]:hidden" onClick={() => onCreate(null)}>
          {t('builder.list.create')}
        </Button>

        {orphans.length > 0 ? (
          <details className="group grid gap-1" aria-label={t('lab.rules.orphans.title')}>
            <summary className="m-0 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-control text-body font-semibold text-foreground focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                {t('lab.rules.orphans.title')}
                <Badge tone="warning" size="sm">
                  {formatInteger(orphans.length)}
                </Badge>
              </span>
              <Icon name="chevron-down" size={16} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="m-0 text-body text-muted">{t('lab.rules.orphans.description')}</p>
            <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
              {orphans.map((entry) => (
                <li key={entry.patternId}>
                  <RuleRow entry={entry} own onOpen={() => onEditRule(entry.patternId)} control={null} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      <Presence>
        {renaming?.presetId ? (
          <RuleRenameDialog
            key={renaming.patternId}
            entry={renaming}
            onSave={(name) => onRenameSystemRule(renaming.presetId!, name)}
            onClose={() => setRenamingId(null)}
          />
        ) : null}
      </Presence>
    </LabSection>
  )
}

function LockMark() {
  return (
    <span className="grid size-11 place-items-center text-soft" title={t('builder.list.locked')}>
      <Icon name="lock" size={18} />
      <span className="sr-only">{t('builder.list.locked')}</span>
    </span>
  )
}

/**
 * Una regla en una fila de 60 px: el anillo (cuántas de cada 100 manos), el nombre con sus etiquetas (turno, «Tuya») y el control a la derecha. El cuerpo es el botón
 * que la abre; el control va al lado (un interruptor o un menú no pueden ir dentro de un botón).
 */
function RuleRow({ entry, control, own = false, action = 'edit', onOpen }: { entry: RuleEntry; control: ReactNode; own?: boolean; action?: 'edit' | 'rename'; onOpen: () => void }) {
  const isActive = entry.enabled && entry.appliesToView && !entry.missingCards
  const value = formatRuleValue(entry)
  const label = entry.turnLean
    ? t(ROW_LABEL_KEY[action].lean, { name: entry.name, value, turn: turnWord(entry.turnLean.favored) })
    : t(ROW_LABEL_KEY[action].plain, { name: entry.name, value })

  return (
    <div className="grid min-h-15 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
      <button
        type="button"
        aria-label={label}
        className={cx(
          'grid min-h-15 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-control py-1 text-left transition-[opacity,background-color] duration-150 hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus',
          !isActive && 'opacity-55',
        )}
        onClick={onOpen}
      >
        {entry.probability !== null && isActive ? (
          <ProgressRing value={entry.probability} size={44} tone={judgeTone(entry.kind === 'opening')} label={`${entry.name}: ${formatShortPercent(entry.probability)}`} />
        ) : (
          <ProgressRing unmeasured value={0} size={44} label={`${entry.name}: ${value}`}>
            —
          </ProgressRing>
        )}
        <span className="grid min-w-0 gap-1">
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-body font-semibold text-foreground">
            <span className="min-w-0 [overflow-wrap:anywhere]">{entry.name}</span>
            {entry.turnContext !== 'either' ? <Tag>{t(entry.turnContext === 'first' ? 'builder.list.onlyFirst' : 'builder.list.onlySecond')}</Tag> : null}
            {entry.ignoresDraw && entry.turnContext !== 'first' ? <Tag title={t('lab.rules.badge.ignoresDraw')}>{formatCardCount(5)}</Tag> : null}
            {entry.turnLean ? <Tag title={leanTitle(entry.kind, entry.turnLean)}>{t('lab.rules.lean.badge', { turn: turnWord(entry.turnLean.favored) })}</Tag> : null}
            {own ? <Tag>{t('builder.list.own')}</Tag> : null}
          </span>
          {entry.description && entry.tier === 'custom' ? <span className="text-micro text-muted">{entry.description}</span> : null}
        </span>
      </button>
      {control ? <span className="flex min-w-11 justify-center">{control}</span> : null}
    </div>
  )
}

/** El detalle de «Más yendo 1º» (en el título: va a la ficha, no a la fila). */
function leanTitle(kind: PatternKind, lean: TurnLean): string {
  return t(kind === 'opening' ? 'lab.rules.lean.opening' : 'lab.rules.lean.problem', {
    turn: turnWord(lean.favored),
    first: formatShortPercent(lean.first),
    second: formatShortPercent(lean.second),
  })
}

function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Badge tone="neutral" size="sm" shape="tag" title={title}>
      {children}
    </Badge>
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
