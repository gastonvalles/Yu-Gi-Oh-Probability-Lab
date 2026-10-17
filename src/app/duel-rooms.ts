import { ROOM_CODE_PATTERN, parsePublicRoomInfo, parseWatchers, type LiveDuel, type PublicRoom, type PublicRoomInfo } from './duel-relay-rules'

/**
 * Las salas públicas desde la página: leer la lista del relay (para el lobby), anotar la propia y bajarla. Todo lo que llega del relay es dato de otro:
 * se revisa antes de mostrarlo. Una sala pública es sólo una entrada en esa lista; jugar sigue siendo por el código, como siempre.
 */

export interface RoomsApi {
  /** Las salas abiertas ahora, las más nuevas primero; vacío si el relay no contesta (la lista es un extra, no puede romper el lobby). */
  list(): Promise<PublicRoom[]>
  /** Lo mismo y, además, los duelos públicos que se están jugando (con cuántos los miran); sin `live` (un relay de antes, o sin respuesta) no hay duelos en vivo que mostrar. */
  overview(): Promise<{ rooms: PublicRoom[]; live: LiveDuel[] }>
  /**
   * El anfitrión de una sala pública avisa que su duelo está en vivo y cuántos lo miran (se repite cada minuto). Devuelve si el relay lo registró: con uno de antes, o sin red, no, y entonces
   * la sala se baja de la lista (como siempre al llegar el rival) en vez de quedar anotada como si esperara.
   */
  live(code: string, info: PublicRoomInfo, watchers: number, token: string): Promise<boolean>
  /** Anota la sala propia. `token` prueba que quien la baja es quien la anotó. Devuelve si quedó anotada. */
  register(code: string, info: PublicRoomInfo, token: string): Promise<boolean>
  /** Baja la sala propia (mejor esfuerzo: si no llega, vence sola a los 30 minutos). */
  unlist(code: string, token: string): void
}

/** La dirección web (`https://…`) de un relay al que se llega por `wss://…`. */
export const httpUrlOf = (relayUrl: string) => relayUrl.replace(/^ws(s?):/, 'http$1:').replace(/\/+$/, '')

/** Las salas de lo que contestó el relay, sólo las que están bien formadas. */
export function parsePublicRooms(value: unknown): PublicRoom[] {
  const rooms = typeof value === 'object' && value !== null ? (value as { rooms?: unknown }).rooms : undefined

  if (!Array.isArray(rooms)) {
    return []
  }

  return rooms.flatMap((entry: unknown) => {
    const raw = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : null
    const info = raw ? parsePublicRoomInfo(raw) : null

    return raw && info && typeof raw.code === 'string' && ROOM_CODE_PATTERN.test(raw.code) && typeof raw.createdAt === 'number' ? [{ ...info, code: raw.code, createdAt: raw.createdAt }] : []
  })
}

/** Los duelos en vivo de lo que contestó el relay, sólo los bien formados (un cliente de antes no los pedía: sin `live`, ninguno). */
export function parseLiveDuels(value: unknown): LiveDuel[] {
  const live = typeof value === 'object' && value !== null ? (value as { live?: unknown }).live : undefined

  if (!Array.isArray(live)) {
    return []
  }

  return live.flatMap((entry: unknown) => {
    const raw = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : null
    const info = raw ? parsePublicRoomInfo(raw) : null
    const watchers = raw ? parseWatchers(raw.watchers) : null

    return raw && info && watchers !== null && typeof raw.code === 'string' && ROOM_CODE_PATTERN.test(raw.code) && typeof raw.since === 'number' ? [{ ...info, code: raw.code, watchers, since: raw.since }] : []
  })
}

export function createRoomsApi(relayUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): RoomsApi {
  const base = httpUrlOf(relayUrl)
  // El JSON va como texto plano: así el navegador no hace una consulta previa y también se puede mandar al cerrar la pestaña.
  const post = (path: string, code: string, body: unknown) =>
    fetchImpl(`${base}${path}?room=${code}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), keepalive: true })

  const overview = async () => {
    try {
      const response = await fetchImpl(`${base}/rooms`)

      if (!response.ok) {
        return { rooms: [], live: [] }
      }

      const body: unknown = await response.json()

      return { rooms: parsePublicRooms(body), live: parseLiveDuels(body) }
    } catch {
      return { rooms: [], live: [] }
    }
  }

  return {
    async list() {
      return (await overview()).rooms
    },
    overview,
    async live(code, info, watchers, token) {
      try {
        const response = await post('/rooms/live', code, { token, info, watchers })

        // Un relay de antes contesta 200 a cualquier ruta que no conoce (con un texto, no con `{ result: 'ok' }`): sólo cuenta que lo registró de verdad.
        return response.ok && ((await response.json()) as { result?: unknown }).result === 'ok'
      } catch {
        return false
      }
    },
    async register(code, info, token) {
      try {
        return (await post('/rooms', code, { token, info })).ok
      } catch {
        return false
      }
    },
    unlist(code, token) {
      void post('/rooms/close', code, { token }).catch(() => undefined)
    },
  }
}
