import { ROOM_CODE_PATTERN, parsePublicRoomInfo, type PublicRoom, type PublicRoomInfo } from './duel-relay-rules'

/**
 * Las salas públicas desde la página: leer la lista del relay (para el lobby), anotar la propia y bajarla. Todo lo que llega del relay es dato de otro:
 * se revisa antes de mostrarlo. Una sala pública es sólo una entrada en esa lista; jugar sigue siendo por el código, como siempre.
 */

export interface RoomsApi {
  /** Las salas abiertas ahora, las más nuevas primero; vacío si el relay no contesta (la lista es un extra, no puede romper el lobby). */
  list(): Promise<PublicRoom[]>
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

export function createRoomsApi(relayUrl: string, fetchImpl: typeof fetch = (...args) => fetch(...args)): RoomsApi {
  const base = httpUrlOf(relayUrl)
  // El JSON va como texto plano: así el navegador no hace una consulta previa y también se puede mandar al cerrar la pestaña.
  const post = (path: string, code: string, body: unknown) =>
    fetchImpl(`${base}${path}?room=${code}`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), keepalive: true })

  return {
    async list() {
      try {
        const response = await fetchImpl(`${base}/rooms`)

        return response.ok ? parsePublicRooms(await response.json()) : []
      } catch {
        return []
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
