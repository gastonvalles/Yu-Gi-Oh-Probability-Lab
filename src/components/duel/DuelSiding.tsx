import { useEffect, useMemo, useRef, useState } from 'react'

import { formatClock } from '../../app/life-calculator'
import { canGoTo, moveCopy, renumberDeck, SIDE_ZONES, sidingProblems, type SideCard, type SideDeck, type SideZone, type SidingProblem } from '../../app/duel-siding'
import type { DeckFormat } from '../../types'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Heading } from '../ui/Heading'

/** Cuánto tiempo hay para hacer siding: pasado el tiempo, el duelo sigue con el deck como esté (o con el de antes, si no cumple). */
export const SIDING_MS = 3 * 60 * 1000

interface DuelSidingProps {
  /** El deck con que se jugó el duelo que terminó: de acá se parte. */
  deck: SideDeck
  cardsById: ReadonlyMap<string, SideCard>
  format: DeckFormat
  rival: string
  /** Ya toqué «Listo»: se espera al rival y no se cambia más. */
  locked: boolean
  rivalReady: boolean
  /** El deck con los cambios, con ids de copia nuevos, y los datos de sus cartas. */
  onReady: (deck: SideDeck, cardsById: Map<string, SideCard>) => void
}

const ZONE_NAME: Record<SideZone, () => string> = {
  main: () => t('duel.siding.zone.main'),
  extra: () => t('duel.siding.zone.extra'),
  side: () => t('duel.siding.zone.side'),
}

function problemText(problem: SidingProblem): string {
  switch (problem.kind) {
    case 'main-small':
      return t('duel.siding.problem.mainSmall', { count: problem.count, min: problem.min })
    case 'main-big':
      return t('duel.siding.problem.mainBig', { count: problem.count, max: problem.max })
    case 'extra-big':
      return t('duel.siding.problem.extraBig', { count: problem.count, max: problem.max })
    case 'side-big':
      return t('duel.siding.problem.sideBig', { count: problem.count, max: problem.max })
    case 'format':
      return problem.text
  }
}

interface Group {
  key: string
  name: string
  card: SideCard | undefined
  /** Las posiciones de sus copias en la zona. */
  indexes: number[]
}

/** Las copias de una zona agrupadas por carta, en el orden en que aparecen. */
function groupsOf(ids: readonly string[], cardsById: ReadonlyMap<string, SideCard>): Group[] {
  const groups = new Map<string, Group>()

  ids.forEach((id, index) => {
    const card = cardsById.get(id)
    const name = card?.name ?? id
    const group = groups.get(name) ?? { key: name, name, card, indexes: [] }

    group.indexes.push(index)
    groups.set(name, group)
  })

  return [...groups.values()]
}

/**
 * El siding de un Match: tu Main, tu Extra y tu Side, y un botón por carta para pasarla de una zona a otra (como en el builder). El rival no ve nada.
 * Con el deck bien, «Listo» lo deja guardado; cuando los dos están listos empieza el siguiente duelo con los cambios.
 */
export function DuelSiding({ deck, cardsById, format, rival, locked, rivalReady, onReady }: DuelSidingProps) {
  const [lists, setLists] = useState<SideDeck>(deck)
  const problems = useMemo(() => sidingProblems(lists, { main: deck.main.length }, cardsById, format), [lists, deck.main.length, cardsById, format])
  const [deadline] = useState(() => Date.now() + SIDING_MS)
  const [left, setLeft] = useState(SIDING_MS)
  const done = useRef(false)
  // Lo que se confirma si se acaba el tiempo: los cambios, si el deck cumple; si no, el deck con que se jugó.
  const onTime = useRef<SideDeck>(deck)

  useEffect(() => {
    onTime.current = problems.length === 0 ? lists : deck
  }, [problems, lists, deck])

  useEffect(() => {
    if (locked) {
      return
    }

    const id = window.setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now())

      setLeft(remaining)

      if (remaining === 0 && !done.current) {
        done.current = true
        window.clearInterval(id)

        const fresh = renumberDeck(onTime.current, cardsById)

        onReady(fresh.deck, fresh.cardsById)
      }
    }, 500)

    return () => window.clearInterval(id)
  }, [locked, deadline, cardsById, onReady])

  return (
    <>
      <div className="grid gap-1">
        <Heading level="section">{t('duel.siding.title')}</Heading>
        <p className="m-0 text-body text-muted">{t('duel.siding.intro')}</p>
        {locked ? null : (
          <p className={left < 30_000 ? 'm-0 text-body font-semibold tabular-nums text-danger-soft' : 'm-0 text-body font-semibold tabular-nums text-foreground'} data-testid="siding-clock">
            {t('duel.siding.time', { time: formatClock(left) })}
          </p>
        )}
      </div>

      {problems.length > 0 ? (
        <Callout tone="warning" icon="alert">
          <span className="grid gap-1">
            {problems.map((problem) => (
              <span key={problemText(problem)}>{problemText(problem)}</span>
            ))}
          </span>
        </Callout>
      ) : null}

      {SIDE_ZONES.map((zone) => {
        const groups = groupsOf(lists[zone], cardsById)

        return (
          <section key={zone} aria-label={ZONE_NAME[zone]()} className="grid gap-2">
            <Heading level="card">{`${ZONE_NAME[zone]()} · ${lists[zone].length}`}</Heading>
            {groups.length === 0 ? (
              <p className="m-0 text-micro text-soft">{t('duel.siding.empty')}</p>
            ) : (
              <ul className="m-0 grid list-none gap-1 p-0">
                {groups.map((group) => (
                  <li key={group.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border-subtle py-1.5">
                    <span className="min-w-0 flex-1 text-body text-foreground">
                      {group.name}
                      <span className="ml-2 tabular-nums text-muted">{`×${group.indexes.length}`}</span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {SIDE_ZONES.filter((target) => target !== zone && canGoTo(group.card, target)).map((target) => (
                        <Button
                          key={target}
                          variant="tertiary"
                          size="sm"
                          disabled={locked}
                          aria-label={t('duel.siding.moveLabel', { name: group.name, zone: ZONE_NAME[target]() })}
                          onClick={() => setLists((current) => moveCopy(current, zone, group.indexes[group.indexes.length - 1]!, target))}
                        >
                          {t('duel.siding.move', { zone: ZONE_NAME[target]() })}
                        </Button>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )
      })}

      <div className="grid gap-1.5">
        <Button
          variant="primary"
          icon="check"
          disabled={locked || problems.length > 0}
          onClick={() => {
            done.current = true

            const fresh = renumberDeck(lists, cardsById)

            onReady(fresh.deck, fresh.cardsById)
          }}
        >
          {t('duel.siding.ready')}
        </Button>
        {locked ? <p className="m-0 text-micro text-soft" role="status">{t('duel.siding.waiting', { name: rival })}</p> : rivalReady ? <p className="m-0 text-micro text-soft" role="status">{t('duel.siding.rivalReady', { name: rival })}</p> : null}
      </div>
    </>
  )
}
