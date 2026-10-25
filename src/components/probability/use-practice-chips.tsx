import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { requestLabOdds } from '../../app/lab-odds-client'
import type { LabOdds } from '../../app/lab-odds'
import { reactMascot } from '../../app/mascot'
import type { MatSession } from '../../app/use-mat-session'
import { t } from '../../i18n'
import type { CardEntry, HandPattern } from '../../types'
import { Callout } from '../ui/Callout'
import { buildPracticeDeck, cardIdOfDrawId, evaluatePracticeHand, getMatchCardIds, getPracticeTurn, getPracticeVerdict, type PracticeHandCard } from './practice'
import { PracticeBoard, UNPLAYABLE_ID } from './PracticeBoard'

/** Lo del Lab que necesitan las salidas y problemas de la mano de apertura. */
export interface PracticeLab {
  handSize: number
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
  hasCompletedClassification: boolean
  reviewPendingPatternCount: number
}

const EMPTY_IDS: ReadonlySet<string> = new Set()

function getBlockedMessage({ hasCompletedClassification, reviewPendingPatternCount }: PracticeLab): string | null {
  if (!hasCompletedClassification) {
    return t('practice.section.classify')
  }

  return reviewPendingPatternCount > 0 ? t('practice.section.legacyRules') : null
}

/**
 * Las salidas y problemas de la mano de apertura (los chips del Lab, como «Al menos 1 Starter») de una mesa: el `footer` de `PracticeMat` y las cartas que brillan. Se evalúan sobre la
 * mano inicial de la mesa (la mano con la que se abrió, más la carta robada si se fue 2º). El veredicto no se muestra (Gastón lo consideró innecesario): sólo guía a la mascota y al chip
 * "Mano no jugable". Los chips están mientras se mira la mano de apertura: con la primera jugada desaparecen (y vuelven si se deshace). Los usan la práctica y «Jugar solo automático».
 * `needCards`: el deck no alcanza para una mano.
 */
export function usePracticeChips(lab: PracticeLab, session: MatSession) {
  const { handSize, derivedMainCards, patterns } = lab
  const deck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const blockedMessage = getBlockedMessage(lab)

  // Mano inicial: la de la mesa al empezar y, si la primera jugada fue robar una carta, esa también (se fue 2º).
  // Sólo importa si se fue 2º (no las jugadas): así cada jugada no vuelve a evaluar la mano.
  const first = session.actions[0]
  const drewSecond = first?.type === 'draw' && first.count === 1 && session.cursor >= 1
  // Con la primera jugada (robar la carta de ir 2º no cuenta) ya no se evalúa la mano de apertura: las salidas y problemas, y lo que marcan en la mano, dejan de mostrarse.
  const started = session.cursor > (drewSecond ? 1 : 0)
  const openingHand = useMemo<PracticeHandCard[]>(() => {
    const byDrawId = new Map(deck.map((card) => [card.drawId, card]))
    const byCardId = new Map(deck.map((card) => [card.cardId, card]))
    const ids = [...session.initial.hand]

    if (drewSecond && session.initial.deck[0]) {
      ids.push(session.initial.deck[0])
    }

    return ids.flatMap((drawId) => {
      // Una carta que ya no está en el deck (combo viejo) se evalúa por otra copia de la misma carta, si queda alguna.
      const card = byDrawId.get(drawId) ?? byCardId.get(cardIdOfDrawId(drawId))
      return card ? [{ ...card, drawId }] : []
    })
  }, [deck, session.initial, drewSecond])

  const turn = getPracticeTurn(openingHand.length, handSize)
  const result = useMemo(
    () => (blockedMessage || openingHand.length === 0 ? null : evaluatePracticeHand(openingHand, patterns, derivedMainCards, groupsByKey, turn, handSize)),
    [blockedMessage, openingHand, patterns, derivedMainCards, groupsByKey, turn, handSize],
  )

  const [activeRuleId, setActiveRuleId] = useState<string | null>(null)
  const [caseIndex, setCaseIndex] = useState(0)

  useEffect(() => {
    setActiveRuleId(null)
    setCaseIndex(0)
  }, [session.initial])

  const openings = result?.openingMatches ?? []
  const problems = result?.problemMatches ?? []
  const activeMatch = [...openings, ...problems].find((match) => match.patternId === activeRuleId) ?? null
  const activeCase = activeMatch ? Math.min(caseIndex, Math.max(0, activeMatch.cases.length - 1)) : 0

  // Cada toque en la misma regla pasa al siguiente caso (otra forma de cumplirla); al llegar al último vuelve al primero.
  const handleToggleRule = (patternId: string) => {
    if (patternId !== activeRuleId) {
      setActiveRuleId(patternId)
      setCaseIndex(0)
      return
    }

    // Con varios casos se da la vuelta (el último pasa al primero); con uno solo, el toque la apaga.
    if (activeMatch && activeMatch.cases.length > 1) {
      setCaseIndex((activeCase + 1) % activeMatch.cases.length)
      return
    }

    setActiveRuleId(null)
    setCaseIndex(0)
  }

  const dismissRule = useCallback(() => {
    setActiveRuleId(null)
    setCaseIndex(0)
  }, [])

  const highlighted = useMemo<ReadonlySet<string>>(
    () => (activeMatch ? new Set(getMatchCardIds(activeMatch, openingHand, activeCase)) : EMPTY_IDS),
    [activeMatch, activeCase, openingHand],
  )

  const verdict = result ? getPracticeVerdict(openings.length, problems.length) : null

  // Cupsy festeja la mano limpia y se frustra con un problema: una vez por mano (o por robo).
  useEffect(() => {
    if (verdict === 'clean') {
      reactMascot('jumping', 2500)
    } else if (verdict === 'with-problem') {
      reactMascot('failed', 2500)
    }
  }, [verdict, session.initial])

  // El cálculo exacto del Lab es pesado: corre en un hilo aparte (y se recuerda por contenido).
  const [labOdds, setLabOdds] = useState<LabOdds | null>(null)
  // Las listas llegan como arrays nuevos en cada render: se compara por contenido.
  const labKey = JSON.stringify([
    handSize,
    derivedMainCards.map((card) => [card.id, card.copies, card.roles, card.origin]),
    patterns,
  ])
  const labInputsRef = useRef({ derivedMainCards, patterns })
  labInputsRef.current = { derivedMainCards, patterns }

  useEffect(() => {
    if (blockedMessage || deck.length < handSize) {
      setLabOdds(null)
      return
    }

    let cancelled = false
    const { derivedMainCards: cards, patterns: rules } = labInputsRef.current

    void requestLabOdds(labKey, { cards, patterns: rules, handSize }).then((odds) => {
      if (!cancelled) {
        setLabOdds(odds)
      }
    })

    return () => {
      cancelled = true
    }
  }, [blockedMessage, deck.length, handSize, labKey])

  const isUnplayable = verdict === 'no-opening'
  const unplayableOdds = isUnplayable && labOdds ? (turn === 'second' ? labOdds.second : labOdds.first) : null

  // Una mano no jugable arranca con su chip ya tocado, para mostrar de una cuánto pasa.
  useEffect(() => {
    if (isUnplayable) {
      setActiveRuleId(UNPLAYABLE_ID)
    }
  }, [isUnplayable, session.initial])

  const footer = blockedMessage ? (
    <Callout tone="warning">{blockedMessage}</Callout>
  ) : (
    <PracticeBoard
      openings={openings}
      problems={problems}
      activeId={activeRuleId}
      caseIndex={activeCase}
      unplayable={isUnplayable}
      unplayableOdds={unplayableOdds}
      nearMisses={(result?.openingNearMisses ?? []).slice(0, 2).map(({ name, notes }) => ({ name, notes }))}
      ruleOdds={labOdds?.rules[turn] ?? null}
      onToggle={handleToggleRule}
      onDismiss={dismissRule}
    />
  )

  return {
    needCards: deck.length < handSize,
    footer: started ? null : footer,
    highlighted: started ? EMPTY_IDS : highlighted,
    highlightKind: started ? null : (activeMatch?.kind ?? null),
    muted: isUnplayable && !started,
  }
}
