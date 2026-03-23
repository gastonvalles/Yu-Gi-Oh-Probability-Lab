import { useEffect, useMemo, useState, type CSSProperties } from 'react'

import { buildDerivedDeckGroupMap, CARD_ROLE_DEFINITIONS } from '../../app/deck-groups'
import { normalizeHandPatternCategory } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, CardRole, HandPattern } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { buildPracticeDeck, drawNextCard, drawRandomPracticeHand, evaluatePracticeHand, type PracticeHandState } from './practice'

interface PracticeSectionProps {
  handSize: number
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
}

type PracticeVerdict = 'clean' | 'bad' | 'mixed' | 'neutral'

interface PracticeMatchSummary {
  patternId: HandPattern['id']
  name: string
  requirementLabel: string
  category: HandPattern['category']
}

const ROLE_THEME: Record<CardRole, { color: string; rgb: string }> = {
  starter: { color: 'var(--starter)', rgb: 'var(--starter-rgb)' },
  extender: { color: 'var(--extender)', rgb: 'var(--extender-rgb)' },
  brick: { color: 'var(--brick)', rgb: 'var(--brick-rgb)' },
  handtrap: { color: 'var(--handtrap)', rgb: 'var(--handtrap-rgb)' },
  boardbreaker: { color: 'var(--boardbreaker)', rgb: 'var(--boardbreaker-rgb)' },
  floodgate: { color: 'var(--floodgate)', rgb: 'var(--floodgate-rgb)' },
}

function getRoleStyle(role: CardRole): CSSProperties {
  const theme = ROLE_THEME[role]

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

export function PracticeSection({
  handSize,
  derivedMainCards,
  patterns,
}: PracticeSectionProps) {
  const practiceDeck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const [practiceHand, setPracticeHand] = useState<PracticeHandState | null>(null)
  const practiceResult = useMemo(
    () => evaluatePracticeHand(practiceHand?.hand ?? [], patterns, derivedMainCards, groupsByKey),
    [practiceHand, patterns, derivedMainCards, groupsByKey],
  )
  const practiceDeckCount = practiceDeck.length
  const canDrawOpeningHand = practiceDeck.length >= handSize
  const canDrawNextCard = practiceHand !== null && practiceHand.remainingDeck.length > 0
  const missingPracticeCards = Math.max(0, handSize - practiceDeckCount)
  const isEmptyPracticeDeck = practiceDeckCount === 0
  const openingMatches = practiceResult.openingMatches
  const problemMatches = practiceResult.problemMatches
  const pairedMatchRows = useMemo(
    () =>
      Array.from({ length: Math.max(openingMatches.length, problemMatches.length) }, (_, index) => ({
        opening: openingMatches[index] ?? null,
        problem: problemMatches[index] ?? null,
      })),
    [openingMatches, problemMatches],
  )
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

        return total + (matchingCard?.roles.includes(definition.key) ? 1 : 0)
      }, 0)

      return copies > 0
        ? [
            {
              key: definition.key,
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
    <section className="surface-panel-soft grid gap-3 p-3">
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
      ) : !canDrawOpeningHand ? (
        <p className="surface-card-warning m-0 p-2.5 text-[0.8rem] text-(--warning)">
          Todavía no alcanza para robar una mano inicial. Sumá {formatInteger(missingPracticeCards)} carta{missingPracticeCards === 1 ? '' : 's'} más al Main Deck.
        </p>
      ) : (
        <>
          <article className="surface-panel-strong grid gap-3 p-3">
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
                ? 'practice-stage flex min-h-[250px] items-start justify-center overflow-x-auto overflow-y-hidden px-4 py-4'
                : 'practice-stage grid grid-cols-5 gap-2 overflow-y-hidden px-4 py-4'
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
                      'surface-card shrink-0 overflow-hidden p-1.5 shadow-[0_18px_36px_rgba(0,0,0,0.35)]',
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
                      className="block aspect-[0.72] w-full border border-(--border-subtle) bg-(--input) object-cover"
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
            <article className={[getPracticeVerdictCardClass(practiceVerdict), 'grid gap-3 p-3'].join(' ')}>
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

              {handRoleSummary.length > 0 ? (
                <div className="grid gap-1.5">
                  <small className="app-muted text-[0.68rem] uppercase tracking-widest">
                    Qué salió en la mano
                  </small>
                  <div className="flex flex-wrap gap-1.5">
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
                <>
                  <div className="grid gap-3 min-[980px]:hidden">
                    {openingMatches.length > 0 ? (
                      <div className="grid gap-1.5">
                        <PracticeMatchHeader
                          title="Aperturas que cumplió esta mano"
                          count={openingMatches.length}
                        />
                        {openingMatches.map((match) => (
                          <PracticeMatchCard key={match.patternId} match={match} />
                        ))}
                      </div>
                    ) : null}

                    {problemMatches.length > 0 ? (
                      <div className="grid gap-1.5">
                        <PracticeMatchHeader
                          title="Problemas que aparecieron en esta mano"
                          count={problemMatches.length}
                        />
                        {problemMatches.map((match) => (
                          <PracticeMatchCard key={match.patternId} match={match} />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="hidden gap-3 min-[980px]:grid">
                    <div className="grid gap-3 min-[980px]:grid-cols-2 min-[980px]:items-start">
                      {openingMatches.length > 0 ? (
                        <PracticeMatchHeader
                          title="Aperturas que cumplió esta mano"
                          count={openingMatches.length}
                        />
                      ) : (
                        <div />
                      )}
                      {problemMatches.length > 0 ? (
                        <PracticeMatchHeader
                          title="Problemas que aparecieron en esta mano"
                          count={problemMatches.length}
                        />
                      ) : (
                        <div />
                      )}
                    </div>

                    <div className="grid gap-3">
                      {pairedMatchRows.map((row, index) => (
                        <div
                          key={`practice-match-row-${index}`}
                          className="grid gap-3 min-[980px]:grid-cols-2 min-[980px]:items-stretch"
                        >
                          <div className="h-full">
                            {row.opening ? <PracticeMatchCard match={row.opening} fillHeight /> : null}
                          </div>
                          <div className="h-full">
                            {row.problem ? <PracticeMatchCard match={row.problem} fillHeight /> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
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
    <div className="flex items-center justify-between gap-2">
      <small className="app-muted text-[0.68rem] uppercase tracking-widest">{title}</small>
      <span className="app-chip px-2 py-0.5 text-[0.7rem]">{formatInteger(count)}</span>
    </div>
  )
}

function PracticeMatchCard({
  match,
  fillHeight = false,
}: {
  match: PracticeMatchSummary
  fillHeight?: boolean
}) {
  return (
    <article
      className={[
        'px-2.5 py-2',
        fillHeight ? 'h-full' : '',
        getPracticeMatchCardClass(match.category),
      ].join(' ')}
    >
      <strong className="block text-[0.9rem] text-(--text-main)">{match.name}</strong>
      <small className="app-muted mt-[0.22rem] block text-[0.72rem] leading-[1.16]">
        {match.requirementLabel}
      </small>
    </article>
  )
}

function getPracticeMatchCardClass(category: HandPattern['category']): string {
  return normalizeHandPatternCategory(category) === 'good'
    ? 'surface-card-success'
    : 'surface-card-danger'
}
