import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { buildDerivedDeckGroupMap } from '../../app/deck-groups'
import { useMediaQuery } from '../../app/use-media-query'
import type { CardEntry, HandPattern } from '../../types'
import { IconButton } from '../ui/IconButton'
import { RefreshIcon } from '../ui/icons'
import {
  buildPracticeDeck,
  computeRevealSteps,
  getMatchCardIds,
  getPracticeTurn,
  getPracticeVerdict,
  type PracticeHandCard,
  type PracticeReveal,
} from './practice'
import { PracticeBoard, PracticeVerdictChip } from './PracticeBoard'
import { PracticeCardFocus } from './PracticeCardFocus'
import { PracticeDeckPile } from './PracticeDeckPile'
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
  const isWide = useMediaQuery('(min-width: 820px)')
  const deck = useMemo(() => buildPracticeDeck(derivedMainCards), [derivedMainCards])
  const groupsByKey = useMemo(() => buildDerivedDeckGroupMap(derivedMainCards), [derivedMainCards])
  const blockedMessage = getBlockedMessage(props)
  const pileRef = useRef<HTMLButtonElement | null>(null)

  const reveal = useCallback(
    (cards: PracticeHandCard[], previous?: ReadonlyMap<string, number>) =>
      blockedMessage
        ? EMPTY_REVEAL
        : computeRevealSteps(cards, patterns, derivedMainCards, groupsByKey, getPracticeTurn(cards.length, handSize), previous),
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

  // Cada toque en la misma regla pasa al siguiente caso (otra forma de cumplirla); tras el último, se apaga.
  const handleToggleRule = (patternId: string) => {
    if (patternId !== activeRuleId) {
      setActiveRuleId(patternId)
      setCaseIndex(0)
      return
    }

    if (activeMatch && activeCase + 1 < activeMatch.cases.length) {
      setCaseIndex(activeCase + 1)
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
  const getDeckRect = useCallback(() => pileRef.current?.getBoundingClientRect() ?? null, [])

  if (deck.length < handSize) {
    return <p className="practice-notice">Sumá cartas al Main Deck para practicar.</p>
  }

  return (
    <section className="practice-table" aria-label="Práctica">
      <header className="practice-topbar">
        <PracticeVerdictChip verdict={verdict} />
      </header>

      <div className="practice-board">
        {blockedMessage ? (
          <p className="practice-notice">{blockedMessage}</p>
        ) : (
          <PracticeBoard
            openings={openings}
            problems={problems}
            activeId={activeRuleId}
            caseIndex={activeCase}
            onToggle={handleToggleRule}
          />
        )}
      </div>

      <div className="practice-tray" data-verdict={verdict ?? 'none'}>
        <PracticeHand
          cards={table.cards}
          slots={table.isSecond ? handSize + 1 : handSize}
          sizeSlots={handSize}
          maxCardWidth={isWide ? 164 : 124}
          fanDegrees={isWide ? 2.6 : 2.2}
          highlighted={highlighted}
          getDeckRect={getDeckRect}
          onReorder={table.reorder}
          onInspect={(card, rect) => setInspected({ card, rect })}
        />
        <div className="practice-dock">
          <IconButton size="lg" className="practice-flat-button" aria-label="Nueva mano" title="Nueva mano" onClick={table.deal}>
            <RefreshIcon />
          </IconButton>
          <PracticeDeckPile
            ref={pileRef}
            canDraw={table.canDrawSecond}
            isSecond={table.isSecond}
            shuffleKey={table.shuffleKey}
            dealt={table.dealt}
            onDraw={table.drawSecond}
          />
        </div>
      </div>

      {inspected ? (
        <PracticeCardFocus card={inspected.card} origin={inspected.rect} onClose={() => setInspected(null)} />
      ) : null}
    </section>
  )
}
