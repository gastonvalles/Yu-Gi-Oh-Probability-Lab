import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  buildDerivedDeckGroupMap,
} from '../../app/deck-groups'
import { useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import {
  buildPracticeDeck,
  drawNextCard,
  drawRandomPracticeHand,
  evaluatePracticeHand,
  type PracticeHandMatch,
  type PracticeHandState,
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
  onRedraw?: () => void
}

type PracticeTurn = 'first' | 'second'

const PRACTICE_TURNS: ReadonlyArray<{ value: PracticeTurn; label: string }> = [
  { value: 'first', label: 'Primero' },
  { value: 'second', label: 'Segundo' },
]

function getPracticeStageCardStyle(index: number, total: number): CSSProperties {
  const midpoint = (total - 1) / 2
  const offset = index - midpoint
  const distance = Math.abs(offset)

  return {
    transform: `translateY(${distance * 12}px) rotate(${offset * 4.5}deg)`,
    zIndex: Math.round(100 - distance * 10),
  }
}

function getPracticeMatchStateLabel(kind: HandPattern['kind']): string {
  return kind === 'opening' ? 'Cumplida' : 'Detectado'
}

function getPracticeMatchStateBadgeClass(kind: HandPattern['kind']): string {
  return kind === 'opening'
    ? 'surface-card-success text-accent'
    : 'surface-card-danger text-destructive'
}



export function PracticeSection({
  handSize,
  derivedMainCards,
  patterns,
  hasCompletedClassification,
  missingOriginCount,
  missingRoleCount,
  pendingReviewCount,
  reviewPendingPatternCount,
}: PracticeSectionProps) {
  const practiceDeck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const [practiceHand, setPracticeHand] = useState<PracticeHandState | null>(null)
  const [turn, setTurn] = useState<PracticeTurn>('first')
  // Ir segundo roba una carta más en el primer turno.
  const openingHandSize = turn === 'second' ? handSize + 1 : handSize
  const practiceDeckCount = practiceDeck.length
  const canDrawOpeningHand = practiceDeck.length >= openingHandSize
  const canDrawNextCard = practiceHand !== null && practiceHand.remainingDeck.length > 0
  const missingPracticeCards = Math.max(0, openingHandSize - practiceDeckCount)
  const isEmptyPracticeDeck = practiceDeckCount === 0
  // Robar manos no depende de la clasificación: sólo la evaluación de reglas la necesita.
  const evaluationBlockedMessage =
    !hasCompletedClassification
      ? missingOriginCount > 0
        ? 'Hay cartas sin origen: clasificalas en el Paso 2 para ver qué reglas cumple la mano.'
        : missingRoleCount > 0
          ? 'Hay cartas sin roles: clasificalas en el Paso 2 para ver qué reglas cumple la mano.'
          : pendingReviewCount > 0
            ? 'Hay cartas pendientes de revisión: cerrá el Paso 2 para ver qué reglas cumple la mano.'
            : 'Terminá el Paso 2 para ver qué reglas cumple la mano.'
      : reviewPendingPatternCount > 0
        ? `Tenés ${formatInteger(reviewPendingPatternCount)} patrón${reviewPendingPatternCount === 1 ? '' : 'es'} heredado${reviewPendingPatternCount === 1 ? '' : 's'} pendiente${reviewPendingPatternCount === 1 ? '' : 's'} de revisión.`
        : null
  const practiceResult = useMemo(
    () =>
      evaluationBlockedMessage
        ? {
            matches: [],
            openingMatches: [],
            problemMatches: [],
            openingNearMisses: [],
          }
        : evaluatePracticeHand(practiceHand?.hand ?? [], patterns, derivedMainCards, groupsByKey, turn),
    [evaluationBlockedMessage, practiceHand, patterns, derivedMainCards, groupsByKey, turn],
  )
  const openingMatches = practiceResult.openingMatches
  const problemMatches = practiceResult.problemMatches

  const isWide = useMediaQuery('(min-width: 820px)')

  useEffect(() => {
    setPracticeHand(null)
  }, [derivedMainCards, openingHandSize])

  return (
    <section className="grid min-w-0 min-h-0 h-full grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden wrap-anywhere [word-break:break-word]">
      <div className="flex items-center justify-between gap-3 px-1">
        <h3 className="m-0 text-[0.98rem] leading-none">Probar mano</h3>
        <span className="app-muted text-[0.68rem]">Validá tu modelo con manos reales</span>
      </div>

      {isEmptyPracticeDeck ? (
        <p className="surface-card m-0 p-2.5 text-[0.8rem] text-(--text-muted)">
          Cargá cartas en el Main Deck para habilitar la práctica.
        </p>
      ) : !canDrawOpeningHand ? (
        <p className="surface-card-warning m-0 p-2.5 text-[0.8rem] text-(--warning)">
          Sumá {formatInteger(missingPracticeCards)} carta{missingPracticeCards === 1 ? '' : 's'} más al Main Deck.
        </p>
      ) : (
        <>
          {/* Card stage with header — fixed, no scroll */}
          <article className="surface-panel-strong grid min-w-0 gap-3 overflow-x-hidden p-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="m-0 text-[0.92rem] leading-none text-(--text-main)">
                {practiceHand ? `Mano de ${formatInteger(practiceHand.hand.length)}` : 'Mano de ' + formatInteger(openingHandSize)}
              </h4>
              <div className="flex flex-wrap justify-end gap-2">
                <div className="lab-turn-toggle w-auto grid-cols-2 p-0.5" role="radiogroup" aria-label="Turno de la mano">
                  {PRACTICE_TURNS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={turn === option.value}
                      data-active={turn === option.value ? 'true' : 'false'}
                      className="lab-turn-toggle-option min-h-0 px-2.5 py-1"
                      onClick={() => setTurn(option.value)}
                    >
                      <span className="lab-turn-toggle-label text-[0.76rem]">{option.label}</span>
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!canDrawOpeningHand}
                  onClick={() => setPracticeHand(drawRandomPracticeHand(practiceDeck, openingHandSize))}
                >
                  Robar {formatInteger(openingHandSize)}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canDrawNextCard}
                  onClick={() => setPracticeHand((current) => (current ? drawNextCard(current) : current))}
                >
                  Robar 1 más
                </Button>
              </div>
            </div>

            <div
              className={isWide
                ? 'flex min-h-[260px] min-w-0 items-start justify-center overflow-hidden px-4 pt-2 pb-4'
                : 'grid min-w-0 grid-cols-5 gap-0.5 overflow-hidden py-3'
              }
            >
              {(practiceHand?.hand ?? Array.from({ length: openingHandSize })).map((card, index, hand) => {
                const cardCount = hand.length
                const cardStyle = isWide ? getPracticeStageCardStyle(index, cardCount) : undefined

                if (!practiceHand) {
                  return (
                    <div
                      key={`placeholder-${index}`}
                      className={[
                        'practice-placeholder-card aspect-[0.72] shrink-0',
                        isWide ? 'w-[clamp(96px,16vw,132px)]' : 'w-full',
                        isWide && index !== 0 ? '-ml-5 min-[820px]:-ml-7' : '',
                      ].join(' ')}
                      style={cardStyle}
                      aria-hidden="true"
                    />
                  )
                }

                return (
                  <article
                    key={card.drawId}
                    className={[
                      'shrink-0 p-0 shadow-[0_18px_36px_rgba(0,0,0,0.35)]',
                      isWide ? 'w-[clamp(96px,16vw,132px)]' : 'w-full',
                      isWide && index !== 0 ? '-ml-5 min-[820px]:-ml-7' : '',
                    ].join(' ')}
                    style={cardStyle}
                  >
                    <CardArt
                      remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                      name={card.name}
                      className="block h-auto w-full bg-input"
                      limitCard={card.apiCard}
                      limitBadgeSize="lg"
                    />
                  </article>
                )
              })}
            </div>
          </article>

          {/* Results — scrollable area */}
          {practiceHand && evaluationBlockedMessage ? (
            <p className="surface-card-warning m-0 self-start p-2.5 text-[0.8rem] text-(--warning)">{evaluationBlockedMessage}</p>
          ) : practiceHand ? (
            <div className="min-h-0 overflow-y-auto overflow-x-hidden pt-3 px-1">
              <div className="grid gap-3 min-[640px]:grid-cols-2">
                {/* Salidas cumplidas */}
                <div className="grid content-start gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">Salidas cumplidas</small>
                    <span className="app-chip px-2 py-0.5 text-[0.7rem]">{formatInteger(openingMatches.length)}</span>
                  </div>
                  {openingMatches.length > 0 ? (
                    <div className="grid gap-2">
                      {openingMatches.map((match) => (
                        <PracticeMatchCard key={match.patternId} match={match} />
                      ))}
                    </div>
                  ) : (
                    <p className="surface-card m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">Ninguna salida cumplida.</p>
                  )}
                </div>

                {/* Problemas detectados */}
                <div className="grid content-start gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">Problemas detectados</small>
                    <span className="app-chip px-2 py-0.5 text-[0.7rem]">{formatInteger(problemMatches.length)}</span>
                  </div>
                  {problemMatches.length > 0 ? (
                    <div className="grid gap-2">
                      {problemMatches.map((match) => (
                        <PracticeMatchCard key={match.patternId} match={match} />
                      ))}
                    </div>
                  ) : (
                    <p className="surface-card m-0 px-2.5 py-2 text-[0.76rem] text-(--text-muted)">Sin problemas detectados.</p>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function PracticeMatchCard({ match }: { match: PracticeHandMatch }) {
  return (
    <article
      className="probability-check-card grid gap-1.5 outline-none"
      data-active="true"
      data-kind={match.kind}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <strong className="text-[0.9rem] leading-[1.2] text-(--text-main)">{match.name}</strong>
          <p className="m-0 truncate text-[0.74rem] leading-[1.2] text-(--text-muted)">
            {match.requirementLabel}
          </p>
        </div>
        <span
          className={[
            getPracticeMatchStateBadgeClass(match.kind),
            'shrink-0 px-1.5 py-0.5 text-[0.65rem]',
          ].join(' ')}
        >
          {getPracticeMatchStateLabel(match.kind)}
        </span>
      </div>
    </article>
  )
}
