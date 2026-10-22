import { useCallback, useMemo } from 'react'

import { getCardRoleDefinition } from '../../app/deck-groups'
import { getCardCopyLimit } from '../../app/deck-format'
import type { Culprit, Outcome, PerTurnResults } from '../../app/lab-suggestion'
import type { LabViewResult } from '../../app/probability-lab'
import type { RoleDistribution, RoleDistributionKey } from '../../app/role-distribution'
import { formatShortPercent } from '../../app/utils'
import { t, type MessageKey } from '../../i18n'
import type { CardEntry, DeckFormat, HandPattern, TurnView } from '../../types'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { ProgressRing } from '../ui/ProgressRing'
import { judgeTone, progressTone } from '../ui/tone'
import { overline, supportText } from '../ui/typography'
import { useLabSuggestion } from './use-lab-suggestion'

interface LabSuggestionProps {
  deckFormat: DeckFormat
  cards: CardEntry[]
  checks: HandPattern[]
  handSize: number
  view: TurnView
  result: LabViewResult
  /** Resultados de 1º y 2º: el Promedio los usa para ponderar el culpable y mostrar el efecto por turno. */
  first: LabViewResult
  second: LabViewResult
  /** Lo que robás de cada rol en esta vista: sin «Probar el cambio», el botón abre las cartas del rol que gana la copia («Ver starters»). */
  roles?: RoleDistribution[]
  onOpenRole?: (distribution: RoleDistribution) => void
  /** Pone el cambio en borrador en todo el Lab (lo conecta otro lote): con esto aparece «Probar el cambio», la principal. */
  onTry?: (outcome: Outcome) => void
  /** Abre Comparar con A = tu deck y B = con el cambio (lo conecta otro lote). */
  onCompare?: (outcome: Outcome) => void
  className?: string
}

/** El rol de la carta que entra, con el que se ven sus cartas (un relleno no tiene). */
const ROLE_OF_GROUP: Partial<Record<NonNullable<Outcome['swap']['to']>, RoleDistributionKey>> = { starter: 'starter', interaction: 'interaction', brick: 'brick' }

const TURN_LABEL = { average: 'lab.turnView.average', first: 'lab.turnView.first', second: 'lab.turnView.second' } as const satisfies Record<TurnView, MessageKey>

/** «Lo que más te frena»: el problema, el cambio de una carta que más suma (las dos cartas, con su imagen) y lo que mejora cada turno; abajo, el número y la acción. */
export function LabSuggestion({ cards, checks, deckFormat, handSize, view, result, first, second, roles, onOpenRole, onTry, onCompare, className }: LabSuggestionProps) {
  const perTurn = useMemo<PerTurnResults>(() => ({ first, second }), [first, second])
  // Un cambio que suma copias tiene que ser legal en el formato (banlist): la sugerencia no puede pedir lo imposible.
  const maxCopiesOf = useCallback((card: CardEntry) => (card.apiCard ? getCardCopyLimit(card.apiCard, deckFormat) : 3), [deckFormat])
  const { culprit, state, hint } = useLabSuggestion(cards, checks, handSize, view, result, maxCopiesOf, perTurn)
  const card = cx('flex flex-col gap-3', className)

  if (!culprit) {
    // Sin nada que frene, la tarjeta lo dice (la grilla no queda con un hueco).
    return (
      <Card padding="lg" className={cx(card, 'justify-center')} aria-label={t('lab.suggestion.label')}>
        <EmptyState icon="check" title={t('lab.suggestion.none.title')}>
          {t('lab.suggestion.none.body')}
        </EmptyState>
      </Card>
    )
  }

  const best = state.analysis.best
  // Sin ningún Starter ninguna mano abre: el número sale en cero y hay que decir por qué (si no, parece un error de la cuenta).
  const noStarter = culprit.kind === 'no-opening' && !cards.some((entry) => entry.roles.includes('starter'))

  return (
    <Card padding="lg" className={card} aria-label={t('lab.suggestion.label')}>
      <header className="grid min-w-0 gap-0.5">
        <p className={cx('m-0', overline)}>{t('lab.suggestion.overline')}</p>
        <Heading level="section" className="leading-tight">
          {culprit.name}
        </Heading>
        {/* Sin un cambio que sume, el porqué lo dice el aviso de abajo (en todos los anchos): no se repite. */}
        {best || state.status === 'loading' ? (
          <p className={cx(supportText, 'max-md:hidden')}>
            {describeCulprit(culprit)}
            {best ? ` ${t('lab.suggestion.bestChange')}` : null}
          </p>
        ) : null}
        {noStarter ? <p className={supportText}>{t('lab.suggestion.noStarter')}</p> : null}
      </header>

      {best ? (
        <BestChange best={best} view={view} result={result} first={first} second={second} roles={roles} onOpenRole={onOpenRole} onTry={onTry} onCompare={onCompare} />
      ) : state.status === 'loading' ? (
        <div className="flex items-center gap-3 border-t border-border-subtle pt-4" role="status" aria-busy="true">
          <ProgressRing value={state.progress.total > 0 ? state.progress.done / state.progress.total : 0} tone={progressTone(state.progress.done, state.progress.total)} size={44} label={t('lab.suggestion.progressLabel')}>
            {`${state.progress.done}/${state.progress.total}`}
          </ProgressRing>
          <p className="m-0 text-body text-muted motion-safe:animate-pulse">{t('lab.suggestion.testing', { done: state.progress.done, total: state.progress.total })}</p>
        </div>
      ) : (
        <>
          {/* Ningún cambio de una carta suma (o ninguno es legal): se dice por qué, en todos los anchos, y se puede ir a ver las cartas que faltan. */}
          <p className={cx(supportText, 'border-t border-border-subtle pt-4')}>
            {hint ?? t(culprit.kind === 'no-opening' ? 'lab.suggestion.noChange.noOpening' : 'lab.suggestion.noChange.problem')}
          </p>
          {culprit.kind === 'no-opening' ? (
            <div className="mt-auto flex justify-end">
              <SeeRoleButton roleKey="starter" roles={roles} onOpenRole={onOpenRole} />
            </div>
          ) : null}
        </>
      )}
    </Card>
  )
}

interface BestChangeProps extends Pick<LabSuggestionProps, 'view' | 'result' | 'first' | 'second' | 'roles' | 'onOpenRole' | 'onTry' | 'onCompare'> {
  best: Outcome
}

/** El cambio: las dos cartas, lo que mejora cada turno (en escritorio) y, abajo, cuántas manos buenas suma con la acción al lado. */
function BestChange({ best, view, result, first, second, roles, onOpenRole, onTry, onCompare }: BestChangeProps) {
  // En el Promedio el cambio se probó en los dos turnos; en 1º o 2º, sólo en ese (no se inventa el otro).
  const effects: Array<{ key: TurnView; before: number; after: number }> =
    view === 'average' && best.cleanBySide
      ? [
          { key: 'average', before: result.cleanProbability, after: best.cleanProbability },
          { key: 'first', before: first.cleanProbability, after: best.cleanBySide.first },
          { key: 'second', before: second.cleanProbability, after: best.cleanBySide.second },
        ]
      : [{ key: view, before: result.cleanProbability, after: best.cleanProbability }]
  const gain = per100Diff(effects[0]!.before, effects[0]!.after)

  return (
    <>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 border-y border-border-subtle px-0 py-2 md:grid-cols-1 md:gap-0 md:divide-y md:divide-border-subtle md:border-y-0 md:py-0">
        {best.changes.map((change) => (
          <SwapRow key={`${change.action}-${change.card.id}`} action={change.action} card={change.card} />
        ))}
      </ul>

      <div className="grid gap-2 max-md:hidden">
        <p className={cx('m-0', overline)}>{t('lab.suggestion.effect')}</p>
        <ul className="m-0 grid list-none auto-cols-fr grid-flow-col gap-2 p-0">
          {effects.map((effect, index) => {
            const label = t(TURN_LABEL[effect.key])

            return (
              <li key={effect.key} className="grid justify-items-center gap-1 text-body text-foreground">
                <ProgressRing value={effect.after} tone={judgeTone(true)} size={56} strokeWidth={5} delay={index * 100} label={t('lab.suggestion.effectRing', { label, value: formatShortPercent(effect.after) })} />
                <span className="flex flex-wrap items-center justify-center gap-x-1.5">
                  {label}
                  <Delta diff={per100Diff(effect.before, effect.after)} />
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Número + acción, en la misma fila y abajo (al alcance del pulgar). */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 md:justify-end">
        <p className="m-0 flex items-center gap-2 md:hidden">
          <span className="whitespace-nowrap text-stat font-bold tabular-nums text-success-soft">
            <span aria-hidden="true">▲ </span>
            {gain > 0 ? gain : '<1'}
          </span>
          <span className="max-w-30 text-body leading-tight text-muted">{t('lab.suggestion.gain')}</span>
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {onCompare ? (
            <Button variant="secondary" onClick={() => onCompare(best)}>
              {t('lab.suggestion.compare')}
            </Button>
          ) : null}
          {onTry ? (
            <Button variant="primary" onClick={() => onTry(best)}>
              {t('lab.suggestion.try')}
            </Button>
          ) : null}
          {!onTry && !onCompare ? <SeeRoleButton roleKey={best.swap.to ? ROLE_OF_GROUP[best.swap.to] : undefined} roles={roles} onOpenRole={onOpenRole} /> : null}
        </div>
      </div>
    </>
  )
}

/** «Ver starters»: abre las cartas del rol (el detalle de «Qué robás de cada rol»). Sin ese rol en el deck, o sin quién lo abra, no se muestra. */
function SeeRoleButton({ roleKey, roles, onOpenRole }: { roleKey: RoleDistributionKey | undefined; roles?: RoleDistribution[]; onOpenRole?: (distribution: RoleDistribution) => void }) {
  const role = roleKey ? roles?.find((distribution) => distribution.key === roleKey && distribution.copies > 0) : undefined

  return role && onOpenRole ? (
    <Button variant="secondary" onClick={() => onOpenRole(role)}>
      {t('lab.suggestion.seeRole', { role: role.label.toLowerCase() })}
    </Button>
  ) : null
}

/**
 * Una carta del cambio. En el celular, dos columnas («Sacar 1» chico y del color de la acción, el nombre debajo); en escritorio, una fila por carta con su rol y
 * cuántas copias quedan, y el −1 / +1 a la derecha. Es el mismo marcado: cambia el acomodo.
 */
function SwapRow({ action, card }: { action: 'remove' | 'add'; card: CardEntry }) {
  const remove = action === 'remove'
  const role = card.roles[0] ? getCardRoleDefinition(card.roles[0]).label : t('rules.suggestion.fillerCard')

  return (
    <li className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-2 md:min-h-14 md:grid-cols-[auto_minmax(0,1fr)_auto] md:gap-3 md:py-1">
      <span className="block w-7 md:w-8">
        <CardArt remoteUrl={card.apiCard?.imageUrlSmall ?? null} name={card.name} className="block aspect-[421/614] w-full object-cover" />
      </span>
      <span className="grid min-w-0">
        <strong className="min-w-0 truncate text-body font-semibold text-foreground">
          <span className={cx('block text-micro md:inline md:text-body md:text-foreground', remove ? 'text-danger-soft' : 'text-success-soft')}>
            {t(remove ? 'lab.suggestion.removeVerb' : 'lab.suggestion.addVerb')}
          </span>{' '}
          {card.name}
        </strong>
        <span className="text-body text-muted max-md:hidden">{t('lab.suggestion.fromTo', { role, from: card.copies, to: card.copies + (remove ? -1 : 1) })}</span>
      </span>
      <Badge tone={remove ? 'danger' : 'success'} shape="tag" size="sm" className="max-md:hidden">
        {remove ? '−1' : '+1'}
      </Badge>
    </li>
  )
}

/** ▲ / ▼ y cuántas manos buenas de cada 100: verde si suben (le conviene a quien lee), rojo si bajan. Sin cambio, nada. */
function Delta({ diff }: { diff: number }) {
  if (diff === 0) {
    return null
  }

  const up = diff > 0

  return (
    <span className={cx('whitespace-nowrap font-semibold tabular-nums', up ? 'text-success-soft' : 'text-danger-soft')}>
      <span aria-hidden="true">{`${up ? '▲' : '▼'} ${Math.abs(diff)}`}</span>
      <span className="sr-only">{t(up ? 'lab.suggestion.more' : 'lab.suggestion.fewer', { n: Math.abs(diff) })}</span>
    </span>
  )
}

/** La diferencia que se ve: la de los enteros «de cada 100» que se muestran (81 → 84 = ▲ 3). */
function per100Diff(before: number, after: number): number {
  return Math.round(after * 100) - Math.round(before * 100)
}

/** Por qué frena: sin salida, falta con qué arrancar; un problema, es la traba que más manos saca (el número ya está en el veredicto y en las reglas: no se repite). */
function describeCulprit(culprit: Culprit): string {
  return t(culprit.kind === 'no-opening' ? 'lab.suggestion.why.noOpening' : 'lab.suggestion.why.problem')
}
