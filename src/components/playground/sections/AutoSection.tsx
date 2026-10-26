import { useState, type ReactNode } from 'react'

import type { ChainRowState } from '../../../app/auto/chain-feed'
import { DuelRailsContext } from '../../../app/duel-rails'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../../app/use-media-query'
import { Presence } from '../../../app/use-presence'
import { t } from '../../../i18n'
import { AskOptions, type AskOption } from '../../auto/AskOptions'
import { AskPrompt } from '../../auto/AskPrompt'
import { AutoBar, type AutoChainMode, type AutoPlaceMode } from '../../auto/AutoBar'
import { CardPicker, PickBand, type PickCard } from '../../auto/CardPicker'
import { ChainNotice } from '../../auto/ChainNotice'
import { CounterSheet } from '../../auto/CounterSheet'
import { SortSheet } from '../../auto/SortSheet'
import { DuelLogTicker, type LaneNotice } from '../../duel/DuelBar'
import { MatScene } from '../../probability/MatArena'
import { MAT_BAR_ROW, MatBarActions, MatExitButton } from '../../probability/MatBarActions'
import { CardMenu } from '../../probability/MatDialogs'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Segmented } from '../../ui/Segmented'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`
const ASH = { name: 'Ash Blossom & Joyous Spring', art: art(14558127) }
const PONIX = { name: 'Legendary Fire King Ponix', art: art(90681088) }

/** Cartas de muestra de lugares distintos (lo que no entra en una sola pila); la de Aluber, todavía sin arte (el esqueleto quieto). */
const MIXED: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: art(68468459), place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', place: 'Cementerio' },
  { key: 'c', name: 'Branded Fusion', art: art(44362883), place: 'Deck' },
  { key: 'd', name: 'Mirrorjade the Iceblade Dragon', art: art(44146295), place: 'Extra Deck' },
  { key: 'e', name: 'Effect Veiler', art: art(97268402), place: 'Mano del rival' },
  { key: 'f', name: 'Infinite Impermanence', art: art(10045474), place: 'Destierro' },
]
/** Cinco del mismo lugar (el Cementerio): la banda dice el lugar una vez, en la pestaña. */
const GRAVE: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: art(68468459) },
  { key: 'b', name: 'Legendary Fire King Ponix', art: art(90681088) },
  { key: 'c', name: 'Mirrorjade the Iceblade Dragon', art: art(44146295) },
  { key: 'd', name: 'Ash Blossom & Joyous Spring', art: art(14558127) },
  { key: 'e', name: 'Effect Veiler', art: art(97268402) },
]
const DECK_TOP: PickCard[] = [
  { key: 'x', name: 'Called by the Grave', art: art(24224830) },
  { key: 'y', name: 'Ash Blossom & Joyous Spring', art: art(14558127) },
  { key: 'z', name: 'Effect Veiler', art: art(97268402) },
]
const ATTACK_COSTS: PickCard[] = [
  { key: 'elf', name: 'Dark Elf', art: art(21417692), place: 'Zona de monstruos' },
  { key: 'toll', name: 'Toll', art: art(82003859), place: 'Zona de Mágicas y Trampas' },
]
const TYPES = ['Aqua', 'Beast', 'Beast-Warrior', 'Creator God', 'Cyberse', 'Dinosaur', 'Divine-Beast', 'Dragon', 'Fairy', 'Fiend', 'Fish', 'Illusion', 'Insect', 'Machine', 'Plant', 'Psychic', 'Pyro', 'Reptile', 'Rock', 'Sea Serpent', 'Spellcaster', 'Thunder', 'Warrior', 'Winged Beast', 'Wyrm', 'Zombie']

/** Las cuatro hojas de `AskOptions` de la muestra, con su forma de contestar. */
const OPTION_SAMPLES: Array<{ id: string; title: string; note: string; open: string; kicker?: string; mode: 'one' | { count: number }; options: () => AskOption[] }> = [
  {
    id: 'option',
    title: 'Opciones · una opción',
    note: 'select_option: un botón por opción, de a dos por fila (los de la hoja de una carta); un texto largo va solo en su fila. Un toque contesta. La que no se puede elegir se ve apagada, se enfoca y se lee.',
    open: 'Abrir «Elegí una opción»',
    kicker: 'Branded Fusion',
    mode: 'one',
    options: () => [
      { id: '0', label: 'Fusion Summon 1 Fusion Monster from your Extra Deck' },
      { id: '1', label: 'Shuffle 1 "Fallen of Albaz" into the Deck', disabled: true },
    ],
  },
  {
    id: 'position',
    title: 'Opciones · la posición',
    note: 'select_position: sólo las posiciones que deja el núcleo, con las palabras del menú de la mesa. Hay que contestar: sin X y Escape no la cierra.',
    open: 'Abrir «Elegí la posición»',
    kicker: 'Fallen of Albaz',
    mode: 'one',
    options: () => [
      { id: 'atk', label: t('practice.menu.attack') },
      { id: 'def', label: t('practice.menu.defense') },
      { id: 'set', label: t('practice.menu.turnFaceDown') },
    ],
  },
  {
    id: 'number',
    title: 'Opciones · un número',
    note: 'announce_number: un botón por número, de a dos por fila.',
    open: 'Abrir «Declará un número»',
    kicker: 'Lefty Driver',
    mode: 'one',
    options: () => ['1', '2', '3', '4', '5', '6', '7', '8'].map((n) => ({ id: n, label: n })),
  },
  {
    id: 'types',
    title: 'Opciones · Tipos',
    note: 'announce_race con count 2: pastillas que bajan de renglón (se ven los 26 Tipos juntos); al llegar a dos, las demás se apagan. «Declarar» se enciende con las dos; el pie dice cuántas van. Con count 1, tocar otra cambia la elegida.',
    open: 'Abrir «Declará 2 Tipos»',
    kicker: 'DNA Surgery',
    mode: { count: 2 },
    options: () => TYPES.map((name) => ({ id: name, label: name })),
  },
]

/** Las piezas del duelo automático (beta): la pregunta del núcleo en el medio de la mesa, las hojas de opciones, elegir y ordenar cartas, y la barra de arriba. Todo entra por props. */
export function AutoSection() {
  const [answer, setAnswer] = useState('—')

  return (
    <SpecimenGrid min="22rem">
      <PromptSample kind="card" onAnswer={setAnswer} />
      <PromptSample kind="context" onAnswer={setAnswer} />
      <PromptSample kind="plain" onAnswer={setAnswer} />

      {OPTION_SAMPLES.map((sample) => (
        <OptionsSample key={sample.id} sample={sample} onAnswer={setAnswer} />
      ))}
      <EffectsSample onAnswer={setAnswer} />

      <PickerSample title="Elegir cartas · de 1 a 2, cancelable" note="CardPicker con min 1 y max 2, de lugares distintos (cada una dice de dónde es) y una que todavía no tiene arte (el esqueleto quieto). Aro ámbar y número de orden; Mayús+clic, el tramo; nunca más de dos. «Cancelar» y Escape, porque la pregunta se puede cancelar. Flechas, Inicio y Fin recorren las cartas; Espacio elige." min={1} max={2} cancelable onAnswer={setAnswer} />
      <PickerSample title="Elegir cartas · una sola" note="Con max 1 el primer toque contesta, sin «Listo» (como en la mesa). No se puede cancelar: sin X ni pie." min={1} max={1} cancelable={false} onAnswer={setAnswer} />
      <PickerSample title="Declarar una carta · con buscador" note="Con 13 cartas o más (declarar una carta ofrece el deck entero y lo visto), un buscador por nombre arriba de la grilla; sin coincidencias, lo dice. Un toque declara." min={1} max={1} cancelable={false} many onAnswer={setAnswer} />

      <BandSample max={2} onAnswer={setAnswer} />
      <BandSample max={1} onAnswer={setAnswer} />
      <ForcedSample onAnswer={setAnswer} />

      <SortSample onAnswer={setAnswer} />
      <CounterSample onAnswer={setAnswer} />

      <Specimen title="Lo que contestó la última muestra" note="Cada hoja y cada pregunta de arriba le pasan lo elegido a quien la abrió; acá se ve qué devolvió.">
        <Tag>{answer}</Tag>
      </Specimen>

      <ChainSample />
      <BarActionsSample />
      <BarSample title="AutoBar · el núcleo resolviendo" note={<>La barra de la práctica (la flecha y los íconos de <Tag>MatBarActions</Tag>) con lo propio del automático: el engranaje, el turno y, en escritorio, las vidas (en el celular van abajo, en la botonera de la mesa). La línea del registro dice que el núcleo está resolviendo, con el punto que late; a los 1,5 s aparece «Cancelar» (lo que es rápido no parpadea). En el celular el aviso se apoya sobre la línea del registro; en escritorio, centrado debajo de la barra. Archivo: <Tag>auto/AutoBar.tsx</Tag></>} lane="thinking" />
      <BarSample title="AutoBar · la cadena" note={<>Un aviso que se contesta (<Tag>LaneNotice</Tag> <Tag>ask</Tag>): la cadena dicha por el núcleo y «No responder». Va enmarcado en ámbar. El engranaje abre «Más opciones» (respuestas, la casilla, «Handtraps del rival» con «Cambiar handtraps» y, encendidas, «A ciegas» —en la del núcleo resolviendo están apagadas y dice que el rival no juega—, «Reiniciar el mismo duelo» y «Jugar en modo manual»). Probá «Laterales»: así va en una ventana ancha.</>} lane="chain" />
    </SpecimenGrid>
  )
}

/** La pregunta de sí o no sobre una mesa de muestra: la capa la centra sin mover nada (como `duel.prompt` en la mesa). Contestada, sale y la muestra la vuelve a preguntar con el botón. */
function PromptSample({ kind, onAnswer }: { kind: 'card' | 'context' | 'plain'; onAnswer: (answer: string) => void }) {
  const [shown, setShown] = useState(true)
  const withCard = kind !== 'plain'
  const yes = withCard ? t('practice.menu.activateEffect') : 'Pagar 1000 LP'
  const no = withCard ? t('auto.ask.skipEffect') : t('auto.ask.no')
  const reply = (label: string) => {
    setShown(false)
    onAnswer(label)
  }
  const manual = t('auto.bar.manual')

  return (
    <Specimen
      title={kind === 'card' ? 'Pregunta del núcleo · con la carta' : kind === 'context' ? 'Pregunta del núcleo · efecto que se dispara' : 'Pregunta del núcleo · sin carta'}
      layout="column"
      note={
        kind === 'card' ? (
          <>select_effectyn: la carta chica a la izquierda del texto. En la mesa va en la ranura <Tag>duel.prompt</Tag>: centrada, sin fondo, deja pasar los toques y no mueve nada. El foco va a la principal; Escape no la cierra. Archivo: <Tag>auto/AskPrompt.tsx</Tag></>
        ) : kind === 'context' ? (
          <>select_effectyn con desc 221: <Tag>kicker</Tag>, qué pasó y dónde está la carta en el texto (<Tag>effectAskText</Tag> de <Tag>ask-ui.ts</Tag>), la pestaña <Tag>place</Tag>, la frase del efecto tal cual (<Tag>effect</Tag>: lo que hace, resaltado) y el atajo <Tag>manual</Tag> a la izquierda. Con frase, la mesa le da más ancho.</>
        ) : (
          <>select_yesno: sólo el texto. Los botones dicen qué hacen («Hacerlo», o lo que diga el núcleo: «Pagar 1000 LP»), nunca «Sí» ni «No».</>
        )
      }
    >
      <div className={cx('relative isolate overflow-hidden rounded-card border border-border-subtle', kind === 'context' ? 'h-96' : 'h-64')}>
        <MatScene className="absolute inset-0 -z-10" />
        <Presence>
          {shown ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
              <div className="pointer-events-auto w-[min(24rem,100%)] has-data-leaving:pointer-events-none has-data-prompt-row:w-[min(34rem,100%)]">
                {kind === 'context' ? (
                  <AskPrompt
                    kicker={t('auto.ask.kicker')}
                    text={t('auto.ask.afterOwn', { event: t('auto.ask.event.special'), card: PONIX.name, place: t('auto.ask.at.mz') })}
                    card={PONIX}
                    place={t('practice.mat.field')}
                    effect={{ when: 'If this card is Normal or Special Summoned', what: 'You can add 1 "Fire King" Spell/Trap from your Deck to your hand.' }}
                    manual={{ label: manual, onSelect: () => reply(manual) }}
                    yes={{ label: yes, onSelect: () => reply(yes) }}
                    no={{ label: no, onSelect: () => reply(no) }}
                  />
                ) : (
                  <AskPrompt text={withCard ? t('auto.ask.effect', { card: ASH.name }) : '¿Pagás 1000 LP para activar Skill Drain?'} card={withCard ? ASH : undefined} yes={{ label: yes, onSelect: () => reply(yes) }} no={{ label: no, onSelect: () => reply(no) }} />
                )}
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <Button variant="secondary" size="sm" className="w-fit" icon="refresh" disabled={shown} onClick={() => setShown(true)}>
        Volver a preguntar
      </Button>
    </Specimen>
  )
}

function OptionsSample({ sample, onAnswer }: { sample: (typeof OPTION_SAMPLES)[number]; onAnswer: (answer: string) => void }) {
  const [open, setOpen] = useState(false)
  const title = sample.id === 'position' ? t('auto.options.position') : sample.id === 'number' ? t('auto.options.number') : sample.id === 'types' ? t('auto.options.race', { count: 2 }) : t('auto.options.option')

  return (
    <Specimen title={sample.title} note={<>{sample.note} Archivo: <Tag>auto/AskOptions.tsx</Tag></>}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {sample.open}
      </Button>
      <Presence>
        {open ? (
          <AskOptions
            title={title}
            kicker={sample.kicker}
            options={sample.options()}
            mode={sample.mode}
            onPick={(ids) => {
              setOpen(false)
              onAnswer(ids.join(', '))
            }}
          />
        ) : null}
      </Presence>
    </Specimen>
  )
}

/** Una carta con varios efectos: «Activar efecto ›» y su lista (en escritorio, el submenú ancho del menú de la carta; en el celular, la hoja del segundo paso). */
function EffectsSample({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const label = t('practice.menu.activateEffect')
  const effects = ['Destroy 1 monster and add 1 "Fire King" monster from your Deck to your hand', 'Special Summon 1 FIRE Winged Beast monster from your hand']
  const pick = (effect: string) => {
    setAnchor(null)
    onAnswer(effect)
  }

  return (
    <Specimen
      title="Opciones · la lista de efectos"
      note={
        <>
          Una carta con varios efectos: «{label} ›» abre la lista, cada efecto con su texto y sin número (el orden de la pregunta no es el del texto de la carta). Como la lista de efectos de la mesa manual: en escritorio, un submenú ancho con las filas a la izquierda (<Tag>wide</Tag> en la opción de <Tag>CardMenu</Tag>); en el celular, la hoja del segundo paso, con la carta arriba y un efecto por fila (<Tag>stacked</Tag> de <Tag>AskOptions</Tag>).
        </>
      }
    >
      <Button variant="secondary" size="sm" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        Abrir el menú de Fire King Island
      </Button>
      <CardMenu anchor={isDesktop ? anchor : null} kicker={t('practice.zone.field')} title="Fire King Island" items={[{ label, onSelect: () => {}, wide: true, children: effects.map((effect) => ({ label: effect, onSelect: () => pick(effect) })) }]} startExpanded={label} onClose={() => setAnchor(null)} />
      <Presence>{anchor && !isDesktop ? <AskOptions title={label} kicker="Fire King Island" options={effects.map((effect, index) => ({ id: String(index), label: effect }))} mode="one" stacked onPick={([id]) => pick(effects[Number(id)]!)} /> : null}</Presence>
    </Specimen>
  )
}

function PickerSample({ title, note, min, max, cancelable, many = false, onAnswer }: { title: string; note: string; min: number; max: number; cancelable: boolean; many?: boolean; onAnswer: (answer: string) => void }) {
  const cards = many ? [...MIXED, ...GRAVE.map((card) => ({ ...card, key: `g${card.key}` })), ...MIXED.map((card) => ({ ...card, key: `m${card.key}` }))] : max === 1 ? MIXED.slice(0, 4) : MIXED

  const [open, setOpen] = useState(false)
  const close = (answer: string) => {
    setOpen(false)
    onAnswer(answer)
  }

  return (
    <Specimen title={title} note={<>{note} Archivo: <Tag>auto/CardPicker.tsx</Tag></>}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Abrir la hoja
      </Button>
      <Presence>
        {open ? <CardPicker title={many ? 'Declará el nombre de una carta' : 'Elegí qué agregar a tu mano'} kicker={many ? 'Prohibition' : 'Branded Fusion'} cards={cards} min={min} max={max} onPick={(keys) => close(keys.join(', '))} onCancel={cancelable ? () => close('cancelada') : undefined} /> : null}
      </Presence>
    </Specimen>
  )
}

/** La banda de una lista corta (hasta 6) sobre una mesa de muestra, en la misma capa que la pregunta del núcleo: lo elegido lo lleva la muestra, como `ask-ui` en la mesa. */
function BandSample({ max, onAnswer }: { max: 1 | 2; onAnswer: (answer: string) => void }) {
  const [shown, setShown] = useState(true)
  const [chosen, setChosen] = useState<string[]>([])
  const reply = (answer: string) => {
    setShown(false)
    setChosen([])
    onAnswer(answer)
  }
  const toggle = (key: string) => {
    if (max === 1) return reply(key)
    setChosen((current) => (current.includes(key) ? current.filter((item) => item !== key) : current.length < max ? [...current, key] : current))
  }
  const what = max === 1 ? t('auto.pick.cards', { count: 1 }) : t('auto.pick.cards', { count: 2 })
  const title = `${t('auto.pick.for', { what, why: t('auto.pick.why.specialSummon') })}${max > 1 ? ` · ${t('auto.pick.count', { chosen: chosen.length, max })}` : ''}`

  return (
    <Specimen
      title={max === 1 ? 'Elegir de una lista corta · una sola' : 'Elegir de una lista corta · 2, cancelable'}
      layout="column"
      note={
        max === 1 ? (
          <>Con una sola, el toque contesta: sin pie si no se puede cancelar ni terminar sin elegir.</>
        ) : (
          <>Hasta 6 cartas, una banda en una fila en la ranura de la pregunta (<Tag>duel.prompt</Tag>, ancha por <Tag>data-prompt-row</Tag>), sin velo; con más, la hoja de abajo. La pestaña dice de dónde salen (si todas salen del mismo lugar) y el título, para qué (<Tag>pickTitle</Tag> de <Tag>ask-ui.ts</Tag>: el código de pista del núcleo, sólo los comprobados) y cuántas van. «Cancelar» sin caja y la principal al final, que se enciende al completar. Archivo: <Tag>auto/CardPicker.tsx</Tag></>
        )
      }
    >
      <div className="relative isolate h-96 overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <Presence>
          {shown ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
              <div className="pointer-events-auto w-[min(24rem,100%)] has-data-leaving:pointer-events-none has-data-prompt-row:w-[min(34rem,100%)]">
                <PickBand
                  title={title}
                  place={t('auto.band.from', { place: t('practice.place.gy'), count: GRAVE.length })}
                  cards={GRAVE}
                  chosen={chosen}
                  eligible={new Set(chosen.length < max ? GRAVE.map((card) => card.key) : chosen)}
                  multi={max > 1}
                  done={chosen.length === max}
                  onToggle={toggle}
                  onPick={() => reply(chosen.join(', '))}
                  {...(max > 1 ? { onCancel: () => reply('cancelada') } : {})}
                />
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <Button variant="secondary" size="sm" className="w-fit" icon="refresh" disabled={shown} onClick={() => setShown(true)}>
        Volver a preguntar
      </Button>
    </Specimen>
  )
}

/** Varias obligatorias a la vez: la misma banda, con cuál va primero ya elegida y la principal que dice qué hace (como en la mesa: `use-auto-asks.tsx`). */
function ForcedSample({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const cards = GRAVE.slice(0, 2).map((card) => ({ ...card, place: t('practice.place.gy') }))
  const [shown, setShown] = useState(true)
  const [first, setFirst] = useState(cards[0]!.key)
  const name = cards.find((card) => card.key === first)!.name

  return (
    <Specimen
      title="Varias obligatorias · cuál va primero"
      layout="column"
      note={<>Cuando el núcleo obliga a activar dos o más a la vez (cada una con un solo efecto), la banda pregunta cuál entra primero en la cadena: la primera ya elegida, tocar otra la cambia y la principal dice qué hace («Activar X primero»). Sin «No responder». Con una sola, la línea de siempre («Tenés que activar X: tocala»). También se activa tocando la que brilla en la mesa. Archivo: <Tag>auto/CardPicker.tsx</Tag></>}
    >
      <div className="relative isolate h-96 overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <Presence>
          {shown ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
              <div className="pointer-events-auto w-[min(24rem,100%)] has-data-leaving:pointer-events-none has-data-prompt-row:w-[min(34rem,100%)]">
                <PickBand
                  title={t('auto.forced.title', { count: cards.length, link: 1 })}
                  cards={cards}
                  chosen={[first]}
                  eligible={new Set(cards.map((card) => card.key))}
                  multi={false}
                  done
                  onToggle={setFirst}
                  onPick={() => {
                    setShown(false)
                    onAnswer(name)
                  }}
                  action={t('auto.forced.activate', { card: name })}
                  note={t('auto.forced.hint')}
                />
              </div>
            </div>
          ) : null}
        </Presence>
      </div>
      <Button variant="secondary" size="sm" className="w-fit" icon="refresh" disabled={shown} onClick={() => setShown(true)}>
        Volver a preguntar
      </Button>
    </Specimen>
  )
}

function SortSample({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [open, setOpen] = useState<'deck' | 'costs' | null>(null)

  return (
    <Specimen title="Ordenar cartas" note={<>sort_card: tocalas en el orden en que van (la primera queda arriba) y se numeran; tocar una numerada la suelta. «Ordenar así» se enciende con todas numeradas; «Dejar como está» contesta sin cambiar nada. Hay que contestar: sin X ni Escape. sort_chain es la misma hoja para los costos de un ataque (Dark Elf y Toll): el 1 se paga primero, sin «CLn» (no son eslabones). Archivo: <Tag>auto/SortSheet.tsx</Tag></>}>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen('deck')}>
          Abrir «Ordená las cartas»
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setOpen('costs')}>
          Abrir «Ordená los costos del ataque»
        </Button>
      </div>
      <Presence>
        {open ? (
          <SortSheet
            {...(open === 'deck' ? { kicker: 'Pot of Desires' } : { title: t('auto.sort.chain'), hint: t('auto.sort.chainHint'), done: t('auto.sort.chainDone') })}
            cards={open === 'deck' ? DECK_TOP : ATTACK_COSTS}
            onSort={(keys) => {
              setOpen(null)
              onAnswer(keys ? keys.join(', ') : 'como estaba')
            }}
          />
        ) : null}
      </Presence>
    </Specimen>
  )
}

function CounterSample({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Specimen title="Sacar contadores" note={<>select_counter: una fila por carta con cuántos tiene y un Stepper de 0 a lo que se le puede sacar (nunca más del total). «Sacar contadores» se enciende con el total justo. Hay que contestar: sin X ni Escape. Archivo: <Tag>auto/CounterSheet.tsx</Tag></>}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Abrir «Sacá 3 contadores»
      </Button>
      <Presence>
        {open ? (
          <CounterSheet
            cards={[
              { key: 'a', name: 'Endymion, the Mighty Master of Magic', art: art(3611830), has: 2 },
              { key: 'b', name: 'Magical Citadel of Endymion', art: art(39910367), has: 5 },
            ]}
            need={3}
            onPick={(counts) => {
              setOpen(false)
              onAnswer(counts.join(', '))
            }}
          />
        ) : null}
      </Presence>
    </Specimen>
  )
}

/** Los íconos de la barra de la mesa, los mismos en la práctica y en el automático: lo que cambia es lo de cada una (guardar y los pasos; el engranaje). Deshacer y guardar, con y sin algo que deshacer. */
function BarActionsSample() {
  const [played, setPlayed] = useState(false)
  const [taps, setTaps] = useState(0)
  const tap = () => setTaps((count) => count + 1)

  return (
    <Specimen title="MatBarActions · los íconos de la mesa" layout="column" className="col-span-full" note={<>La vista, los sonidos, la ventana grande (sólo en escritorio), las handtraps del rival, «Nueva mano», deshacer y «Guardar combo» (con <Tag>onSave</Tag>): el mismo grupo, en el mismo orden, en la barra de la práctica y en la de «Jugar solo automático» (sin guardar; <Tag>auto</Tag> cambia la hoja de las handtraps). Los ajustes son de toda la app: tocarlos acá los cambia en las mesas. Archivo: <Tag>probability/MatBarActions.tsx</Tag></>}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Jugadas" variant="track" value={played ? 'some' : 'none'} onChange={(value) => setPlayed(value === 'some')} options={[{ value: 'none', label: 'Sin jugadas' }, { value: 'some', label: 'Con jugadas' }]} />
        <Tag>{`Toques: ${taps}`}</Tag>
      </div>
      <div className="grid gap-2">
        <span className="text-micro text-soft">La práctica</span>
        <div role="toolbar" aria-label="Muestra de la práctica" className={MAT_BAR_ROW}>
          <MatExitButton onExit={tap} />
          <MatBarActions className="ml-auto" onUndo={tap} canUndo={played} onNewHand={tap} onHandtraps={tap} onSave={tap} canSave={played} />
        </div>
        <span className="text-micro text-soft">Jugar solo automático (sin «Guardar combo»; después va su engranaje)</span>
        <div role="toolbar" aria-label="Muestra del automático" className={MAT_BAR_ROW}>
          <MatExitButton onExit={tap} />
          <MatBarActions className="ml-auto" auto onUndo={tap} canUndo={played} onNewHand={tap} onHandtraps={tap} />
        </div>
      </div>
    </Specimen>
  )
}

/** Una cadena de tres de muestra (Branded Fusion, Ash del rival, PSY-Framegear Gamma): Gamma niega a Ash mientras se resuelve, como lo cuenta el núcleo («Negada · por CL3»). */
const CHAIN_CARDS = [
  { name: 'Branded Fusion', art: art(44362883), mine: true },
  { name: 'Ash Blossom & Joyous Spring', art: art(14558127), mine: false },
  { name: 'PSY-Framegear Gamma', art: art(38814750), mine: true },
]
/** Cómo se ve después de cada paso (lo que arma `chainFeed` en la mesa; el catálogo no importa la lógica del núcleo): el estado de cada eslabón, del que habla la píldora y si ya se resuelve. */
const CHAIN_FRAMES: Array<{ states: ChainRowState[]; focus: number; resolving?: true }> = [
  { states: ['chained'], focus: 0 },
  { states: ['chained', 'chained'], focus: 1 },
  { states: ['chained', 'chained', 'chained'], focus: 2 },
  { states: ['chained', 'chained', 'solving'], focus: 2, resolving: true },
  { states: ['chained', 'negated', 'solving'], focus: 1, resolving: true },
  { states: ['chained', 'negated', 'solved'], focus: 1, resolving: true },
  { states: ['solving', 'negated', 'solved'], focus: 0, resolving: true },
  { states: ['solved', 'negated', 'solved'], focus: 0, resolving: true },
]

/** El aviso de la cadena, paso a paso con un botón (en la mesa los pasa el ritmo: `use-auto-asks.tsx`), sobre un pedazo de mesa: plegado y desplegado. */
function ChainSample() {
  const [count, setCount] = useState(3)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<number | null>(null)
  const [phone, setPhone] = useState(true)
  const [banded, setBanded] = useState(false)
  const frame = CHAIN_FRAMES[count - 1]!

  return (
    <Specimen
      title="ChainNotice · la pila de la cadena"
      layout="column"
      className="col-span-full"
      note={<>Arriba de la mesa, centrado debajo de la barra (<Tag>duel.chain</Tag>): la píldora dice el último eslabón mientras se arma («Cadena · CL3 · Vos») y, al resolverse, qué le pasa a cada uno con la carta en ámbar. La flecha despliega la pila en el orden en que se resuelve (el último primero), con su estado; el que se resuelve lleva el aro ámbar. Cada eslabón lleva el color de su dueño (el de las vidas: violeta claro vos, ámbar el rival) en su número relleno y en «de quién», y se toca para leerlo (negado, dice por cuál: «Negada · por CL3», cuando el núcleo deja saberlo): en la mesa, su carta va al detalle fijo con la frase de su efecto resaltada (sin detalle, grande). Sólo la píldora y la lista reciben toques. En el celular (<Tag>compact</Tag>, menos de 1101 px) la píldora dice todo en dos renglones: «Cadena · 3 · Resuelve CL3» y qué pasa («Ash le quita el efecto a…» si se sabe quién lo negó); con una pregunta abierta en la mesa (<Tag>data-banded</Tag>) queda un renglón, sin flecha ni lista, y sube para que la pregunta entre debajo (si no entra, se aparta hasta que se conteste). Archivo: <Tag>auto/ChainNotice.tsx</Tag></>}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={count >= CHAIN_FRAMES.length} onClick={() => setCount((value) => Math.min(CHAIN_FRAMES.length, value + 1))}>
          Mostrar el paso siguiente
        </Button>
        <Button variant="tertiary" size="sm" onClick={() => setCount(1)}>
          Empezar de nuevo
        </Button>
        <Tag>{`Paso ${count} de ${CHAIN_FRAMES.length}`}</Tag>
        <Button variant="tertiary" size="sm" aria-pressed={phone} onClick={() => setPhone((value) => !value)}>
          Ver en el celular
        </Button>
        <Button variant="tertiary" size="sm" aria-pressed={banded} disabled={!phone} onClick={() => setBanded((value) => !value)}>
          Simular una pregunta abierta
        </Button>
        {picked ? <Tag>{`Tocaste el CL${picked}: en la mesa se lee en el detalle`}</Tag> : null}
      </div>
      <div {...(phone && banded ? { 'data-banded': '' } : {})} className="group/chain relative isolate flex min-h-80 justify-center overflow-hidden rounded-card border border-border-subtle p-3">
        <MatScene className="absolute inset-0 -z-10" />
        <ChainNotice
          rows={frame.states.map((state, index) => ({ number: index + 1, who: CHAIN_CARDS[index]!.mine ? t('duel.bar.you') : t('duel.bar.rival'), mine: CHAIN_CARDS[index]!.mine, name: CHAIN_CARDS[index]!.name, art: CHAIN_CARDS[index]!.art, state, ...(state === 'negated' ? { by: 3 } : {}) }))}
          focus={frame.focus}
          resolving={frame.resolving === true}
          open={open}
          compact={phone}
          onOpenChange={setOpen}
          onPick={(index) => setPicked(index + 1)}
        />
      </div>
    </Specimen>
  )
}

/** La barra con la vida que cambia, los ajustes de verdad (en el estado de la muestra) y la vista con laterales (la grilla de la mesa en una ventana ancha). */
function BarSample({ title, note, lane: kind }: { title: string; note: ReactNode; lane: 'thinking' | 'chain' }) {
  const [life, setLife] = useState({ mine: 8000, theirs: 8000 })
  const [chain, setChain] = useState<AutoChainMode>('ask')
  const [place, setPlace] = useState<AutoPlaceMode>('ask')
  const [layout, setLayout] = useState<'top' | 'rails'>('top')
  const [passed, setPassed] = useState(0)
  // Las handtraps del rival en «Más opciones»: encendidas (con «A ciegas») en la de la cadena; apagadas (el rival pasivo) en la del núcleo resolviendo.
  const [blind, setBlind] = useState(false)
  const handtraps = { on: kind === 'chain', summary: kind === 'chain' ? t('auto.bar.handtrapsOn', { cards: 'Ash Blossom & Joyous Spring, Effect Veiler, Infinite Impermanence', hand: 3 }) : t('auto.bar.handtrapsOff'), onChange: () => setPassed((count) => count + 1) }
  const lane: LaneNotice =
    kind === 'thinking'
      ? { kind: 'thinking', onCancel: () => setPassed((count) => count + 1) }
      : { kind: 'ask', text: t('auto.lane.respondTo', { card: 'Branded Fusion', cards: 'Ash Blossom & Joyous Spring' }), actions: [{ label: t('auto.lane.pass'), onSelect: () => setPassed((count) => count + 1) }] }
  const bar = (
    <AutoBar
      rivalName={t('duel.bar.rival')}
      life={life}
      turn={3}
      myTurn={kind === 'chain'}
      phase={kind === 'chain' ? 'main1' : 'battle'}
      onExit={() => setPassed((count) => count + 1)}
      onUndo={() => setPassed((count) => count + 1)}
      canUndo={kind === 'chain'}
      onNewHand={() => setPassed((count) => count + 1)}
      onHandtraps={() => setPassed((count) => count + 1)}
      lane={lane}
      log={<DuelLogTicker feed={[{ id: 'e1', kind: 'event', side: 'mine', text: 'Activás Branded Fusion' }]} onOpen={() => undefined} />}
      chain={chain}
      onChain={setChain}
      place={place}
      onPlace={setPlace}
      onRestart={() => setPassed((count) => count + 1)}
      onManual={() => setPassed((count) => count + 1)}
      handtraps={handtraps}
      blind={blind}
      onBlind={setBlind}
    />
  )

  return (
    <Specimen title={title} layout="column" className="col-span-full" note={note}>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Cómo va la barra" variant="track" value={layout} onChange={setLayout} options={[{ value: 'top', label: 'Arriba' }, { value: 'rails', label: 'Laterales' }]} />
        <Button variant="secondary" size="sm" onClick={() => setLife((current) => ({ ...current, theirs: Math.max(0, current.theirs - 1000) }))}>
          Bajar 1000 al rival
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLife({ mine: 8000, theirs: 8000 })}>
          Volver a 8000
        </Button>
        <Tag>{`Contestó la línea: ${passed}`}</Tag>
      </div>
      {layout === 'top' ? (
        // El lugar de abajo es el del aviso en escritorio (va debajo de la barra, sin empujar nada).
        <div className="relative isolate overflow-hidden rounded-card border border-border-subtle pb-16">
          <MatScene className="absolute inset-0 -z-10" />
          {bar}
        </div>
      ) : (
        <DuelRailsContext.Provider value>
          <div className="relative isolate grid min-h-72 grid-cols-[minmax(13rem,1fr)_minmax(0,18rem)_minmax(13rem,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-x-4 overflow-hidden rounded-card border border-border-subtle p-4">
            <MatScene className="absolute inset-0 -z-10" />
            {bar}
            <div className="col-start-2 row-span-3 row-start-1 grid place-items-center rounded-card border border-dashed border-border-subtle text-micro text-soft">El campo</div>
          </div>
        </DuelRailsContext.Provider>
      )}
    </Specimen>
  )
}
