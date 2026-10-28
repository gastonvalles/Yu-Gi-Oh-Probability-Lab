import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { MAX_SPECTATORS, type LiveDuel, type PublicRoom } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListRow'
import { SectionHeader } from '../ui/SectionHeader'
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

/** El inicio de una fila: la inicial de quien abrió la sala (y la del rival, si lo hay). */
const initial = (name: string) => (Array.from(name.trim())[0] ?? '?').toUpperCase()

/** Lo de abajo del nombre, separado por puntos medios: cada dato en su propio texto. */
const dotted = (parts: string[]) =>
  parts.map((part, index) => (
    <Fragment key={part + index}>
      {index > 0 ? ' · ' : null}
      <span>{part}</span>
    </Fragment>
  ))

/** La línea de estado de la arena, con el punto que late: qué se está haciendo o qué hay. */
function ArenaStatus({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 flex items-center gap-2 text-micro text-muted" role="status">
      <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse" />
      {children}
    </p>
  )
}

/**
 * La arena de Jugar, al costado del inicio en escritorio (y debajo en el celular): el título afuera con «Actualizar» a la derecha y, abajo, una tarjeta con una fila por sala que espera rival
 * (quién la abrió, sus reglas y hace cuánto; «Entrar») y otra por duelo en vivo (quiénes se enfrentan, cuántos lo miran y sus reglas; «Mirar»). Se actualiza sola cada 15 segundos y a mano;
 * mientras lo pedido no llega se ve: filas vacías la primera vez (Gastón, 2026-10-20: «este componente no tiene un indicativo de que está cargando») y, al tocar «Actualizar», el ícono gira y la
 * lista se atenúa.
 */
export function ArenaPanel({ rooms, busy, deckReady, onJoin }: ArenaPanelProps) {
  const { arena, refreshing, refresh } = useArena(rooms)
  const [expanded, setExpanded] = useState(false)
  const waiting = arena?.rooms ?? []
  const live = arena?.live ?? []
  const shownWaiting = expanded ? waiting : waiting.slice(0, SHOWN)
  const shownLive = expanded ? live : live.slice(0, SHOWN)

  return (
    <section aria-label={t('duel.arena.title')} aria-busy={arena === null || refreshing} className="grid min-w-0 content-start gap-3 min-[1101px]:sticky min-[1101px]:top-0">
      <SectionHeader
        title={t('duel.arena.title')}
        link={{
          label: (
            <>
              <Icon name="refresh" size={16} className={cx('mr-1', refreshing && 'motion-safe:animate-spin')} />
              {t('duel.arena.refresh')}
            </>
          ),
          onClick: refresh,
          chevron: false,
        }}
      />

      {arena === null ? (
        <div className="grid gap-3">
          <ArenaStatus>{t('duel.arena.loading')}</ArenaStatus>
          <ListGroup loading />
        </div>
      ) : (
        // Al actualizar a mano la lista se queda donde está y se atenúa hasta que llega lo nuevo (con movimiento reducido, es lo único que avisa).
        <div aria-busy={refreshing} className="grid gap-3 transition-opacity duration-150 aria-busy:opacity-60">
          {waiting.length === 0 && live.length === 0 ? (
            <ListGroup empty={<p className="m-0 text-body text-muted">{t('duel.arena.empty')}</p>} />
          ) : (
            <>
              <ArenaStatus>
                {[waiting.length > 0 ? t('duel.arena.waiting', { count: waiting.length }) : null, live.length > 0 ? t('duel.arena.playing', { count: live.length }) : null].filter(Boolean).join(' · ')}
              </ArenaStatus>

              {shownWaiting.length > 0 ? (
                <ListGroup>
                  {shownWaiting.map((room) => (
                    <ListRow
                      key={room.code}
                      title={room.host}
                      initials={initial(room.host)}
                      tone="brand"
                      subtitle={dotted([...roomChips(room), sinceLabel(room.createdAt)])}
                      end={
                        <Button variant="secondary" size="sm" aria-label={t('duel.arena.enterLabel', { name: room.host })} disabled={busy || !deckReady} onClick={() => onJoin(room.code, false)}>
                          {t('duel.arena.enter')}
                        </Button>
                      }
                    />
                  ))}
                </ListGroup>
              ) : null}

              {shownLive.length > 0 ? (
                <div className="grid gap-2">
                  <Heading level="card" as="h3">{t('duel.arena.live')}</Heading>
                  <ListGroup>
                    {shownLive.map((duel) => {
                      const full = duel.watchers >= MAX_SPECTATORS

                      return (
                        <ListRow
                          key={duel.code}
                          title={duel.guest ? t('duel.arena.versus', { host: duel.host, guest: duel.guest }) : t('duel.arena.isPlaying', { name: duel.host })}
                          initials={initial(duel.host) + (duel.guest ? initial(duel.guest) : '')}
                          subtitle={dotted([t('duel.arena.watchers', { count: duel.watchers, max: MAX_SPECTATORS }), ...roomChips(duel)])}
                          end={
                            <Button variant="secondary" size="sm" icon="eye" aria-label={t('duel.arena.watchLabel', { name: duel.host })} disabled={full} onClick={() => onJoin(duel.code, true)}>
                              {full ? t('duel.arena.full') : t('duel.arena.watch')}
                            </Button>
                          }
                        />
                      )
                    })}
                  </ListGroup>
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
