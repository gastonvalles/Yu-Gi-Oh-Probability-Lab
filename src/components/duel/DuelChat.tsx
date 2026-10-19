import { useEffect, useRef, useState } from 'react'

import { MAX_CHAT_LENGTH } from '../../app/duel-games'
import type { Duel, DuelSnapshot } from '../../app/duel-session'
import { showRivalToast } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { PLAYER_COLOR } from './player-color'
import { ReactionButtons } from './ReactionButtons'
import { isEmojiSignal, isHold, isSignal } from './signals'
import type { FeedEntry } from './use-duel-feed'

/** Lo que llega al chat sube un poco y se asienta (con movimiento reducido, aparece sin más). */
const ENTER = 'motion-safe:animate-message-in'

/** Un mensaje que es sólo emojis se ve grande, como una reacción. */
const onlyEmoji = (text: string) => /^[\p{Extended_Pictographic}\s]+$/u.test(text)

interface DuelChatProps {
  snapshot: DuelSnapshot
  myName: string
  onSend: Duel['sendChat']
  /** Ocupa todo el alto que le dan (el panel de la derecha): lo escrito crece y lo demás queda abajo. */
  fill?: boolean
  /** El registro del duelo mezclado con lo escrito, en orden (en la mesa). Sin él (la sala) sólo se ve lo escrito. */
  feed?: readonly FeedEntry[]
  /** Pediste esperar y sigue pedido (ver `useHolds`): ✋ queda apretado. */
  holding?: boolean
}

/**
 * El chat entre los dos: lo escrito (lo tuyo a la derecha) y, en la mesa, lo que hizo cada jugador entre medio (una línea con su punto de color y un separador por turno),
 * los mensajes rápidos y el campo para escribir. Sin el rival en la sala no se puede escribir.
 */
export function DuelChat({ snapshot, myName, onSend, fill = false, feed, holding = false }: DuelChatProps) {
  const { chat, peerPresent, peerName, me } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const [text, setText] = useState('')
  const rows: readonly FeedEntry[] = feed ?? chat.map((line) => ({ id: `c${line.id}`, kind: 'chat' as const, line }))
  const lastId = rows.at(-1)?.id
  const listRef = useRef<HTMLOListElement | null>(null)
  // Lo que ya estaba al abrir el chat aparece quieto; lo que llega después entra con su animación.
  const settled = useRef<ReadonlySet<string>>(new Set(rows.map((row) => row.id)))
  const enters = (id: string) => !settled.current.has(id)

  // Siempre se ve lo último.
  useEffect(() => {
    const list = listRef.current

    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [rows.length, lastId])

  const send = (message: string) => {
    onSend(message)
    setText('')
  }

  return (
    <div className={cx('grid gap-2', fill && 'h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]')}>
      <ol ref={listRef} role="log" aria-label={t('duel.chat.title', { name: rival })} className={cx('m-0 grid list-none content-start gap-1.5 overflow-y-auto p-0', fill ? 'min-h-0' : 'max-h-64 min-h-24')}>
        {rows.length === 0 ? (
          <li className="text-micro text-soft">{t('duel.chat.empty')}</li>
        ) : (
          rows.map((entry) => {
            if (entry.kind === 'turn') {
              return (
                <li key={entry.id} className={cx('flex items-center gap-2 py-1 text-micro font-semibold uppercase tracking-[0.08em] text-soft before:h-px before:flex-1 before:bg-border-subtle after:h-px after:flex-1 after:bg-border-subtle', enters(entry.id) && ENTER)}>
                  {entry.text}
                </li>
              )
            }

            if (entry.kind === 'event') {
              return (
                <li key={entry.id} data-event={entry.side} className={cx('flex items-start gap-2 text-micro text-muted', enters(entry.id) && ENTER)}>
                  <i aria-hidden="true" className={cx('mt-1.5 size-1.5 shrink-0 rounded-full', entry.side === 'mine' ? 'bg-accent' : 'bg-info')} />
                  <span className="min-w-0 break-words">{entry.text}</span>
                </li>
              )
            }

            const line = entry.line

            return (
              <li key={line.id} data-from={line.from === me ? 'mine' : 'theirs'} className={cx('max-w-[88%] break-words rounded-card px-2.5 py-1 text-body text-foreground', onlyEmoji(line.text) && 'text-display leading-tight', line.from === me ? 'ml-auto origin-bottom-right' : 'mr-auto origin-bottom-left', PLAYER_COLOR[line.from === me ? 'mine' : 'theirs'].bubble, enters(entry.id) && (onlyEmoji(line.text) ? 'motion-safe:animate-pop' : ENTER))}>
                <span className={cx('block text-micro font-semibold', PLAYER_COLOR[line.from === me ? 'mine' : 'theirs'].text)}>{line.from === me ? myName : rival}</span>
                {line.text}
              </li>
            )
          })
        )}
      </ol>

      <div className="grid gap-2">
        {/* Los dos mensajes rápidos, sólo con su emoji. */}
        <ReactionButtons set={feed ? 'chat' : 'room'} onSend={send} disabled={!peerPresent} holding={holding} />

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            send(text)
          }}
        >
          <FieldBox className="min-w-0 flex-1">
            <input aria-label={t('duel.chat.placeholder')} placeholder={t('duel.chat.placeholder')} maxLength={MAX_CHAT_LENGTH} value={text} disabled={!peerPresent} onChange={(event) => setText(event.target.value)} className={fieldInline} />
          </FieldBox>
          <IconButton type="submit" tone="primary" size="sm" aria-label={t('duel.chat.send')} title={t('duel.chat.send')} className="shrink-0 rounded-full disabled:opacity-40" disabled={!peerPresent || text.trim() === ''}>
            <Icon name="send" />
          </IconButton>
        </form>
        {peerPresent ? null : <p className="m-0 text-micro text-soft">{t('duel.chat.needRival')}</p>}
      </div>
    </div>
  )
}

/** El chat fijo a la derecha de la mesa en escritorio: siempre abierto, con su título, a todo el alto. Siempre se lee (no hay contador ni avisos aparte). */
export function DuelChatPanel({ snapshot, myName, onSend, feed, holding }: Omit<DuelChatProps, 'fill'>) {
  useChatUnread(snapshot, true)

  return (
    <section aria-label={t('duel.chat.title', { name: snapshot.peerName ?? t('duel.bar.rival') })} className="flex h-full min-h-0 flex-col gap-2">
      <Heading level="card">{t('duel.chat.title', { name: snapshot.peerName ?? t('duel.bar.rival') })}</Heading>
      <div className="min-h-0 flex-1">
        <DuelChat snapshot={snapshot} myName={myName} onSend={onSend} feed={feed} holding={holding} fill />
      </div>
    </section>
  )
}

/**
 * Cuántos mensajes del rival todavía no leíste (los que llegaron con el chat cerrado) y, mientras está cerrado, un aviso por cada uno que llega: así
 * se entera de "¿respondés?" sin tener el chat abierto. Lo que ya estaba escrito al abrir la pantalla no se avisa.
 */
export function useChatUnread(snapshot: DuelSnapshot, open: boolean): number {
  const { chat, me, peerName } = snapshot
  const last = chat.at(-1)?.id ?? 0
  const seen = useRef(last)
  const [read, setRead] = useState(last)
  const rival = peerName ?? t('duel.bar.rival')

  useEffect(() => {
    if (open) {
      seen.current = last
      setRead(last)
      return
    }

    for (const line of chat) {
      // Las reacciones del rival (🤔 y 👍) salen como un mensaje más; ✋ no: tiene su propio cartel.
      if (line.id > seen.current && line.from !== me && (!isSignal(line.text) || (isEmojiSignal(line.text) && !isHold(line.text)))) {
        showRivalToast(rival, line.text)
      }
    }

    seen.current = Math.max(seen.current, last)
  }, [chat, last, me, open, rival])

  return chat.filter((line) => line.id > read && line.from !== me && !isSignal(line.text)).length
}
