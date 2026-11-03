import { createContext, useContext, useId, useState } from 'react'

import { t } from '../../i18n'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { ChainOrderCompare, type ChainOrderScenario } from './ChainOrderCompare'

/**
 * Quien dibuja la cadena (`ChainNotice`) se entera de que alguien está leyendo la lección: así la pila no se va sola al terminar la cadena y la hoja no se cierra a mitad de lectura.
 * Un contexto y no una prop: ni `ChainNotice` ni `ChainSheet` cambian lo que reciben.
 */
export const ChainLessonReading = createContext<((reading: boolean) => void) | null>(null)

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`

/**
 * Los pares, escritos a mano con cartas reales y reglas verificadas (rulings oficiales: Effect Veiler, Called by the Grave y Maxx "C"). Cada par enseña un principio distinto:
 * responderle al efecto en vez de adelantarse (Veiler resuelve antes que el Efecto Rápido de Mirrorjade sólo si se encadena a él), y responder en la misma cadena y no después (Maxx "C" ya resuelto
 * sigue aplicándose aunque Called by the Grave lo destierre). Los nombres de cartas no se traducen.
 */
function lessonPairs(): Array<{ id: string; title: string; scenarios: ChainOrderScenario[] }> {
  const you = t('duel.bar.you')
  const rival = t('duel.bar.rival')
  const veiler = { name: 'Effect Veiler', art: art(97268402), effect: t('auto.chainLesson.effect.veiler') }
  const mirrorjade = { name: 'Mirrorjade the Iceblade Dragon', art: art(44146295), effect: t('auto.chainLesson.effect.mirrorjade') }
  const maxx = { name: 'Maxx "C"', art: art(23434538), effect: t('auto.chainLesson.effect.maxx') }
  const called = { name: 'Called by the Grave', art: art(24224830), effect: t('auto.chainLesson.effect.called') }

  return [
    {
      id: 'wait',
      title: t('auto.chainLesson.wait.title'),
      scenarios: [
        {
          letter: 'A',
          title: t('auto.chainLesson.wait.a'),
          good: true,
          note: t('auto.chainLesson.wait.aNote'),
          links: [
            { number: 1, who: rival, mine: false, ...mirrorjade, state: 'disabled', by: 2 },
            { number: 2, who: you, mine: true, ...veiler, state: 'solved' },
          ],
        },
        {
          letter: 'B',
          title: t('auto.chainLesson.wait.b'),
          good: false,
          note: t('auto.chainLesson.wait.bNote'),
          links: [
            { number: 1, who: you, mine: true, ...veiler, state: 'solved', outcome: { label: t('auto.chainLesson.late'), tone: 'warning' }, idle: true },
            { number: 2, who: rival, mine: false, ...mirrorjade, state: 'solved' },
          ],
        },
      ],
    },
    {
      id: 'now',
      title: t('auto.chainLesson.now.title'),
      scenarios: [
        {
          letter: 'A',
          title: t('auto.chainLesson.now.a'),
          good: true,
          note: t('auto.chainLesson.now.aNote'),
          links: [
            { number: 1, who: rival, mine: false, ...maxx, state: 'disabled', by: 2 },
            { number: 2, who: you, mine: true, ...called, state: 'solved' },
          ],
        },
        {
          letter: 'B',
          title: t('auto.chainLesson.now.b'),
          good: false,
          note: t('auto.chainLesson.now.bNote'),
          links: [{ number: 1, who: rival, mine: false, ...maxx, state: 'solved' }],
        },
      ],
    },
  ]
}

/** Lo que dice la hoja «Cómo se resuelve»: la línea clave, los pares (uno debajo del otro: Miller, no más de tres) y el cierre. */
export function ChainLessonBody() {
  const id = useId()

  return (
    <div className="grid gap-6">
      <p className="m-0 text-body font-semibold text-foreground">{t('auto.chainLesson.key')}</p>
      {lessonPairs().map((pair) => (
        <section key={pair.id} aria-labelledby={`${id}-${pair.id}`} className="grid gap-2">
          <Heading level="card" id={`${id}-${pair.id}`}>
            {pair.title}
          </Heading>
          <ChainOrderCompare scenarios={pair.scenarios} />
        </section>
      ))}
      <p className="m-0 text-body text-muted">{t('auto.chainLesson.closing')}</p>
    </div>
  )
}

/**
 * El ⓘ de la cadena (la cabeza de `ChainNotice` en escritorio y la de `ChainSheet` en el celular) y la hoja que abre, «Cómo se resuelve»: la letra chica de la cadena a un toque (guía de UX, G.3).
 * Un diálogo de la mesa (`Modal anchor="mat"`, sin velo: el duelo sigue a la vista y a su ritmo); Escape, tocar afuera o la X lo cierran y el foco vuelve al ⓘ. Una pregunta del duelo que llega
 * mientras se lee no se pierde: queda esperando debajo (las que son hoja, `Modal`, salen encima).
 */
export function ChainLesson() {
  const [open, setOpen] = useState(false)
  const reading = useContext(ChainLessonReading)
  const change = (next: boolean) => {
    setOpen(next)
    reading?.(next)
  }

  return (
    <>
      <IconButton size="lg" aria-haspopup="dialog" aria-label={t('auto.chainLesson.open')} title={t('auto.chainLesson.open')} onClick={() => change(true)}>
        <Icon name="info" />
      </IconButton>
      <Modal isOpen={open} onClose={() => change(false)} size="sheet" anchor="mat" veil={false} icon="link" title={t('auto.chainLesson.title')}>
        <ChainLessonBody />
      </Modal>
    </>
  )
}
