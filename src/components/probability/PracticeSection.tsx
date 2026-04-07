import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  buildDerivedDeckGroupMap,
  CARD_ROLE_DEFINITIONS,
  createRoleGroupKey,
  getDeckGroupTheme,
} from '../../app/deck-groups'
import { formatInteger } from '../../app/utils'
import type { CardEntry, CardRole, HandPattern } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import {
  buildPracticeDeck,
  drawNextCard,
  drawRandomPracticeHand,
  evaluatePracticeHand,
  type PracticeHandMatch,
  type PracticeHandNearMiss,
  type PracticeHandRequirementAssignment,
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
}

type PracticeVerdict = 'clean' | 'bad' | 'mixed' | 'neutral'

function getRoleStyle(role: CardRole): CSSProperties {
  const theme = getDeckGroupTheme(createRoleGroupKey(role))

  return {
    '--role-color': theme.color,
    '--role-rgb': theme.rgb,
  } as CSSProperties
}

function getPracticeVerdict(
  openingMatches: number,
  problemMatches: number,
): PracticeVerdict {
  if (openingMatches > 0 && problemMatches > 0) {
    return 'mixed'
  }

  if (openingMatches > 0) {
    return 'clean'
  }

  if (problemMatches > 0) {
    return 'bad'
  }

  return 'neutral'
}

function getPracticeStageCardStyle(index: number, total: number): CSSProperties {
  const midpoint = (total - 1) / 2
  const offset = index - midpoint
  const distance = Math.abs(offset)

  return {
    transform: `translateY(${distance * 12}px) rotate(${offset * 4.5}deg)`,
    zIndex: Math.round(100 - distance * 10),
  }
}

function getPracticeVerdictCardClass(verdict: PracticeVerdict): string {
  if (verdict === 'clean') {
    return 'surface-card-success'
  }

  if (verdict === 'bad') {
    return 'surface-card-danger'
  }

  if (verdict === 'mixed') {
    return 'surface-panel-strong'
  }

  return 'surface-card'
}

function getPracticeVerdictBadgeClass(verdict: PracticeVerdict): string {
  if (verdict === 'clean') {
    return 'surface-card-success text-(--accent)'
  }

  if (verdict === 'bad') {
    return 'surface-card-danger text-(--destructive)'
  }

  if (verdict === 'mixed') {
    return 'surface-panel-strong text-(--primary)'
  }

  return 'surface-card text-(--text-muted)'
}

function getPracticeVerdictTitle(verdict: PracticeVerdict): string {
  if (verdict === 'clean') {
    return 'La mano es jugable'
  }

  if (verdict === 'bad') {
    return 'La mano salió mala'
  }

  if (verdict === 'mixed') {
    return 'La mano juega, pero tiene problemas'
  }

  return 'La mano quedó neutra'
}

function getPracticeVerdictDescription(
  verdict: PracticeVerdict,
  openingMatches: number,
  problemMatches: number,
): string {
  if (verdict === 'clean') {
    return `Cumple ${formatInteger(openingMatches)} apertura${openingMatches === 1 ? '' : 's'} y no muestra problemas.`
  }

  if (verdict === 'bad') {
    return `No cumple aperturas y sí muestra ${formatInteger(problemMatches)} problema${problemMatches === 1 ? '' : 's'}.`
  }

  if (verdict === 'mixed') {
    return `Cumple ${formatInteger(openingMatches)} apertura${openingMatches === 1 ? '' : 's'} y también muestra ${formatInteger(problemMatches)} problema${problemMatches === 1 ? '' : 's'}.`
  }

  return 'Esta mano no entra ni en tus aperturas ni en tus problemas.'
}

function getPracticeMatchStateLabel(kind: HandPattern['kind']): string {
  return kind === 'opening' ? 'Cumplida' : 'Detectado'
}

function getPracticeMatchStateBadgeClass(kind: HandPattern['kind']): string {
  return kind === 'opening'
    ? 'surface-card-success text-(--accent)'
    : 'surface-card-danger text-(--destructive)'
}

function getPracticeMatchExplanation(match: PracticeHandMatch): string {
  return match.kind === 'opening'
    ? 'La mano sí cumple este check con las cartas resumidas abajo.'
    : 'La mano cae en este problema por la composición actual.'
}

function getAssignmentStateLabel(kind: PracticeHandRequirementAssignment['kind']): string {
  return kind === 'exclude' ? 'Libre' : 'Usado'
}

function getVisibleAssignmentCards(
  cards: PracticeHandRequirementAssignment['cards'],
  limit = 2,
): {
  hiddenCount: number
  visibleCards: PracticeHandRequirementAssignment['cards']
} {
  const visibleCards = cards.slice(0, limit)

  return {
    hiddenCount: Math.max(0, cards.length - visibleCards.length),
    visibleCards,
  }
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
  const practiceDeckCount = practiceDeck.length
  const canDrawOpeningHand = practiceDeck.length >= handSize
  const canDrawNextCard = practiceHand !== null && practiceHand.remainingDeck.length > 0
  const missingPracticeCards = Math.max(0, handSize - practiceDeckCount)
  const isEmptyPracticeDeck = practiceDeckCount === 0
  const practiceBlockedMessage =
    !hasCompletedClassification
      ? missingOriginCount > 0
        ? 'Hay cartas sin clasificar (origen). Revisá el Paso 2 antes de probar manos.'
        : missingRoleCount > 0
          ? 'Hay cartas sin clasificar (roles). Revisá el Paso 2 antes de probar manos.'
          : pendingReviewCount > 0
            ? 'Hay cartas pendientes de revisión. Cerrá el Paso 2 antes de probar manos.'
            : 'Todavía faltan clasificaciones por cerrar antes de probar manos.'
      : reviewPendingPatternCount > 0
        ? `Tenés ${formatInteger(reviewPendingPatternCount)} patrón${reviewPendingPatternCount === 1 ? '' : 'es'} heredado${reviewPendingPatternCount === 1 ? '' : 's'} pendiente${reviewPendingPatternCount === 1 ? '' : 's'} de revisión.`
        : null
  const practiceResult = useMemo(
    () =>
      practiceBlockedMessage
        ? {
            matches: [],
            openingMatches: [],
            problemMatches: [],
            openingNearMisses: [],
          }
        : evaluatePracticeHand(practiceHand?.hand ?? [], patterns, derivedMainCards, groupsByKey),
    [practiceBlockedMessage, practiceHand, patterns, derivedMainCards, groupsByKey],
  )
  const openingMatches = practiceResult.openingMatches
  const problemMatches = practiceResult.problemMatches
  const openingNearMisses = practiceResult.openingNearMisses
  const practiceVerdict = getPracticeVerdict(
    openingMatches.length,
    problemMatches.length,
  )
  const cardById = useMemo(
    () => new Map(derivedMainCards.map((card) => [card.id, card])),
    [derivedMainCards],
  )
  const handRoleSummary = useMemo(() => {
    if (!practiceHand) {
      return []
    }

    return CARD_ROLE_DEFINITIONS.flatMap((definition) => {
      const copies = practiceHand.hand.reduce((total, drawnCard) => {
        const matchingCard = cardById.get(drawnCard.cardId)

        return total + (matchingCard?.roles.includes(definition.key.value) ? 1 : 0)
      }, 0)

      return copies > 0
        ? [
            {
              key: definition.key.value,
              label: definition.label,
              copies,
            },
          ]
        : []
    })
  }, [cardById, practiceHand])

  const [isWide, setIsWide] = useState(true)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 820px)')

    const update = () => setIsWide(mediaQuery.matches)
    update()

    mediaQuery.addEventListener('change', update)
    return () => mediaQuery.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    setPracticeHand(null)
  }, [derivedMainCards, handSize])

  return (
    <section className="surface-panel-soft grid min-w-0 gap-3 overflow-x-hidden p-3 [overflow-wrap:anywhere] [word-break:break-word]">
      <div>
        <div>
          <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Práctica</p>
          <h3 className="m-0 text-[0.98rem] leading-none">Probar mano</h3>
          <p className="app-muted m-[0.25rem_0_0] max-w-[58ch] text-[0.78rem] leading-[1.2]">
            El objetivo es ver la mano, leerla rápido y entender por qué juega o por qué se rompe.
          </p>
        </div>
      </div>

      {isEmptyPracticeDeck ? (
        <p className="surface-card m-0 p-2.5 text-[0.8rem] text-(--text-muted)">
          Cargá cartas en el Main Deck para habilitar la práctica. Cuando llegues a {formatInteger(handSize)}, vas a poder robar manos y ver aperturas y problemas en vivo.
        </p>
      ) : practiceBlockedMessage ? (
        <p className="surface-card-warning m-0 p-2.5 text-[0.8rem] text-(--warning)">
          {practiceBlockedMessage}
        </p>
      ) : !canDrawOpeningHand ? (
        <p className="surface-card-warning m-0 p-2.5 text-[0.8rem] text-(--warning)">
          Todavía no alcanza para robar una mano inicial. Sumá {formatInteger(missingPracticeCards)} carta{missingPracticeCards === 1 ? '' : 's'} más al Main Deck.
        </p>
      ) : (
        <>
          <article className="surface-panel-strong grid min-w-0 gap-3 overflow-x-hidden p-3">
            <div className="flex items-start justify-between gap-3 max-[920px]:flex-col max-[920px]:items-stretch">
              <div className="min-w-0">
                <p className="app-muted m-0 text-[0.68rem] uppercase tracking-widest">Simulador en vivo</p>
                <h4 className="m-[0.22rem_0_0] text-[1.05rem] leading-none text-(--text-main)">
                  {practiceHand ? `Mano de ${formatInteger(practiceHand.hand.length)} cartas` : 'Robá una mano inicial'}
                </h4>
                <p className="app-muted m-[0.3rem_0_0] max-w-[62ch] text-[0.76rem] leading-[1.16]">
                  {practiceHand
                    ? 'Podés sacar una carta extra para simular going second o volver a robar una mano nueva.'
                    : 'Empezá con la mano de 5. Después podés sumar una sexta para revisar cómo cambia el panorama.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="md"
                  disabled={!canDrawOpeningHand}
                  onClick={() => setPracticeHand(drawRandomPracticeHand(practiceDeck, handSize))}
                >
                  Robar {formatInteger(handSize)}
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  disabled={!canDrawNextCard}
                  onClick={() => setPracticeHand((current) => (current ? drawNextCard(current) : current))}
                >
                  Robar 1 más
                </Button>
              </div>
            </div>

            <div
              className={isWide
                ? 'practice-stage flex min-h-[250px] min-w-0 items-start justify-center overflow-hidden px-4 py-4'
                : 'practice-stage grid min-w-0 grid-cols-5 gap-2 overflow-hidden px-4 py-4'
              }
            >
              {(practiceHand?.hand ?? Array.from({ length: handSize })).map((card, index, hand) => {
                const cardCount = hand.length
                const cardStyle = isWide ? getPracticeStageCardStyle(index, cardCount) : undefined

                if (!practiceHand) {
                  return (
                    <div
                      key={`placeholder-${index}`}
                      className={[
                        'practice-placeholder-card aspect-[0.72] shrink-0',
                        isWide
                          ? 'w-[clamp(96px,16vw,132px)]'
                          : 'w-full',
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
                      isWide
                        ? 'w-[clamp(96px,16vw,132px)]'
                        : 'w-full',
                      isWide && index !== 0 ? '-ml-5 min-[820px]:-ml-7' : '',
                    ].join(' ')}
                    style={cardStyle}
                  >
                    <CardArt
                      remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                      name={card.name}
                      className="block h-auto w-full bg-(--input)"
                      limitCard={card.apiCard}
                      limitBadgeSize="lg"
                    />
                  </article>
                )
              })}
            </div>

            {!practiceHand ? (
              <p className="app-muted m-0 text-center text-[0.78rem] leading-[1.18]">
                Cuando robes, la app va a evaluar la mano al instante y te va a mostrar aperturas, problemas y composición real.
              </p>
            ) : null}
          </article>

          {practiceHand ? (
            <article
              className={[
                getPracticeVerdictCardClass(practiceVerdict),
                'grid min-w-0 gap-3 overflow-x-hidden p-3 [overflow-wrap:anywhere] [word-break:break-word]',
              ].join(' ')}
            >
              <div className="flex items-start justify-between gap-3 max-[900px]:flex-col max-[900px]:items-stretch">
                <div className="min-w-0">
                  <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Resultado</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="m-0 text-[1.08rem] leading-none text-(--text-main)">
                      {getPracticeVerdictTitle(practiceVerdict)}
                    </h4>
                    <span className={[getPracticeVerdictBadgeClass(practiceVerdict), 'px-2 py-1 text-[0.72rem]'].join(' ')}>
                      {practiceVerdict === 'clean'
                        ? 'Jugable'
                        : practiceVerdict === 'bad'
                          ? 'Mala'
                          : practiceVerdict === 'mixed'
                            ? 'Mixta'
                            : 'Neutra'}
                    </span>
                  </div>
                  <p className="app-muted m-[0.34rem_0_0] max-w-[58ch] text-[0.78rem] leading-[1.18]">
                    {getPracticeVerdictDescription(
                      practiceVerdict,
                      openingMatches.length,
                      problemMatches.length,
                    )}
                  </p>
                </div>
              </div>

              <div className="grid min-w-0 gap-2 min-[860px]:grid-cols-3">
                <PracticeResultStat
                  label="Aperturas"
                  tone="positive"
                  value={openingMatches.length}
                />
                <PracticeResultStat
                  label="Problemas"
                  tone="negative"
                  value={problemMatches.length}
                />
                <PracticeResultStat
                  label="Cartas en mano"
                  tone="neutral"
                  value={practiceHand.hand.length}
                />
              </div>

              {handRoleSummary.length > 0 ? (
                <div className="grid min-w-0 gap-1.5">
                  <small className="app-muted text-[0.68rem] uppercase tracking-widest">
                    Qué salió en la mano
                  </small>
                  <div className="flex min-w-0 flex-wrap gap-1.5">
                    {handRoleSummary.map((item) => (
                      <span
                        key={item.key}
                        className="app-role-chip inline-flex items-center gap-1.5 px-2 py-1 text-[0.74rem]"
                        style={getRoleStyle(item.key)}
                      >
                        {formatInteger(item.copies)}x {item.label}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {practiceResult.matches.length > 0 ? (
                <div className="grid min-w-0 gap-3">
                  {openingMatches.length > 0 ? (
                    <PracticeMatchGroup
                      count={openingMatches.length}
                      matches={openingMatches}
                      title="Aperturas cumplidas"
                    />
                  ) : null}

                  {problemMatches.length > 0 ? (
                    <PracticeMatchGroup
                      count={problemMatches.length}
                      matches={problemMatches}
                      title="Problemas detectados"
                    />
                  ) : null}

                  {openingMatches.length === 0 && openingNearMisses.length > 0 ? (
                    <div className="grid min-w-0 gap-2.5">
                      <PracticeMatchHeader
                        title="Lo que le faltó a la mano para abrir"
                        count={openingNearMisses.length}
                      />
                      <div className="grid min-w-0 gap-2">
                        {openingNearMisses.slice(0, 3).map((nearMiss) => (
                          <PracticeNearMissCard key={nearMiss.patternId} nearMiss={nearMiss} />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <PracticeTechnicalDetails matches={practiceResult.matches} />
                </div>
              ) : openingNearMisses.length > 0 ? (
                <div className="grid min-w-0 gap-2.5">
                  <PracticeMatchHeader
                    title="Lo que le faltó a la mano para abrir"
                    count={openingNearMisses.length}
                  />
                  <div className="grid min-w-0 gap-2">
                    {openingNearMisses.slice(0, 3).map((nearMiss) => (
                      <PracticeNearMissCard key={nearMiss.patternId} nearMiss={nearMiss} />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="surface-card m-0 px-2.5 py-2 text-[0.78rem] text-(--text-muted)">
                  Esta mano no disparó aperturas ni problemas. Queda como referencia neutra para seguir probando.
                </p>
              )}
            </article>
          ) : null}
        </>
      )}
    </section>
  )
}

function PracticeMatchHeader({
  title,
  count,
}: {
  title: string
  count: number
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <small className="app-muted min-w-0 text-[0.68rem] uppercase tracking-widest">{title}</small>
      <span className="app-chip px-2 py-0.5 text-[0.7rem]">{formatInteger(count)}</span>
    </div>
  )
}

function PracticeResultStat({
  label,
  tone,
  value,
}: {
  label: string
  tone: 'negative' | 'neutral' | 'positive'
  value: number
}) {
  const toneClass = tone === 'positive'
    ? 'surface-card-success'
    : tone === 'negative'
      ? 'surface-card-danger'
      : 'surface-card'

  return (
    <article
      className={[
        toneClass,
        'grid min-w-0 gap-1 overflow-hidden px-2.5 py-2 [overflow-wrap:anywhere] [word-break:break-word]',
      ].join(' ')}
    >
      <small className="app-muted text-[0.68rem] uppercase tracking-widest">{label}</small>
      <strong className="text-[1rem] leading-none text-(--text-main)">{formatInteger(value)}</strong>
    </article>
  )
}

function PracticeMatchGroup({
  count,
  matches,
  title,
}: {
  count: number
  matches: PracticeHandMatch[]
  title: string
}) {
  return (
    <section className="grid min-w-0 gap-2.5">
      <PracticeMatchHeader title={title} count={count} />
      <div className="grid min-w-0 gap-2">
        {matches.map((match) => (
          <PracticeMatchCard key={match.patternId} match={match} />
        ))}
      </div>
    </section>
  )
}

function PracticeMatchCard({ match }: { match: PracticeHandMatch }) {
  return (
    <article
      className={[
        getPracticeMatchCardClass(match.kind),
        'grid min-w-0 gap-2 overflow-hidden px-3 py-2.5 [overflow-wrap:anywhere] [word-break:break-word]',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <strong className="min-w-0 text-[0.9rem] text-(--text-main)">{match.name}</strong>
            <span
              className={[
                getPracticeMatchStateBadgeClass(match.kind),
                'px-1.5 py-0.5 text-[0.65rem]',
              ].join(' ')}
            >
              {getPracticeMatchStateLabel(match.kind)}
            </span>
          </div>
          <small className="app-muted min-w-0 text-[0.72rem] leading-[1.16]">
            {match.requirementLabel}
          </small>
        </div>
      </div>

      <p className="m-0 text-[0.76rem] leading-[1.16] text-(--text-main)">
        {getPracticeMatchExplanation(match)}
      </p>

      {match.assignments.length > 0 ? (
        <div className="grid min-w-0 gap-1.5">
          <small className="app-muted text-[0.68rem] uppercase tracking-widest">Asignación resumida</small>
          <div className="grid min-w-0 gap-1.5">
            {match.assignments.map((assignment) => (
              <PracticeAssignmentSummaryRow
                key={assignment.requirementId}
                assignment={assignment}
              />
            ))}
          </div>
        </div>
      ) : null}
    </article>
  )
}

function PracticeAssignmentSummaryRow({
  assignment,
}: {
  assignment: PracticeHandRequirementAssignment
}) {
  const { hiddenCount, visibleCards } = getVisibleAssignmentCards(assignment.cards)

  return (
    <div className="surface-panel-soft grid min-w-0 gap-1 px-2.5 py-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <strong className="min-w-0 text-[0.74rem] text-(--text-main)">{assignment.sourceLabel}</strong>
        <span className="surface-panel-soft px-1.5 py-0.5 text-[0.64rem] text-(--text-muted)">
          {getAssignmentStateLabel(assignment.kind)}
        </span>
      </div>

      {assignment.kind === 'exclude' ? (
        <p className="app-muted m-0 text-[0.74rem] leading-[1.15]">Sin cartas en la mano.</p>
      ) : assignment.cards.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {visibleCards.map((card) => (
            <PracticeCardBadge
              key={`${assignment.requirementId}-${card.name}`}
              card={card}
            />
          ))}
          {hiddenCount > 0 ? (
            <span className="surface-panel-soft px-2 py-1 text-[0.7rem] text-(--text-muted)">
              +{formatInteger(hiddenCount)} más
            </span>
          ) : null}
        </div>
      ) : (
        <p className="app-muted m-0 text-[0.74rem] leading-[1.15]">Sin asignación visible.</p>
      )}
    </div>
  )
}

function PracticeTechnicalDetails({ matches }: { matches: PracticeHandMatch[] }) {
  if (matches.length === 0) {
    return null
  }

  return (
    <details className="details-toggle section-disclosure grid min-w-0 gap-1 overflow-hidden">
      <summary className="section-disclosure-summary min-w-0">
        <span className="section-disclosure-title">
          <span className="grid min-w-0 gap-0.5">
            <strong className="text-[0.84rem] text-(--text-main)">Ver asignación completa</strong>
            <span className="app-muted text-[0.72rem] leading-[1.14]">
              Detalle carta por carta de cada check cumplido.
            </span>
          </span>
        </span>
        <span className="section-disclosure-arrow details-arrow" aria-hidden="true">›</span>
      </summary>

      <div className="grid min-w-0 gap-2 px-2.5 pb-2.5">
        {matches.map((match) => (
          <article
            key={`technical-${match.patternId}`}
            className="surface-card grid min-w-0 gap-1.5 overflow-hidden px-2.5 py-2 [overflow-wrap:anywhere] [word-break:break-word]"
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <strong className="min-w-0 text-[0.82rem] text-(--text-main)">{match.name}</strong>
              <span
                className={[
                  getPracticeMatchStateBadgeClass(match.kind),
                  'px-1.5 py-0.5 text-[0.65rem]',
                ].join(' ')}
              >
                {getPracticeMatchStateLabel(match.kind)}
              </span>
            </div>

            <small className="app-muted min-w-0 text-[0.72rem] leading-[1.14]">
              {match.requirementLabel}
            </small>

            <div className="grid min-w-0 gap-1.5">
              {match.assignments.map((assignment) => (
                <PracticeAssignmentDetailRow
                  key={`technical-${match.patternId}-${assignment.requirementId}`}
                  assignment={assignment}
                />
              ))}
            </div>
          </article>
        ))}
      </div>
    </details>
  )
}

function PracticeAssignmentDetailRow({
  assignment,
}: {
  assignment: PracticeHandRequirementAssignment
}) {
  return (
    <div className="surface-panel-soft grid min-w-0 gap-1 px-2 py-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <strong className="min-w-0 text-[0.73rem] text-(--text-main)">{assignment.sourceLabel}</strong>
        <span className="surface-panel-soft px-1.5 py-0.5 text-[0.64rem] text-(--text-muted)">
          {getAssignmentStateLabel(assignment.kind)}
        </span>
      </div>

      {assignment.kind === 'exclude' ? (
        <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">Sin cartas en la mano.</p>
      ) : assignment.cards.length > 0 ? (
        <div className="flex min-w-0 flex-wrap gap-1">
          {assignment.cards.map((card) => (
            <PracticeCardBadge
              key={`${assignment.requirementId}-detail-${card.name}`}
              card={card}
            />
          ))}
        </div>
      ) : (
        <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">Sin asignación visible.</p>
      )}
    </div>
  )
}

function PracticeCardBadge({
  card,
}: {
  card: {
    name: string
    copies: number
  }
}) {
  return (
    <span className="surface-card inline-flex min-w-0 max-w-full items-center gap-1 px-2 py-1 text-[0.7rem] text-(--text-main) [overflow-wrap:anywhere] [word-break:break-word]">
      <span className="min-w-0">{card.name}</span>
      {card.copies > 1 ? (
        <span className="app-muted shrink-0">x{formatInteger(card.copies)}</span>
      ) : null}
    </span>
  )
}

function PracticeNearMissCard({ nearMiss }: { nearMiss: PracticeHandNearMiss }) {
  return (
    <article className="surface-card grid min-w-0 gap-2 overflow-hidden px-2.5 py-2 [overflow-wrap:anywhere] [word-break:break-word]">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <strong className="block min-w-0 text-[0.88rem] text-(--text-main)">{nearMiss.name}</strong>
          <small className="app-muted mt-[0.22rem] block min-w-0 text-[0.72rem] leading-[1.16]">
            {nearMiss.requirementLabel}
          </small>
        </div>
        <span className="app-chip shrink-0 px-2 py-0.5 text-[0.68rem]">
          Falta {formatInteger(nearMiss.missingConditions)}
        </span>
      </div>

      <div className="grid min-w-0 gap-1">
        {nearMiss.notes.map((note, index) => (
          <p
            key={`${nearMiss.patternId}-note-${index}`}
            className="surface-panel-soft m-0 px-2 py-1.5 text-[0.74rem] leading-[1.15] text-(--text-muted)"
          >
            {note}
          </p>
        ))}
      </div>
    </article>
  )
}

function getPracticeMatchCardClass(kind: HandPattern['kind']): string {
  return kind === 'opening'
    ? 'surface-card-success'
    : 'surface-card-danger'
}
