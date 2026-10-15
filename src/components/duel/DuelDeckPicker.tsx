import { useRef, useState } from 'react'

import { parseDerivedCardId } from '../../app/calculator-state'
import { duelCardIds, parseDuelDeck } from '../../app/duel-deck'
import { t } from '../../i18n'
import { fetchCardsByIds, type ApiCardSearchResult } from '../../ygoprodeck'
import { cardIdOfDrawId } from '../probability/practice'
import type { MatCard } from '../probability/PracticeMat'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { FieldBox } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'

/** Con qué se juega: las copias del Main y del Extra (`card-123-2`) y cómo se llama cada una. */
export interface DuelDeck {
  name: string
  mainIds: string[]
  extraIds: string[]
  cardsById: ReadonlyMap<string, MatCard>
}

export const STORED_DECK_KEY = 'ygo-lab:duel-deck'
/** Cuántas cartas se piden por consulta a YGOPRODeck. */
const FETCH_CHUNK = 50

type Status = 'idle' | 'loading' | 'invalid' | 'failed'

interface DuelDeckPickerProps {
  /** El deck armado en el builder: con el que se juega mientras no se elija otro. */
  builder: DuelDeck
  imported: DuelDeck | null
  onImport: (deck: DuelDeck | null) => void
}

export function readStoredDeck(): string | null {
  try {
    return localStorage.getItem(STORED_DECK_KEY)
  } catch {
    return null
  }
}

function writeStored(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(STORED_DECK_KEY)
    else localStorage.setItem(STORED_DECK_KEY, text)
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}

/**
 * El deck de un texto pegado o de un archivo, con sus cartas ya buscadas; `null` si no es un deck. Falla si no se pueden buscar las cartas (sin red).
 * Se usa también al abrir la pantalla, para recuperar el último deck pegado.
 */
export async function loadDuelDeck(raw: string): Promise<DuelDeck | null> {
  const parsed = parseDuelDeck(raw)

  if (!parsed) {
    return null
  }

  const wanted = [...new Set([...parsed.main, ...parsed.extra])]
  const chunks = Array.from({ length: Math.ceil(wanted.length / FETCH_CHUNK) }, (_, index) => wanted.slice(index * FETCH_CHUNK, (index + 1) * FETCH_CHUNK))
  const found = new Map<number, ApiCardSearchResult>((await Promise.all(chunks.map((chunk) => fetchCardsByIds(chunk)))).flat().map((card) => [card.ygoprodeckId, card]))
  const mainIds = duelCardIds(parsed.main)
  const extraIds = duelCardIds(parsed.extra)
  const cardsById = new Map<string, MatCard>()

  for (const id of [...mainIds, ...extraIds]) {
    const card = found.get(parseDerivedCardId(cardIdOfDrawId(id)) ?? -1)
    if (card) cardsById.set(id, { name: card.name, apiCard: card })
  }

  return { name: t('duel.deck.importedName'), mainIds, extraIds, cardsById }
}

/**
 * Elegir con qué deck se duela: el del builder, o uno que se pega (un enlace `ydke://` o un `.ydk`). Es lo que deja jugar desde un celular
 * que no tiene un deck armado: se pasa el enlace de un dispositivo al otro. El último deck pegado se recuerda y, si el builder está vacío, se usa solo.
 */
export function DuelDeckPicker({ builder, imported, onImport }: DuelDeckPickerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async (raw: string, remember: boolean) => {
    setStatus('loading')

    try {
      const deck = await loadDuelDeck(raw)

      if (!deck) {
        setStatus('invalid')
        return
      }

      onImport(deck)
      if (remember) writeStored(raw.trim())
      setStatus('idle')
      setOpen(false)
    } catch {
      setStatus('failed')
    }
  }

  const back = () => {
    writeStored(null)
    setStatus('idle')
    onImport(null)
  }

  // Las cartas del deck pegado que la búsqueda no reconoció (se juegan igual, sin nombre).
  const unknown = imported ? imported.mainIds.length + imported.extraIds.length - imported.cardsById.size : 0

  return (
    <section className="grid gap-2" aria-label={t('duel.deck.title')}>
      <Heading level="card">{t('duel.deck.title')}</Heading>
      <p className="m-0 text-body text-foreground">
        {imported
          ? t('duel.deck.imported', { main: imported.mainIds.length, extra: imported.extraIds.length })
          : t('duel.deck.builder', { name: builder.name, count: builder.mainIds.length })}
      </p>
      {unknown > 0 ? <p className="m-0 text-micro text-soft">{t('duel.deck.unknown', { count: unknown })}</p> : null}

      <div className="flex flex-wrap gap-2">
        {open ? null : (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {t('duel.deck.useOther')}
          </Button>
        )}
        {imported ? (
          <Button variant="tertiary" size="sm" onClick={back}>
            {t('duel.deck.back')}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="grid gap-2">
          <p className="m-0 text-micro text-soft">{t('duel.deck.hint')}</p>
          <FieldBox multiline>
            <textarea
              aria-label={t('duel.deck.placeholder')}
              placeholder={t('duel.deck.placeholder')}
              rows={4}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setStatus('idle')
              }}
              className="min-h-24 w-full resize-y bg-transparent p-0 text-body text-foreground outline-none placeholder:text-soft"
            />
          </FieldBox>
          <input
            ref={fileRef}
            type="file"
            accept=".ydk,.txt,text/plain"
            className="sr-only"
            tabIndex={-1}
            aria-label={t('duel.deck.file')}
            onChange={(event) => {
              const file = event.target.files?.[0]

              if (file) {
                void file.text().then((content) => {
                  setText(content)
                  void load(content, true)
                })
              }

              event.target.value = ''
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="secondary" size="sm" disabled={status === 'loading'} onClick={() => fileRef.current?.click()}>
              {t('duel.deck.file')}
            </Button>
            <Button variant="primary" size="sm" disabled={status === 'loading' || text.trim() === ''} onClick={() => void load(text, true)}>
              {t('duel.deck.use')}
            </Button>
          </div>
        </div>
      ) : null}

      {status === 'loading' ? <p className="m-0 text-micro text-soft" role="status">{t('duel.deck.loading')}</p> : null}
      {status === 'invalid' ? <Callout tone="danger">{t('duel.deck.invalid')}</Callout> : null}
      {status === 'failed' ? <Callout tone="warning">{t('duel.deck.failed')}</Callout> : null}
    </section>
  )
}
