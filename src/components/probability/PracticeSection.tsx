import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { requestLabOdds } from '../../app/lab-odds-client'
import { reactMascot } from '../../app/mascot'
import type { LabOdds } from '../../app/lab-odds'
import type { CardEntry, HandPattern } from '../../types'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { IconButton } from '../ui/IconButton'
import { Icon } from '../ui/Icon'
import {
  buildPracticeDeck,
  computeRevealSteps,
  getMatchCardIds,
  getPracticeTurn,
  getPracticeVerdict,
  type PracticeHandCard,
  type PracticeReveal,
} from './practice'
import { PracticeBoard, PracticeVerdictChip, UNPLAYABLE_ID } from './PracticeBoard'
import { PracticeCardFocus } from './PracticeCardFocus'
import { PracticeDeckPile } from './PracticeDeckPile'
import { PRACTICE_PALETTE, VERDICT_COLOR } from './practice-styles'
import { PracticeHand } from './PracticeHand'
import { usePracticeTable } from './use-practice-table'

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

const EMPTY_IDS: ReadonlySet<string> = new Set()
const EMPTY_STEPS: ReadonlyMap<string, number> = new Map()

const EMPTY_REVEAL: PracticeReveal = {
  result: { matches: [], openingMatches: [], problemMatches: [], openingNearMisses: [] },
  steps: EMPTY_STEPS,
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function getBlockedMessage(props: PracticeSectionProps): string | null {
  if (!props.hasCompletedClassification) {
    return 'Clasificá tus cartas para ver salidas y problemas.'
  }

  return props.reviewPendingPatternCount > 0 ? 'Hay reglas heredadas por revisar.' : null
}

export function PracticeSection(props: PracticeSectionProps) {
  const { handSize, derivedMainCards, patterns } = props
  const deck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const blockedMessage = getBlockedMessage(props)
  const pileRef = useRef<HTMLButtonElement | null>(null)

  const reveal = useCallback(
    (cards: PracticeHandCard[], previous?: ReadonlyMap<string, number>) =>
      blockedMessage
        ? EMPTY_REVEAL
        : computeRevealSteps(cards, patterns, derivedMainCards, groupsByKey, getPracticeTurn(cards.length, handSize), previous, handSize),
    [blockedMessage, patterns, derivedMainCards, groupsByKey, handSize],
  )
  const table = usePracticeTable({ deck, handSize, reveal, reducedMotion: prefersReducedMotion() })

  const [activeRuleId, setActiveRuleId] = useState<string | null>(null)
  const [inspected, setInspected] = useState<{ card: PracticeHandCard; rect: DOMRect } | null>(null)
  const [caseIndex, setCaseIndex] = useState(0)

  const isShown = (patternId: string) => (table.steps?.get(patternId) ?? Number.POSITIVE_INFINITY) <= table.dealt
  const openings = (table.result?.openingMatches ?? []).filter((match) => isShown(match.patternId))
  const problems = (table.result?.problemMatches ?? []).filter((match) => isShown(match.patternId))
  const shown = [...openings, ...problems]
  const activeMatch = shown.find((match) => match.patternId === activeRuleId) ?? null
  const activeCase = activeMatch ? Math.min(caseIndex, Math.max(0, activeMatch.cases.length - 1)) : 0

  useEffect(() => {
    setActiveRuleId(null)
    setCaseIndex(0)
    setInspected(null)
  }, [table.shuffleKey])

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

  const highlighted = useMemo<ReadonlySet<string>>(
    () => (activeMatch ? new Set(getMatchCardIds(activeMatch, table.allCards, activeCase)) : EMPTY_IDS),
    [activeMatch, activeCase, table.allCards],
  )

  const verdict =
    table.isDealt && !blockedMessage && table.result
      ? getPracticeVerdict(table.result.openingMatches.length, table.result.problemMatches.length)
      : null

  // Cupsy festeja la mano limpia y se frustra con un problema: una vez por mano (o por robo).
  useEffect(() => {
    const result = table.result

    if (!table.isDealt || blockedMessage || !result) {
      return
    }

    const kind = getPracticeVerdict(result.openingMatches.length, result.problemMatches.length)

    if (kind === 'clean') {
      reactMascot('jumping', 2500)
    } else if (kind === 'with-problem') {
      reactMascot('failed', 2500)
    }
  }, [table.result, table.isDealt, blockedMessage])
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
  const unplayableOdds = isUnplayable && lab ? (table.isSecond ? lab.second : lab.first) : null

  // Una mano no jugable arranca con su chip ya tocado, para mostrar de una cuánto pasa.
  useEffect(() => {
    if (isUnplayable) {
      setActiveRuleId(UNPLAYABLE_ID)
    }
  }, [isUnplayable, table.shuffleKey])

  const getDeckRect = useCallback(() => pileRef.current?.getBoundingClientRect() ?? null, [])

  if (deck.length < handSize) {
    return <Callout tone="info" className="m-4">Sumá cartas al Main Deck para practicar.</Callout>
  }

  return (
    <section
      className={`flex h-full min-w-0 flex-col overflow-hidden [background:radial-gradient(120%_60%_at_50%_0%,rgb(var(--primary-rgb)/0.16),transparent_70%),rgb(var(--background-rgb))] ${PRACTICE_PALETTE}`}
      aria-label="Práctica"
    >
      {/* Veredicto centrado; a la derecha queda la X del modal. */}
      <header className="flex min-h-12 flex-none items-center justify-center px-4 pt-3 min-[820px]:pt-4">
        <PracticeVerdictChip verdict={verdict} />
      </header>

      {/* Salidas y problemas: aparecen en el centro de la mesa. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-2">
        {blockedMessage ? (
          <Callout tone="warning" className="my-auto">{blockedMessage}</Callout>
        ) : (
          <PracticeBoard
            openings={openings}
            problems={problems}
            activeId={activeRuleId}
            caseIndex={activeCase}
            unplayableOdds={unplayableOdds}
            ruleOdds={lab?.rules[table.isSecond ? 'second' : 'first'] ?? null}
            onToggle={handleToggleRule}
          />
        )}
      </div>

      {/* Abajo: la mano centrada y, debajo, la recarga a la izquierda y el mazo a la derecha (en desktop, en la misma fila). */}
      <div
        className={cx(
          'relative z-2 grid flex-none gap-1 px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom,0px))] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-0 before:-top-20 before:-z-1 before:opacity-0 before:transition-opacity before:[background:radial-gradient(80%_100%_at_50%_100%,color-mix(in_srgb,var(--verdict-color)_24%,transparent),transparent_72%)] motion-reduce:before:transition-none min-[820px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[820px]:items-end min-[820px]:gap-3 min-[820px]:px-[1.4rem] min-[820px]:pb-4',
          verdict && ['before:opacity-100', VERDICT_COLOR[verdict]],
        )}
      >
        <PracticeHand
          cards={table.cards}
          slots={table.isSecond ? handSize + 1 : handSize}
          sizeSlots={handSize}
          maxCardWidth={124}
          fanDegrees={2.2}
          highlighted={highlighted}
          highlightKind={activeMatch?.kind ?? null}
          muted={isUnplayable}
          getDeckRect={getDeckRect}
          onReorder={table.reorder}
          onInspect={(card, rect) => setInspected({ card, rect })}
          className="min-[820px]:col-start-2 min-[820px]:row-start-1"
        />
        <div className="flex items-end justify-between pb-[0.55rem] pl-0 pr-1 min-[820px]:contents">
          <IconButton
            tone="flat"
            size="md"
            aria-label="Nueva mano"
            title="Nueva mano"
            className="min-[820px]:col-start-1 min-[820px]:row-start-1 min-[820px]:mb-2"
            onClick={table.deal}
          >
            <Icon name="refresh" />
          </IconButton>
          <PracticeDeckPile
            ref={pileRef}
            canDraw={table.canDrawSecond}
            isSecond={table.isSecond}
            shuffleKey={table.shuffleKey}
            dealt={table.dealt}
            onDraw={table.drawSecond}
            className="min-[820px]:col-start-3 min-[820px]:row-start-1 min-[820px]:mb-[1.4rem]"
          />
        </div>
      </div>

      {inspected ? (
        <PracticeCardFocus card={inspected.card} origin={inspected.rect} onClose={() => setInspected(null)} />
      ) : null}
    </section>
  )
}
