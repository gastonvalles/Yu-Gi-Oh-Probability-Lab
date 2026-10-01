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
/** Cuánto brillan las cartas que completan una regla recién aparecida. */
const FLASH_MS = 1000

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
  const [flash, setFlash] = useState<ReadonlySet<string>>(EMPTY_IDS)
  const seenRules = useRef<ReadonlySet<string>>(EMPTY_IDS)

  const isShown = (patternId: string) => (table.steps?.get(patternId) ?? Number.POSITIVE_INFINITY) <= table.dealt
  const openings = (table.result?.openingMatches ?? []).filter((match) => isShown(match.patternId))
  const problems = (table.result?.problemMatches ?? []).filter((match) => isShown(match.patternId))
  const shown = [...openings, ...problems]
  const shownKey = shown.map((match) => match.patternId).join('|')
  const shownRef = useRef(shown)
  shownRef.current = shown
  const handRef = useRef(table.allCards)
  handRef.current = table.allCards

  useEffect(() => {
    setActiveRuleId(null)
  }, [table.shuffleKey])

  // Cuando aparece una regla, las cartas que la completan brillan un instante.
  useEffect(() => {
    const current = new Set(shownKey ? shownKey.split('|') : [])
    const fresh = shownRef.current.filter((match) => !seenRules.current.has(match.patternId))
    seenRules.current = current

    if (fresh.length === 0) {
      return
    }

    setFlash(new Set(fresh.flatMap((match) => getMatchCardIds(match, handRef.current))))
    const timer = window.setTimeout(() => setFlash(EMPTY_IDS), FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [shownKey])

  const highlighted = useMemo<ReadonlySet<string>>(() => {
    const active = shown.find((match) => match.patternId === activeRuleId)
    return active ? new Set(getMatchCardIds(active, table.allCards)) : flash
    // `shown` se deriva de table + dealt, que ya están en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRuleId, flash, shownKey, table.allCards])

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
        <IconButton size="lg" aria-label="Nueva mano" title="Nueva mano" onClick={table.deal}>
          <RefreshIcon />
        </IconButton>
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
            onToggle={(patternId) => setActiveRuleId((current) => (current === patternId ? null : patternId))}
          />
        )}
      </div>

      <div className="practice-tray" data-verdict={verdict ?? 'none'}>
        <div className="practice-tray-top">
          <PracticeDeckPile
            ref={pileRef}
            canDraw={table.canDrawSecond}
            isSecond={table.isSecond}
            shuffleKey={table.shuffleKey}
            dealt={table.dealt}
            onDraw={table.drawSecond}
          />
        </div>
        <PracticeHand
          cards={table.cards}
          slots={table.isSecond ? handSize + 1 : handSize}
          sizeSlots={handSize}
          maxCardWidth={isWide ? 150 : 112}
          fanDegrees={isWide ? 2.6 : 2.2}
          highlighted={highlighted}
          getDeckRect={getDeckRect}
          onReorder={table.reorder}
        />
      </div>
    </section>
  )
}
