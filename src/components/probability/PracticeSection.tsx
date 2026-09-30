import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { buildPatternCompactSummary } from './pattern-helpers'
import {
  buildPracticeDeck,
  drawNextCard,
  drawRandomPracticeHand,
  evaluatePracticeHand,
  getPracticeTurn,
  getPracticeVerdict,
  type PracticeHandMatch,
  type PracticeHandNearMiss,
  type PracticeHandState,
  type PracticeVerdict,
} from './practice'

interface PracticeSectionProps {
  handSize: number
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
  hasCompletedClassification: boolean
  missingOriginCount: number
  missingRoleCount: number
  pendingReviewCount: number
  reviewPendingPatternCount: number
}

const VERDICT_COPY: Record<PracticeVerdict, { title: string; detail: string }> = {
  clean: { title: 'Mano limpia', detail: 'Tiene salida y ningún problema activo.' },
  'with-problem': { title: 'Salida con problema', detail: 'Arranca, pero algún problema la complica.' },
  'no-opening': { title: 'Sin salida', detail: 'No cumple ninguna salida.' },
}

const EMPTY_RESULT = { matches: [], openingMatches: [], problemMatches: [], openingNearMisses: [] }

function getFanCardStyle(index: number, total: number): CSSProperties {
  const offset = index - (total - 1) / 2
  const distance = Math.abs(offset)

  return {
    transform: `translateY(${distance * 12}px) rotate(${offset * 4.5}deg)`,
    zIndex: Math.round(100 - distance * 10),
  }
}

function buildEvaluationBlockedMessage(props: PracticeSectionProps): string | null {
  if (!props.hasCompletedClassification) {
    if (props.missingOriginCount > 0) {
      return 'Hay cartas sin origen: clasificalas en Categorización para ver qué reglas cumple la mano.'
    }
    if (props.missingRoleCount > 0) {
      return 'Hay cartas sin roles: clasificalas en Categorización para ver qué reglas cumple la mano.'
    }
    if (props.pendingReviewCount > 0) {
      return 'Hay cartas pendientes de revisión: revisalas en Categorización para ver qué reglas cumple la mano.'
    }
    return 'Terminá la Categorización para ver qué reglas cumple la mano.'
  }

  const pending = props.reviewPendingPatternCount
  return pending > 0
    ? `Tenés ${formatInteger(pending)} regla${pending === 1 ? '' : 's'} heredada${pending === 1 ? '' : 's'} pendiente${pending === 1 ? '' : 's'} de revisión.`
    : null
}

export function PracticeSection(props: PracticeSectionProps) {
  const { handSize, derivedMainCards, patterns } = props
  const practiceDeck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const canDraw = practiceDeck.length >= handSize
  // Al abrir ya hay una mano en la mesa: probar es un toque, no dos.
  const [practiceHand, setPracticeHand] = useState<PracticeHandState | null>(() =>
    canDraw ? drawRandomPracticeHand(practiceDeck, handSize) : null,
  )
  const isWide = useMediaQuery('(min-width: 820px)')
  const summaryById = useMemo(() => {
    const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
    return new Map(patterns.map((pattern) => [pattern.id, buildPatternCompactSummary(pattern, cardById)]))
  }, [derivedMainCards, patterns])

  useEffect(() => {
    setPracticeHand(practiceDeck.length >= handSize ? drawRandomPracticeHand(practiceDeck, handSize) : null)
  }, [practiceDeck, handSize])

  const hand = practiceHand?.hand ?? []
  const turn = getPracticeTurn(hand.length, handSize)
  const blockedMessage = buildEvaluationBlockedMessage(props)
  const result = useMemo(
    () =>
      blockedMessage || hand.length === 0
        ? EMPTY_RESULT
        : evaluatePracticeHand(hand, patterns, derivedMainCards, groupsByKey, turn),
    [blockedMessage, hand, patterns, derivedMainCards, groupsByKey, turn],
  )
  const canDrawNext = practiceHand !== null && practiceHand.remainingDeck.length > 0
  const isOpeningHand = hand.length === handSize

  if (practiceDeck.length === 0) {
    return <p className="practice-notice">Cargá cartas en el Main Deck para habilitar la práctica.</p>
  }

  if (!canDraw) {
    const missing = handSize - practiceDeck.length
    return (
      <p className="practice-notice" data-tone="warning">
        Sumá {formatInteger(missing)} carta{missing === 1 ? '' : 's'} más al Main Deck.
      </p>
    )
  }

  return (
    <section className="practice" aria-label="Probar mano">
      <div className="practice-toolbar">
        <span className="practice-turn" data-turn={turn}>
          <strong>{turn === 'first' ? 'Yendo 1º' : 'Yendo 2º'}</strong>
          <span>{formatInteger(hand.length)} cartas</span>
        </span>
        <div className="practice-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canDrawNext}
            onClick={() => setPracticeHand((current) => (current ? drawNextCard(current) : current))}
          >
            {isOpeningHand ? `Robar la ${formatInteger(handSize + 1)}ª (ir 2º)` : 'Robar 1 más'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setPracticeHand(drawRandomPracticeHand(practiceDeck, handSize))}>
            Nueva mano
          </Button>
        </div>
      </div>

      <div
        className="practice-hand"
        data-layout={isWide ? 'fan' : 'grid'}
        style={isWide ? undefined : { gridTemplateColumns: `repeat(${Math.min(hand.length, 6)}, minmax(0, 1fr))` }}
      >
        {hand.map((card, index) => (
          <div
            key={card.drawId}
            className="practice-card"
            data-new={index >= handSize ? 'true' : 'false'}
            style={isWide ? getFanCardStyle(index, hand.length) : undefined}
          >
            <CardArt
              remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
              name={card.name}
              className="block h-auto w-full bg-input"
              limitCard={card.apiCard}
              limitBadgeSize={isWide ? 'lg' : 'sm'}
            />
          </div>
        ))}
      </div>

      {blockedMessage ? (
        <p className="practice-notice" data-tone="warning">
          {blockedMessage}
        </p>
      ) : (
        <PracticeReport
          verdict={getPracticeVerdict(result.openingMatches.length, result.problemMatches.length)}
          openingMatches={result.openingMatches}
          problemMatches={result.problemMatches}
          nearMisses={result.openingNearMisses}
          summaryById={summaryById}
        />
      )}
    </section>
  )
}

function PracticeReport({
  verdict,
  openingMatches,
  problemMatches,
  nearMisses,
  summaryById,
}: {
  summaryById: ReadonlyMap<string, string>
  verdict: PracticeVerdict
  openingMatches: PracticeHandMatch[]
  problemMatches: PracticeHandMatch[]
  nearMisses: PracticeHandNearMiss[]
}) {
  const copy = VERDICT_COPY[verdict]

  return (
    <div className="practice-report" aria-live="polite">
      <div className="practice-verdict" data-verdict={verdict}>
        <strong>{copy.title}</strong>
        <span>{copy.detail}</span>
        <span className="practice-verdict-counts">
          {formatInteger(openingMatches.length)} salida{openingMatches.length === 1 ? '' : 's'} ·{' '}
          {formatInteger(problemMatches.length)} problema{problemMatches.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="practice-columns">
        <MatchList title="Salidas" kind="opening" matches={openingMatches} summaryById={summaryById} emptyText="Ninguna salida cumplida.">
          {openingMatches.length === 0 && nearMisses.length > 0 ? (
            <li className="practice-near-miss">
              Casi: <strong>{nearMisses[0]!.name}</strong>
              {nearMisses[0]!.missingConditions > 0
                ? ` (falta ${formatInteger(nearMisses[0]!.missingConditions)} condición${nearMisses[0]!.missingConditions === 1 ? '' : 'es'})`
                : ''}
            </li>
          ) : null}
        </MatchList>
        <MatchList title="Problemas" kind="problem" matches={problemMatches} summaryById={summaryById} emptyText="Sin problemas." />
      </div>
    </div>
  )
}

function MatchList({
  title,
  kind,
  matches,
  emptyText,
  summaryById,
  children,
}: {
  summaryById: ReadonlyMap<string, string>
  title: string
  kind: 'opening' | 'problem'
  matches: PracticeHandMatch[]
  emptyText: string
  children?: React.ReactNode
}) {
  return (
    <section className="practice-list" data-kind={kind} aria-label={title}>
      <h4>
        {title} <span>{formatInteger(matches.length)}</span>
      </h4>
      <ul>
        {matches.length === 0 ? <li className="practice-empty">{emptyText}</li> : null}
        {matches.map((match) => (
          <li key={match.patternId} className="practice-match">
            <strong>{match.name}</strong>
            <span>{formatMatchCards(match, summaryById.get(match.patternId))}</span>
          </li>
        ))}
        {children}
      </ul>
    </section>
  )
}

/** Qué cartas de la mano la cumplen (o el resumen de la regla, si es por ausencia de cartas). */
function formatMatchCards(match: PracticeHandMatch, summary: string | undefined): string {
  const names = match.assignments
    .filter((assignment) => assignment.kind === 'include')
    .flatMap((assignment) => assignment.cards.map((card) => (card.copies > 1 ? `${card.name} ×${card.copies}` : card.name)))

  return names.length > 0 ? [...new Set(names)].join(' · ') : (summary ?? match.requirementLabel)
}
