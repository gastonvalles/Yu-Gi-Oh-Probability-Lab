import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { MAX_SPECTATORS, type LiveDuel, type PublicRoom } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'
import { TONE, type Tone } from '../ui/tone'
import { REFRESH_MS, roomChips } from './room-chips'

/** Cuántas salas o duelos se ven antes de «Ver las N» (la pantalla se entiende en tres segundos: lo demás está a un toque). */
const SHOWN = 3

/** Lo que gira el ícono de «Actualizar», como mínimo: si el relay contesta enseguida, igual se ve que el toque hizo algo. */
const MIN_REFRESH_MS = 700

interface ArenaPanelProps {
  /** El relay: de ahí salen las salas que esperan rival y los duelos en vivo. */
  rooms: RoomsApi
  /** Hay algo en marcha (buscando o entrando): entrar a una sala se apaga. */
  busy: boolean
  /** Sin deck no se entra a jugar (mirar sí). */
  deckReady: boolean
  /** Entrar a una sala, a jugar o a mirar. */
  onJoin: (room: string, watch: boolean) => void
}

/** Hace cuánto espera una sala («hace 3 min»); la lista se vuelve a pedir sola cada 15 s, así que se va actualizando. */
function sinceLabel(createdAt: number): string {
  const min = Math.floor((Date.now() - createdAt) / 60_000)

  return min < 1 ? t('duel.arena.sinceNow') : t('duel.arena.since', { min })
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * La arena: las salas que esperan rival y los duelos públicos en vivo. Sólo lo que dice el relay (nada se inventa) y, sin respuesta, nada: es un extra, no puede romper el inicio.
 * `arena` es null hasta la primera respuesta (la pantalla muestra lugares vacíos) y `refreshing` es mientras se pide a mano con «Actualizar»; el pedido de cada 15 s es silencioso.
 */
function useArena(rooms: RoomsApi) {
  const [arena, setArena] = useState<{ rooms: PublicRoom[]; live: LiveDuel[] } | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const manual = useRef(false)

  const refresh = useCallback(() => {
    // Un toque mientras se actualiza no pide otra vez.
    if (manual.current) {
      return
    }

    manual.current = true
    setRefreshing(true)
    void Promise.all([rooms.overview(), wait(MIN_REFRESH_MS)])
      .then(([next]) => setArena(next))
      .finally(() => {
        manual.current = false
        setRefreshing(false)
      })
  }, [rooms])

  useEffect(() => {
    const load = () => void rooms.overview().then(setArena)

    load()

    const id = window.setInterval(load, REFRESH_MS)

    return () => window.clearInterval(id)
  }, [rooms])

  return { arena, refreshing, refresh }
}

/** La inicial de un jugador en una chapa del color de su lado (violeta: quien abre la sala; ámbar: el rival), como la de un canal en los replays. */
function Initial({ name, tone }: { name: string; tone: Tone }) {
  return (
    <span aria-hidden="true" className={cx('grid size-9 shrink-0 place-items-center rounded-full border text-body font-bold uppercase', TONE[tone].tint, TONE[tone].text)}>
      {Array.from(name.trim())[0] ?? '?'}
    </span>
  )
}

/** Una tarjeta de la arena (la tarjeta es el único borde): arriba quién es, en el medio cómo se juega y abajo el dato y la acción, pegados (zona del pulgar). */
function ArenaCard({ children }: { children: ReactNode }) {
  return <li className="grid gap-3 rounded-card border border-border-subtle bg-card-background p-3">{children}</li>
}

/**
 * Mientras llega la primera respuesta del relay (Gastón, 2026-10-20: «este componente no tiene un indicativo de que está cargando»): lo que se está haciendo, con el punto que late de la línea de estado, y dos
 * lugares vacíos con la forma de las tarjetas (la misma altura que tienen con datos: nada se corre cuando llegan).
 */
function ArenaLoading() {
  return (
    <div aria-busy="true" className="grid gap-3">
      <p className="m-0 flex items-center gap-2 px-1 text-micro text-muted" role="status">
        <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" />
        {t('duel.arena.loading')}
      </p>
      <ul aria-hidden="true" className="m-0 grid list-none gap-3 p-0">
        {[0, 1].map((slot) => (
          <li key={slot} className="grid gap-3 rounded-card border border-border-subtle bg-card-background p-3">
            <div className="flex items-center gap-3">
              <Skeleton radius="chip" className="size-9 shrink-0" />
              <div className="grid flex-1 gap-1.5">
                <Skeleton className="h-4 w-28 max-w-full" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="flex gap-1">
              {[0, 1, 2].map((chip) => (
                <Skeleton key={chip} radius="chip" className="h-5 w-14" />
              ))}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-8 w-20" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * La arena de Jugar, al costado del inicio en escritorio (y debajo en el celular): un contenedor con una tarjeta por sala que espera rival y por duelo en vivo. Una sala dice quién la abrió y hace cuánto,
 * sus reglas en chips y, abajo, cuántos jugadores hay y «Entrar»; un duelo en vivo, quiénes se enfrentan, y abajo cuántos lo miran y «Mirar». Se actualiza sola cada 15 segundos y a mano; mientras
 * lo pedido no llega se ve: lugares vacíos la primera vez y, al tocar «Actualizar», el ícono gira y la lista se atenúa.
 */
export function ArenaPanel({ rooms, busy, deckReady, onJoin }: ArenaPanelProps) {
  const { arena, refreshing, refresh } = useArena(rooms)
  const [expanded, setExpanded] = useState(false)
  const waiting = arena?.rooms ?? []
  const live = arena?.live ?? []
  const shownWaiting = expanded ? waiting : waiting.slice(0, SHOWN)
  const shownLive = expanded ? live : live.slice(0, SHOWN)

  return (
    <section aria-label={t('duel.arena.title')} aria-busy={arena === null || refreshing} className="grid content-start gap-3 rounded-panel bg-primary/8 p-3 min-[1101px]:sticky min-[1101px]:top-0">
      <div className="flex items-center justify-between gap-2 px-1">
        <Heading level="card" as="h2">{t('duel.arena.title')}</Heading>
        <IconButton tone="raised" size="sm" aria-label={t('duel.arena.refresh')} title={t('duel.arena.refresh')} aria-busy={refreshing} onClick={refresh}>
          <Icon name="refresh" className={cx(refreshing && 'motion-safe:animate-spin')} />
        </IconButton>
      </div>

      {arena === null ? (
        <ArenaLoading />
      ) : (
        // Al actualizar a mano la lista se queda donde está y se atenúa hasta que llega lo nuevo (con movimiento reducido, es lo único que avisa).
        <div aria-busy={refreshing} className="grid gap-3 transition-opacity duration-150 aria-busy:opacity-60">
          {waiting.length === 0 && live.length === 0 ? (
            <p className="m-0 px-1 text-micro text-soft">{t('duel.arena.empty')}</p>
          ) : (
            <>
              <p className="m-0 flex items-center gap-2 px-1 text-micro text-muted" role="status">
                <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" />
                {[waiting.length > 0 ? t('duel.arena.waiting', { count: waiting.length }) : null, live.length > 0 ? t('duel.arena.playing', { count: live.length }) : null].filter(Boolean).join(' · ')}
              </p>

              {shownWaiting.length > 0 ? (
                <ul className="stagger m-0 grid list-none gap-3 p-0">
                  {shownWaiting.map((room) => (
                    <ArenaCard key={room.code}>
                      <span className="flex items-center gap-3">
                        <Initial name={room.host} tone="brand" />
                        <span className="grid min-w-0 flex-1">
                          <span className="truncate text-body font-semibold text-foreground">{room.host}</span>
                          <span className="text-micro text-soft">{sinceLabel(room.createdAt)}</span>
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {roomChips(room).map((chip) => (
                          <Badge key={chip} size="sm">
                            {chip}
                          </Badge>
                        ))}
                      </span>
                      <span className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                        <span className="inline-flex items-center gap-1.5 text-micro text-muted">
                          <Icon name="user" size={14} />
                          {t('duel.arena.seats', { count: 1 })}
                        </span>
                        <Button variant="secondary" size="sm" aria-label={t('duel.arena.enterLabel', { name: room.host })} disabled={busy || !deckReady} onClick={() => onJoin(room.code, false)}>
                          {t('duel.arena.enter')}
                        </Button>
                      </span>
                    </ArenaCard>
                  ))}
                </ul>
              ) : null}

              {shownLive.length > 0 ? (
                <div className="grid gap-3">
                  <Heading level="card" as="h2" className="px-1">{t('duel.arena.live')}</Heading>
                  <ul className="stagger m-0 grid list-none gap-3 p-0">
                    {shownLive.map((duel) => {
                      const full = duel.watchers >= MAX_SPECTATORS

                      return (
                        <ArenaCard key={duel.code}>
                          <span className="flex items-center gap-3">
                            <span className="flex shrink-0 -space-x-2">
                              <Initial name={duel.host} tone="brand" />
                              {duel.guest ? <Initial name={duel.guest} tone="info" /> : null}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-body font-semibold text-foreground">{duel.guest ? t('duel.arena.versus', { host: duel.host, guest: duel.guest }) : t('duel.arena.isPlaying', { name: duel.host })}</span>
                          </span>
                          <span className="flex flex-wrap gap-1">
                            {roomChips(duel).map((chip) => (
                              <Badge key={chip} size="sm">
                                {chip}
                              </Badge>
                            ))}
                          </span>
                          <span className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
                            <span className="inline-flex items-center gap-1.5 text-micro text-muted">
                              <Icon name="eye" size={14} />
                              {t('duel.arena.watchers', { count: duel.watchers, max: MAX_SPECTATORS })}
                            </span>
                            <Button variant="secondary" size="sm" icon="eye" aria-label={t('duel.arena.watchLabel', { name: duel.host })} disabled={full} onClick={() => onJoin(duel.code, true)}>
                              {full ? t('duel.arena.full') : t('duel.arena.watch')}
                            </Button>
                          </span>
                        </ArenaCard>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {waiting.length > SHOWN || live.length > SHOWN ? (
                <Button variant="tertiary" size="sm" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
                  {expanded ? t('duel.arena.less') : t('duel.arena.more', { count: waiting.length + live.length })}
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}
    </section>
  )
}
