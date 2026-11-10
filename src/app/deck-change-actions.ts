import type { ThunkAction, UnknownAction } from '@reduxjs/toolkit'

import { restoreDeckBefore, snapshotDeckBefore, type DeckBeforeSnapshot } from './deck-before'
import { setDeckCards } from './deck-builder-slice'
import type { DeckBuilderState, DeckCardInstance } from './model'
import { deckCardsSignature, type BuildZones } from './saved-builds'

/**
 * Cambiar el deck del builder desde otra pantalla, con Deshacer: «Cargar B en el builder» (Comparar).
 * Son thunks: `const token = dispatch(adoptBuild(…))`. Cómo cuenta cada uno para «Tu deck de antes» lo decide `deck-before.ts`.
 */

interface DeckChangeState {
  deckBuilder: DeckBuilderState
}

type DeckThunk<Result> = ThunkAction<Result, DeckChangeState, unknown, UnknownAction>

type DeckCards = Pick<DeckBuilderState, 'deckName' | 'main' | 'extra' | 'side'>

/** Lo que hace falta para deshacer. Vive en memoria (en el aviso con «Deshacer»): no se guarda en ningún lado. */
export interface DeckChangeToken {
  kind: 'adopt'
  /** El deck como estaba (nombre y cartas). */
  previous: DeckCards
  /** «Tu deck de antes» y la sesión de cambios como estaban. */
  deckBefore: DeckBeforeSnapshot
  /** Las cartas que quedaron: si el deck cambió después, Deshacer no pisa esos cambios. */
  resultSignature: string
}

const pickDeck = ({ deckName, main, extra, side }: DeckCards): DeckCards => ({ deckName, main, extra, side })

const cloneCards = (cards: DeckCardInstance[]) => cards.map((card) => ({ ...card, roles: [...card.roles] }))

/**
 * «Cargar B en el builder»: el deck pasa a ser B (y a llamarse `name`, si viene). Cuenta como reemplazar el deck: «Tu deck de antes» pasa a
 * ser el deck que se va y se cierra la sesión de cambios. Devuelve el token para `undoDeckChange`.
 */
export function adoptBuild(build: { zones: BuildZones; name?: string }): DeckThunk<DeckChangeToken> {
  return (dispatch, getState) => {
    const previous = pickDeck(getState().deckBuilder)
    const deckBefore = snapshotDeckBefore()
    const zones = { main: cloneCards(build.zones.main), extra: cloneCards(build.zones.extra), side: cloneCards(build.zones.side) }

    dispatch(setDeckCards({ zones, deckName: build.name, as: 'replace' }))

    return { kind: 'adopt', previous, deckBefore, resultSignature: deckCardsSignature(zones) }
  }
}

/**
 * El «Deshacer»: vuelve el deck (cartas y nombre) y «Tu deck de antes» a como estaban. Devuelve `false` sin tocar nada si el deck
 * ya cambió desde entonces (no pisa lo que editaste después).
 */
export function undoDeckChange(token: DeckChangeToken): DeckThunk<boolean> {
  return (dispatch, getState) => {
    if (deckCardsSignature(getState().deckBuilder) !== token.resultSignature) {
      return false
    }

    const { deckName, main, extra, side } = token.previous

    dispatch(setDeckCards({ zones: { main, extra, side }, deckName, as: 'restore' }))
    restoreDeckBefore(token.deckBefore)

    return true
  }
}
