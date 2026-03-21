import { useEffect, useMemo, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { normalizeHandPatternCategory } from '../../app/patterns'
import { formatInteger } from '../../app/utils'
import type { CardEntry, HandPattern } from '../../types'
import { CardArt } from '../CardArt'
import { buildPracticeDeck, drawNextCard, drawRandomPracticeHand, evaluatePracticeHand, type PracticeHandState } from './practice'

interface PracticeSectionProps {
  handSize: number
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
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
  const canDrawOpeningHand = practiceDeck.length >= handSize
  const canDrawNextCard = practiceHand !== null && practiceHand.remainingDeck.length > 0
  const practiceVerdict =
    practiceResult.openingMatches.length > 0 && practiceResult.problemMatches.length > 0
      ? 'mixed'
      : practiceResult.openingMatches.length > 0
        ? 'clean'
        : practiceResult.problemMatches.length > 0
          ? 'bad'
          : 'neutral'

  useEffect(() => {
    setPracticeHand(null)
  }, [derivedMainCards, handSize])

  return (
    <section className="surface-panel-soft grid gap-2 p-2.5">
      <div className="flex items-start justify-between gap-2.5 max-[760px]:flex-col max-[760px]:items-stretch">
        <div>
          <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Práctica</p>
          <h3 className="m-0 text-[0.98rem] leading-none">Probar mano</h3>
          <p className="app-muted m-[0.25rem_0_0] max-w-[58ch] text-[0.78rem] leading-[1.2]">
            Robá 5 para simular ir primero. Si querés ver la mano yendo segundo, sumá una sexta.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="app-button app-button-primary px-2 py-1 text-[0.8rem]"
            disabled={!canDrawOpeningHand}
            onClick={() => setPracticeHand(drawRandomPracticeHand(practiceDeck, handSize))}
          >
            Robar {formatInteger(handSize)}
          </button>
          <button
            type="button"
            className="app-button px-2 py-1 text-[0.8rem]"
            disabled={!canDrawNextCard}
            onClick={() => setPracticeHand((current) => (current ? drawNextCard(current) : current))}
          >
            Robar 1+
          </button>
        </div>
      </div>

      {!canDrawOpeningHand ? (
        <p className="surface-card m-0 p-2 text-[0.8rem] text-[#ff9e9e]">
          Necesitás al menos {formatInteger(handSize)} cartas en el Main Deck para probar manos con esta apertura.
        </p>
      ) : !practiceHand ? (
        <p className="surface-card m-0 p-2 text-[0.8rem] text-[var(--text-muted)]">
          Usá <strong>Robar {formatInteger(handSize)}</strong> para generar una mano inicial.
        </p>
      ) : (
        <div className="grid gap-2">
          <div className="grid gap-2">
            <div className="grid w-full min-w-0 max-w-full grid-cols-3 gap-2 pr-1 min-[760px]:grid-cols-[repeat(auto-fit,minmax(90px,1fr))]">
              {practiceHand.hand.map((card) => (
                <article key={card.drawId} className="surface-card w-full p-1.5">
                  <CardArt
                    remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                    name={card.name}
                    className="block aspect-[0.72] w-full border border-[var(--border-subtle)] bg-[#050505] object-cover"
                  />
                </article>
              ))}
            </div>

            <article
              className={[
                'grid gap-2 p-2.5',
                practiceVerdict === 'clean'
                  ? 'surface-card-accent'
                  : practiceVerdict === 'bad'
                    ? 'surface-card'
                    : practiceVerdict === 'mixed'
                      ? 'surface-panel-soft'
                      : 'surface-card',
              ].join(' ')}
            >
              <div>
                <p className="app-kicker m-0 mb-0.5 text-[0.68rem] uppercase tracking-widest">Resultado</p>
                <h4 className="m-0 text-[0.92rem] leading-none">
                  {practiceVerdict === 'clean'
                    ? 'La mano es jugable'
                    : practiceVerdict === 'bad'
                      ? 'La mano salió mala'
                      : practiceVerdict === 'mixed'
                        ? 'La mano juega, pero tiene problemas'
                        : 'La mano quedó neutra'}
                </h4>
                <p className="app-muted m-[0.35rem_0_0] text-[0.76rem] leading-[1.18]">
                  {practiceVerdict === 'clean'
                    ? `Cumple ${formatInteger(practiceResult.openingMatches.length)} apertura${practiceResult.openingMatches.length === 1 ? '' : 's'} y no muestra problemas.`
                    : practiceVerdict === 'bad'
                      ? `No cumple aperturas y sí muestra ${formatInteger(practiceResult.problemMatches.length)} problema${practiceResult.problemMatches.length === 1 ? '' : 's'}.`
                      : practiceVerdict === 'mixed'
                        ? `Cumple ${formatInteger(practiceResult.openingMatches.length)} apertura${practiceResult.openingMatches.length === 1 ? '' : 's'} y también muestra ${formatInteger(practiceResult.problemMatches.length)} problema${practiceResult.problemMatches.length === 1 ? '' : 's'}.`
                        : 'Esta mano no entra ni en tus aperturas ni en tus problemas.'}
                </p>
              </div>

              {practiceResult.matches.length > 0 ? (
                <div className="grid gap-2">
                  {practiceResult.openingMatches.length > 0 ? (
                    <div className="grid gap-1.5">
                      <small className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Aperturas que cumplió esta mano</small>
                      {practiceResult.openingMatches.map((match) => (
                        <article
                          key={match.patternId}
                          className={[
                            'px-2 py-1.5',
                            getPracticeMatchCardClass(match.category),
                          ].join(' ')}
                        >
                          <strong className="block">{match.name}</strong>
                          <small className="app-muted text-[0.7rem] leading-[1.15]">{match.requirementLabel}</small>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  {practiceResult.problemMatches.length > 0 ? (
                    <div className="grid gap-1.5">
                      <small className="app-muted text-[0.68rem] uppercase tracking-[0.08em]">Problemas que aparecieron en esta mano</small>
                      {practiceResult.problemMatches.map((match) => (
                        <article
                          key={match.patternId}
                          className={[
                            'px-2 py-1.5',
                            getPracticeMatchCardClass(match.category),
                          ].join(' ')}
                        >
                          <strong className="block">{match.name}</strong>
                          <small className="app-muted text-[0.7rem] leading-[1.15]">{match.requirementLabel}</small>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          </div>
        </div>
      )}
    </section>
  )
}

function getPracticeMatchCardClass(category: HandPattern['category']): string {
  return normalizeHandPatternCategory(category) === 'good'
    ? 'surface-card border border-[rgba(69,211,111,0.48)] shadow-[0_0_0_1px_rgba(69,211,111,0.08)]'
    : 'surface-card border border-[rgba(139,13,24,0.52)] shadow-[0_0_0_1px_rgba(139,13,24,0.08)]'
}
