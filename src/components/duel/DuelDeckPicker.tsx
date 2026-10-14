import { useEffect, useRef, useState } from 'react'

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

const STORED_KEY = 'ygo-lab:duel-deck'
/** Cuántas cartas se piden por consulta a YGOPRODeck. */
const FETCH_CHUNK = 50

type Status = 'idle' | 'loading' | 'invalid' | 'failed'

interface DuelDeckPickerProps {
  /** El deck armado en el builder: con el que se juega mientras no se elija otro. */
  builder: DuelDeck
  /** Cartas que hacen falta en el Main para repartir la mano. */
  minMain: number
  imported: DuelDeck | null
  onImport: (deck: DuelDeck | null) => void
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORED_KEY)
  } catch {
    return null
  }
}

function writeStored(text: string | null) {
  try {
    if (text === null) localStorage.removeItem(STORED_KEY)
    else localStorage.setItem(STORED_KEY, text)
  } catch {
    // Sin almacenamiento no se recuerda.
  }
}

/**
 * Elegir con qué deck se duela: el del builder, o uno que se pega (un enlace `ydke://` o un `.ydk`). Es lo que deja jugar desde un celular
 * que no tiene un deck armado: se pasa el enlace de un dispositivo al otro. El último deck pegado se recuerda y, si el builder está vacío, se usa solo.
 */
export function DuelDeckPicker({ builder, minMain, imported, onImport }: DuelDeckPickerProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [unknown, setUnknown] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const tried = useRef(false)

  const load = async (raw: string, remember: boolean) => {
    const parsed = parseDuelDeck(raw)

    if (!parsed) {
      setStatus('invalid')
      return
    }

    setStatus('loading')

    try {
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

      setUnknown(mainIds.length + extraIds.length - cardsById.size)
      onImport({ name: t('duel.deck.importedName'), mainIds, extraIds, cardsById })
      if (remember) writeStored(raw.trim())
      setStatus('idle')
      setOpen(false)
    } catch {
      setStatus('failed')
    }
  }

  // Sin deck armado (un celular que nunca abrió el builder), el último deck pegado se vuelve a usar solo.
  useEffect(() => {
    const stored = readStored()

    if (tried.current || stored === null || builder.mainIds.length >= minMain) {
      return
    }

    tried.current = true
    void load(stored, false)
    // Es sólo al abrir la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const back = () => {
    writeStored(null)
    setUnknown(0)
    setStatus('idle')
    onImport(null)
  }

  return (
    <section className="grid gap-2" aria-label={t('duel.deck.title')}>
      <Heading level="card">{t('duel.deck.title')}</Heading>
      <p className="m-0 text-body text-foreground">
        {imported
          ? t('duel.deck.imported', { main: imported.mainIds.length, extra: imported.extraIds.length })
          : t('duel.deck.builder', { name: builder.name, count: builder.mainIds.length })}
      </p>
      {imported && unknown > 0 ? <p className="m-0 text-micro text-soft">{t('duel.deck.unknown', { count: unknown })}</p> : null}

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
          <FieldBox>
            <textarea
              aria-label={t('duel.deck.placeholder')}
              placeholder={t('duel.deck.placeholder')}
              rows={4}
              value={text}
              onChange={(event) => {
                setText(event.target.value)
                setStatus('idle')
              }}
              className="min-h-24 w-full resize-y bg-transparent px-1 py-1.5 text-body text-foreground outline-none placeholder:text-soft"
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
            <Button variant="primary" size="sm" disabled={status === 'loading' || text.trim() === ''} onClick={() => void load(text, true)}>
              {t('duel.deck.use')}
            </Button>
            <Button variant="secondary" size="sm" disabled={status === 'loading'} onClick={() => fileRef.current?.click()}>
              {t('duel.deck.file')}
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => setOpen(false)}>
              {t('common.cancel')}
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
