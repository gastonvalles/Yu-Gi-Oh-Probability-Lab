/// <reference lib="webworker" />
import { detectLocale, loadLocale } from '../i18n'
import type { CardEntry, HandPattern, TurnView } from '../types'
import { computeLabOdds, type LabOddsInput } from './lab-odds'
import { calculateLabView } from './probability-lab'

export interface OddsRequest extends LabOddsInput {
  id: number
  kind?: 'odds'
}

/** Pide la enumeración exacta de un solo turno (el cliente arma el resultado del Lab con los dos). */
export interface ViewRequest {
  id: number
  kind: 'view'
  cards: CardEntry[]
  patterns: HandPattern[]
  handSize: number
  view: Exclude<TurnView, 'average'>
}

// Los textos que arma el cálculo salen en el idioma de la página (el worker lo recibe por su nombre): el español viene con el worker; el inglés se baja antes de contestar el primer pedido.
const localeReady = loadLocale(detectLocale()).catch(() => {})

// El cálculo exacto es pesado: corre acá para no trabar la pantalla.
self.onmessage = async (event: MessageEvent<OddsRequest | ViewRequest>) => {
  await localeReady

  const request = event.data

  if (request.kind === 'view') {
    self.postMessage({ id: request.id, output: calculateLabView(request.cards, request.patterns, request.handSize, request.view) })
    return
  }

  const { id, kind: _kind, ...input } = request
  const odds = computeLabOdds(input)

  self.postMessage({
    id,
    odds: odds && { first: odds.first, second: odds.second, clean: odds.clean, rules: { first: [...odds.rules.first], second: [...odds.rules.second] } },
  })
}
