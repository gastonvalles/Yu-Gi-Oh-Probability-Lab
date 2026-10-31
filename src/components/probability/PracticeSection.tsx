import { useState } from 'react'

import type { CardTextHighlight } from '../../app/card-text'
import { DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import type { MatAction, MatState } from '../../app/practice-mat'
import type { SharedCombo } from '../../app/combo-share'
import type { SavedCombo } from '../../app/saved-combos'
import type { MatSession } from '../../app/use-mat-session'
import { t } from '../../i18n'
import type { CardEntry, HandPattern } from '../../types'
import { DuelCardDock } from '../duel/DuelCardDock'
import { useDockPeek } from '../duel/use-dock-peek'
import { Callout } from '../ui/Callout'
import { PracticeMat, type MatCard } from './PracticeMat'
import { usePracticeChips } from './use-practice-chips'

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
  /** «Seguir en automático» (`PracticeMat`): sólo con la beta del duelo automático encendida. */
  onAuto?: (state: MatState) => void
  /** Un combo abierto desde un enlace (`PracticeMat`). */
  shared?: { combo: SharedCombo; onSaved: () => void; onClose: () => void } | undefined
}

/**
 * La práctica: la mesa con la mano ya robada y, debajo de la mano, las salidas y problemas de la mano inicial (`usePracticeChips`, los mismos que en «Jugar solo automático»).
 */
export function PracticeSection(props: PracticeSectionProps) {
  const chips = usePracticeChips(props, props.session)
  // El detalle fijo de la izquierda (como en un duelo): la carta a la que se le pasa el mouse, o la que se tocó (queda fija hasta un click afuera o en otra), siempre a la vista en pantallas anchas.
  const wide = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  const dock = useDockPeek()
  // El pedazo del texto de esa carta que se resalta mientras se elige uno de sus efectos en el menú.
  const [highlight, setHighlight] = useState<CardTextHighlight | null>(null)

  // Repasar un combo (uno compartido, sin deck armado) no necesita cartas en el deck.
  if (chips.needCards && !props.session.replay) {
    return <Callout tone="info" className="m-4">{t('practice.section.needCards')}</Callout>
  }

  return (
    <PracticeMat
      session={props.session}
      state={props.state}
      cardsById={props.cardsById}
      deckName={props.deckName}
      onDispatch={props.onDispatch}
      onUndo={props.onUndo}
      onSeek={props.onSeek}
      onLoadCombo={props.onLoadCombo}
      onNewHand={props.onNewHand}
      {...(props.onAuto ? { onAuto: props.onAuto } : {})}
      shared={props.shared}
      // Se entra a la mesa desde Solo: la flecha de la barra vuelve ahí.
      onExit={() => {
        window.location.hash = '#solo'
      }}
      footer={chips.footer}
      footerSummary={chips.summary}
      highlighted={chips.highlighted}
      highlightKind={chips.highlightKind}
      muted={chips.muted}
      detail={wide ? <DuelCardDock peek={dock.shown} highlight={highlight} /> : undefined}
      onPeek={dock.lock}
      onHover={dock.hover}
      onHighlight={setHighlight}
    />
  )
}
