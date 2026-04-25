import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import {
  buildDerivedDeckGroupMap,
} from '../../app/deck-groups'
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
  type PracticeHandNearMiss,
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

type PracticeVerdict = 'clean' | 'bad' | 'mixed' | 'neutral'

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
  onRedraw,
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
    <section className="surface-panel-soft grid min-w-0 gap-3 overflow-x-hidden p-3 wrap-anywhere [word-break:break-word]">
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
          Cargá cartas en el Main Deck para habilitar la práctica. Cuando llegues a {formatInteger(handSize)}, vas a poder robar manos y ver salidas y problemas en vivo.
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
                      className="block h-auto w-full bg-input"
                      limitCard={card.apiCard}
                      limitBadgeSize="lg"
                    />
                  </article>
                )
              })}
            </div>

            {!practiceHand ? (
              <p className="app-muted m-0 text-center text-[0.78rem] leading-[1.18]">
                Cuando robes, la app va a evaluar la mano al instante y te va a mostrar salidas, problemas y composición real.
              </p>
            ) : null}
          </article>

          {practiceHand ? (
            <article
              className={[
                getPracticeVerdictCardClass(practiceVerdict),
                'grid min-w-0 gap-3 overflow-x-hidden p-3 wrap-anywhere [word-break:break-word]',
              ].join(' ')}
            >
              {practiceResult.matches.length > 0 ? (
                <div className="grid min-w-0 gap-3">
                  {openingMatches.length > 0 ? (
                    <PracticeMatchGroup
                      count={openingMatches.length}
                      matches={openingMatches}
                      title="Salidas cumplidas"
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
              <div className="surface-card grid min-w-0 gap-2 px-2.5 py-2">
                  <p className="m-0 text-[0.78rem] text-(--text-muted)">
                    Probá robar otra mano o revisá tus reglas activas.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setPracticeHand(drawRandomPracticeHand(practiceDeck, handSize))
                      onRedraw?.()
                    }}
                  >
                    Robar otra mano
                  </Button>
                </div>
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
      <div className="grid grid-cols-2 gap-3 max-[640px]:grid-cols-1">
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


function PracticeNearMissCard({ nearMiss }: { nearMiss: PracticeHandNearMiss }) {
  return (
    <article className="surface-card grid min-w-0 gap-2 overflow-hidden px-2.5 py-2 wrap-anywhere [word-break:break-word]">
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


