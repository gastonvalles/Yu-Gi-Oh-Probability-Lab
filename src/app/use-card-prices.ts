import { useCallback, useSyncExternalStore } from 'react'

import { PAGE_SIZE, fetchCardPriceSets, fetchSetPrices, type PrintingPrice, type SetMatch } from './card-prices'

export type CardPricesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | {
      status: 'ready'
      /** Los precios de las expansiones ya traídas, las más nuevas primero. */
      prices: PrintingPrice[]
      /** Día (AAAA-MM-DD) en que se bajaron los precios. */
      updated: string
      /** Cuántas expansiones tiene la carta en total y cuántas faltan traer. */
      total: number
      remaining: number
      loadingMore: boolean
      /** Falló el último "ver más": el botón pasa a ser un reintento. */
      moreFailed: boolean
      /** Trae las siguientes `PAGE_SIZE` expansiones (no hace nada si ya está trayendo o no quedan). */
      loadMore: () => void
      /** Trae todas las que faltan: para buscar entre todas las impresiones. */
      loadAll: () => void
    }

const IDLE: CardPricesState = { status: 'idle' }
const LOADING: CardPricesState = { status: 'loading' }
const ERROR: CardPricesState = { status: 'error' }

interface Entry {
  listeners: Set<() => void>
  snapshot: CardPricesState
  /** Los sets de la carta y los precios de los ya traídos (uno por set, en el mismo orden). */
  sets: SetMatch[]
  updated: string
  loaded: PrintingPrice[][]
  loadingMore: boolean
  moreFailed: boolean
}

/**
 * Lo ya consultado en esta sesión, por carta: volver a abrir la misma carta no vuelve a pedir nada, y dos pantallas
 * que piden la misma a la vez comparten el pedido y lo que ya trajeron.
 */
const entries = new Map<number, Entry>()

function publish(cardId: number, entry: Entry, snapshot: CardPricesState = readySnapshot(cardId, entry)) {
  entry.snapshot = snapshot
  entry.listeners.forEach((listener) => listener())
}

function readySnapshot(cardId: number, entry: Entry): CardPricesState {
  return {
    status: 'ready',
    prices: entry.loaded.flat(),
    updated: entry.updated,
    total: entry.sets.length,
    remaining: entry.sets.length - entry.loaded.length,
    loadingMore: entry.loadingMore,
    moreFailed: entry.moreFailed,
    loadMore: () => loadMore(cardId, PAGE_SIZE),
    loadAll: () => loadMore(cardId, Infinity),
  }
}

/** Baja los archivos de las próximas `count` expansiones (en paralelo) y los suma a lo traído. */
async function loadPage(entry: Entry, count: number): Promise<void> {
  const next = entry.sets.slice(entry.loaded.length, entry.loaded.length + count)

  entry.loaded.push(...(await Promise.all(next.map((set) => fetchSetPrices(set)))))
}

function start(cardId: number, entry: Entry) {
  entry.sets = []
  entry.loaded = []
  publish(cardId, entry, LOADING)

  fetchCardPriceSets(cardId)
    .then(async ({ sets, updated }) => {
      entry.sets = sets
      entry.updated = updated
      await loadPage(entry, PAGE_SIZE)
      publish(cardId, entry)
    })
    .catch(() => publish(cardId, entry, ERROR))
}

function loadMore(cardId: number, count: number) {
  const entry = entries.get(cardId)

  if (!entry || entry.snapshot.status !== 'ready' || entry.loadingMore || entry.loaded.length >= entry.sets.length) {
    return
  }

  entry.loadingMore = true
  entry.moreFailed = false
  publish(cardId, entry)

  loadPage(entry, count)
    .catch(() => {
      entry.moreFailed = true
    })
    .finally(() => {
      entry.loadingMore = false
      publish(cardId, entry)
    })
}

/** Se pide al abrirse el modal; si la vez anterior falló, se vuelve a intentar. */
function subscribeTo(cardId: number, listener: () => void): () => void {
  let entry = entries.get(cardId)

  if (!entry) {
    entry = { listeners: new Set(), snapshot: LOADING, sets: [], updated: '', loaded: [], loadingMore: false, moreFailed: false }
    entries.set(cardId, entry)
    start(cardId, entry)
  } else if (entry.snapshot.status === 'error') {
    start(cardId, entry)
  }

  const { listeners } = entry

  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}

/**
 * Los precios de TCGplayer de la carta (los archivos que baja el sync diario), de a `PAGE_SIZE` expansiones: las más
 * nuevas al abrir y, con `loadMore`, las siguientes. Sin id no pide nada.
 */
export function useCardPrices(cardId: number | null): CardPricesState {
  // Estable por carta: si cambiara en cada render, suscribirse de nuevo reintentaría los pedidos fallidos en bucle.
  const subscribe = useCallback((listener: () => void) => (cardId === null ? () => {} : subscribeTo(cardId, listener)), [cardId])

  return useSyncExternalStore(
    subscribe,
    () => (cardId === null ? IDLE : (entries.get(cardId)?.snapshot ?? LOADING)),
    () => IDLE,
  )
}
