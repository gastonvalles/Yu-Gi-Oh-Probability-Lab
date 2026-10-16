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
import { isSignal } from './signals'

/** Un mensaje que es sólo emojis se ve grande, como una reacción. */
const onlyEmoji = (text: string) => /^[\p{Extended_Pictographic}\s]+$/u.test(text)

interface DuelChatProps {
  snapshot: DuelSnapshot
  myName: string
  onSend: Duel['sendChat']
  /** Ocupa todo el alto que le dan (el panel de la derecha): lo escrito crece y lo demás queda abajo. */
  fill?: boolean
}

/** El chat entre los dos: lo escrito (lo tuyo a la derecha), los mensajes rápidos y el campo para escribir. Sin el rival en la sala no se puede escribir. */
export function DuelChat({ snapshot, myName, onSend, fill = false }: DuelChatProps) {
  const { chat, peerPresent, peerName, me } = snapshot
  const rival = peerName ?? t('duel.bar.rival')
  const [text, setText] = useState('')
  const listRef = useRef<HTMLOListElement | null>(null)

  // Siempre se ve lo último.
  useEffect(() => {
    const list = listRef.current

    if (list) {
      list.scrollTop = list.scrollHeight
    }
  }, [chat.length])

  const send = (message: string) => {
    onSend(message)
    setText('')
  }

  return (
    <div className={cx('grid gap-2', fill && 'h-full min-h-0 grid-rows-[minmax(0,1fr)_auto]')}>
      <ol ref={listRef} role="log" aria-label={t('duel.chat.title', { name: rival })} className={cx('m-0 grid list-none content-start gap-1.5 overflow-y-auto p-0', fill ? 'min-h-0' : 'max-h-64 min-h-24')}>
        {chat.length === 0 ? (
          <li className="text-micro text-soft">{t('duel.chat.empty')}</li>
        ) : (
          chat.map((line) => (
            <li key={line.id} data-from={line.from === me ? 'mine' : 'theirs'} className={cx('max-w-[88%] break-words rounded-card px-2.5 py-1 text-body text-foreground', onlyEmoji(line.text) && 'text-title leading-tight', line.from === me ? 'ml-auto' : 'mr-auto', PLAYER_COLOR[line.from === me ? 'mine' : 'theirs'].bubble)}>
              <span className={cx('block text-micro font-semibold', PLAYER_COLOR[line.from === me ? 'mine' : 'theirs'].text)}>{line.from === me ? myName : rival}</span>
              {line.text}
            </li>
          ))
        )}
      </ol>

      <div className="grid gap-2">
        {/* Los dos mensajes rápidos, sólo con su emoji. */}
        <ReactionButtons onSend={send} disabled={!peerPresent} />

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
export function DuelChatPanel({ snapshot, myName, onSend }: Omit<DuelChatProps, 'fill'>) {
  useChatUnread(snapshot, true)

  return (
    <section aria-label={t('duel.chat.title', { name: snapshot.peerName ?? t('duel.bar.rival') })} className="flex h-full min-h-0 flex-col gap-2">
      <Heading level="card">{t('duel.chat.title', { name: snapshot.peerName ?? t('duel.bar.rival') })}</Heading>
      <div className="min-h-0 flex-1">
        <DuelChat snapshot={snapshot} myName={myName} onSend={onSend} fill />
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
      if (line.id > seen.current && line.from !== me && !isSignal(line.text)) {
        showRivalToast(rival, line.text)
      }
    }

    seen.current = Math.max(seen.current, last)
  }, [chat, last, me, open, rival])

  return chat.filter((line) => line.id > read && line.from !== me && !isSignal(line.text)).length
}
