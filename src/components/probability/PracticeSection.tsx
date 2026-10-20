import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { requestLabOdds } from '../../app/lab-odds-client'
import { reactMascot } from '../../app/mascot'
import { DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import type { LabOdds } from '../../app/lab-odds'
import type { MatAction, MatState } from '../../app/practice-mat'
import type { SavedCombo } from '../../app/saved-combos'
import type { MatSession } from '../../app/use-mat-session'
import { t } from '../../i18n'
import type { CardEntry, HandPattern } from '../../types'
import { DuelCardDock, type CardPeek } from '../duel/DuelCardDock'
import { Callout } from '../ui/Callout'
import {
  buildPracticeDeck,
  cardIdOfDrawId,
  evaluatePracticeHand,
  getMatchCardIds,
  getPracticeTurn,
  getPracticeVerdict,
  type PracticeHandCard,
} from './practice'
import { PracticeBoard, UNPLAYABLE_ID } from './PracticeBoard'
import { PracticeMat, type MatCard } from './PracticeMat'

interface PracticeSectionProps {
  handSize: number
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
  hasCompletedClassification: boolean
  missingOriginCount: number
  missingRoleCount: number
  pendingReviewCount: number
  reviewPendingPatternCount: number
  session: MatSession
  state: MatState
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onDispatch: (action: MatAction) => void
  onUndo: () => void
  onSeek: (step: number) => void
  onLoadCombo: (combo: SavedCombo) => void
  onNewHand: () => void
}

const EMPTY_IDS: ReadonlySet<string> = new Set()

function getBlockedMessage(props: PracticeSectionProps): string | null {
  if (!props.hasCompletedClassification) {
    return t('practice.section.classify')
  }

  return props.reviewPendingPatternCount > 0 ? t('practice.section.legacyRules') : null
}

/**
 * La práctica: la mesa con la mano ya robada y, debajo de la mano, las salidas y problemas de la mano
 * inicial (la mano con la que se abrió, más la carta robada si se fue 2º). El veredicto no se muestra
 * (Gastón lo consideró innecesario): sólo guía a la mascota y al chip "Mano no jugable". Los chips están
 * mientras se mira la mano de apertura: con la primera jugada desaparecen (y vuelven si se deshace).
 */
export function PracticeSection(props: PracticeSectionProps) {
  const { handSize, derivedMainCards, patterns, session } = props
  const deck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const blockedMessage = getBlockedMessage(props)
  // El detalle fijo de la izquierda (como en un duelo): la última carta que se tocó, siempre a la vista en pantallas anchas.
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  const [peek, setPeek] = useState<CardPeek | null>(null)

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
  const [lab, setLab] = useState<LabOdds | null>(null)
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
      setLab(null)
      return
    }

    let cancelled = false
    const { derivedMainCards: cards, patterns: rules } = labInputsRef.current

    void requestLabOdds(labKey, { cards, patterns: rules, handSize }).then((odds) => {
      if (!cancelled) {
        setLab(odds)
      }
    })

    return () => {
      cancelled = true
    }
  }, [blockedMessage, deck.length, handSize, labKey])

  const isUnplayable = verdict === 'no-opening'
  const unplayableOdds = isUnplayable && lab ? (turn === 'second' ? lab.second : lab.first) : null

  // Una mano no jugable arranca con su chip ya tocado, para mostrar de una cuánto pasa.
  useEffect(() => {
    if (isUnplayable) {
      setActiveRuleId(UNPLAYABLE_ID)
    }
  }, [isUnplayable, session.initial])

  if (deck.length < handSize) {
    return <Callout tone="info" className="m-4">{t('practice.section.needCards')}</Callout>
  }

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
      ruleOdds={lab?.rules[turn] ?? null}
      onToggle={handleToggleRule}
      onDismiss={dismissRule}
    />
  )

  return (
    <PracticeMat
      session={session}
      state={props.state}
      cardsById={props.cardsById}
      deckName={props.deckName}
      onDispatch={props.onDispatch}
      onUndo={props.onUndo}
      onSeek={props.onSeek}
      onLoadCombo={props.onLoadCombo}
      onNewHand={props.onNewHand}
      // Se entra a la práctica desde «Entrenar solo» (el inicio de Jugar): la flecha de la barra vuelve ahí.
      onExit={() => {
        window.location.hash = '#duel'
      }}
      footer={started ? null : footer}
      highlighted={started ? EMPTY_IDS : highlighted}
      highlightKind={started ? null : (activeMatch?.kind ?? null)}
      muted={isUnplayable && !started}
      detail={wide ? <DuelCardDock peek={peek} /> : undefined}
      onPeek={setPeek}
    />
  )
}
