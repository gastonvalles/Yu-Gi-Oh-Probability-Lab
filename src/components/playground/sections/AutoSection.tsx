import { useState, type ReactNode } from 'react'

import { DuelRailsContext } from '../../../app/duel-rails'
import { Presence } from '../../../app/use-presence'
import { t } from '../../../i18n'
import { AskOptions, type AskOption } from '../../auto/AskOptions'
import { AskPrompt } from '../../auto/AskPrompt'
import { AutoBar, type AutoChainMode, type AutoPlaceMode } from '../../auto/AutoBar'
import { CardPicker, type PickCard } from '../../auto/CardPicker'
import { SortSheet } from '../../auto/SortSheet'
import { DuelLogTicker, type LaneNotice } from '../../duel/DuelBar'
import { MatScene } from '../../probability/MatArena'
import { Button } from '../../ui/Button'
import { Segmented } from '../../ui/Segmented'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const art = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`
const ASH = { name: 'Ash Blossom & Joyous Spring', art: art(14558127) }

/** Cartas de muestra de lugares distintos (lo que no entra en una sola pila); la de Aluber, todavía sin arte (el esqueleto quieto). */
const MIXED: PickCard[] = [
  { key: 'a', name: 'Fallen of Albaz', art: art(68468459), place: 'Mano' },
  { key: 'b', name: 'Aluber the Jester of Despia', place: 'Cementerio' },
  { key: 'c', name: 'Branded Fusion', art: art(44362883), place: 'Deck' },
  { key: 'd', name: 'Mirrorjade the Iceblade Dragon', art: art(44146295), place: 'Extra Deck' },
  { key: 'e', name: 'Effect Veiler', art: art(97268402), place: 'Mano del rival' },
  { key: 'f', name: 'Infinite Impermanence', art: art(10045474), place: 'Destierro' },
]
const DECK_TOP: PickCard[] = [
  { key: 'x', name: 'Called by the Grave', art: art(24224830) },
  { key: 'y', name: 'Ash Blossom & Joyous Spring', art: art(14558127) },
  { key: 'z', name: 'Effect Veiler', art: art(97268402) },
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
      { id: '0', label: 'Fusion Summon 1 Fusion Monster from your Extra Deck', lead: 'Efecto 1' },
      { id: '1', label: 'Shuffle 1 "Fallen of Albaz" into the Deck', lead: 'Efecto 2', disabled: true },
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
      <PromptSample withCard onAnswer={setAnswer} />
      <PromptSample withCard={false} onAnswer={setAnswer} />

      {OPTION_SAMPLES.map((sample) => (
        <OptionsSample key={sample.id} sample={sample} onAnswer={setAnswer} />
      ))}

      <PickerSample title="Elegir cartas · de 1 a 2, cancelable" note="CardPicker con min 1 y max 2, de lugares distintos (cada una dice de dónde es) y una que todavía no tiene arte (el esqueleto quieto). Aro ámbar y número de orden; Mayús+clic, el tramo; nunca más de dos. «Cancelar» y Escape, porque la pregunta se puede cancelar. Flechas, Inicio y Fin recorren las cartas; Espacio elige." min={1} max={2} cancelable onAnswer={setAnswer} />
      <PickerSample title="Elegir cartas · una sola" note="Con max 1 el primer toque contesta, sin «Listo» (como en la mesa). No se puede cancelar: sin X ni pie." min={1} max={1} cancelable={false} onAnswer={setAnswer} />

      <SortSample onAnswer={setAnswer} />

      <Specimen title="Lo que contestó la última muestra" note="Cada hoja y cada pregunta de arriba le pasan lo elegido a quien la abrió; acá se ve qué devolvió.">
        <Tag>{answer}</Tag>
      </Specimen>

      <BarSample title="AutoBar · el núcleo resolviendo" note={<>La línea del registro dice que el núcleo está resolviendo, con el punto que late; a los 1,5 s aparece «Cancelar» (lo que es rápido no parpadea). En el celular el aviso se apoya sobre la línea del registro; en escritorio, centrado debajo de la barra. Archivo: <Tag>auto/AutoBar.tsx</Tag></>} lane="thinking" />
      <BarSample title="AutoBar · la cadena" note={<>Un aviso que se contesta (<Tag>LaneNotice</Tag> <Tag>ask</Tag>): la cadena dicha por el núcleo y «No responder». Va enmarcado en ámbar. El engranaje abre «Más opciones» (sonidos, respuestas, la casilla, «Handtraps del rival» con «Cambiar handtraps» y, encendidas, «A ciegas» —en la del núcleo resolviendo están apagadas y dice que el rival no juega—, «Reiniciar el duelo» y «Jugar en modo manual»). Probá «Laterales»: así va en una ventana ancha.</>} lane="chain" />
    </SpecimenGrid>
  )
}

/** La pregunta de sí o no sobre una mesa de muestra: la capa la centra sin mover nada (como `duel.prompt` en la mesa). Contestada, sale y la muestra la vuelve a preguntar con el botón. */
function PromptSample({ withCard, onAnswer }: { withCard: boolean; onAnswer: (answer: string) => void }) {
  const [shown, setShown] = useState(true)
  const yes = withCard ? t('practice.menu.activateEffect') : 'Pagar 1000 LP'
  const no = withCard ? t('auto.ask.skipEffect') : t('auto.ask.no')
  const reply = (label: string) => {
    setShown(false)
    onAnswer(label)
  }

  return (
    <Specimen
      title={withCard ? 'Pregunta del núcleo · con la carta' : 'Pregunta del núcleo · sin carta'}
      layout="column"
      note={
        withCard ? (
          <>select_effectyn: la carta chica a la izquierda del texto. En la mesa va en la ranura <Tag>duel.prompt</Tag>: centrada, sin fondo, deja pasar los toques y no mueve nada. El foco va a la principal; Escape no la cierra. Archivo: <Tag>auto/AskPrompt.tsx</Tag></>
        ) : (
          <>select_yesno: sólo el texto. Los botones dicen qué hacen («Hacerlo», o lo que diga el núcleo: «Pagar 1000 LP»), nunca «Sí» ni «No».</>
        )
      }
    >
      <div className="relative isolate h-64 overflow-hidden rounded-card border border-border-subtle">
        <MatScene className="absolute inset-0 -z-10" />
        <Presence>
          {shown ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4">
              <div className="pointer-events-auto w-[min(24rem,100%)] has-data-leaving:pointer-events-none">
                <AskPrompt text={withCard ? t('auto.ask.effect', { card: ASH.name }) : '¿Pagás 1000 LP para activar Skill Drain?'} card={withCard ? ASH : undefined} yes={{ label: yes, onSelect: () => reply(yes) }} no={{ label: no, onSelect: () => reply(no) }} />
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

function PickerSample({ title, note, min, max, cancelable, onAnswer }: { title: string; note: string; min: number; max: number; cancelable: boolean; onAnswer: (answer: string) => void }) {
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
        {open ? <CardPicker title="Elegí qué agregar a tu mano" kicker="Branded Fusion" cards={max === 1 ? MIXED.slice(0, 4) : MIXED} min={min} max={max} onPick={(keys) => close(keys.join(', '))} onCancel={cancelable ? () => close('cancelada') : undefined} /> : null}
      </Presence>
    </Specimen>
  )
}

function SortSample({ onAnswer }: { onAnswer: (answer: string) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <Specimen title="Ordenar cartas" note={<>sort_card: tocalas en el orden en que van (la primera queda arriba) y se numeran; tocar una numerada la suelta. «Ordenar así» se enciende con todas numeradas; «Dejar como está» contesta sin cambiar nada. Hay que contestar: sin X ni Escape. Archivo: <Tag>auto/SortSheet.tsx</Tag></>}>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Abrir «Ordená las cartas»
      </Button>
      <Presence>
        {open ? (
          <SortSheet
            kicker="Pot of Desires"
            cards={DECK_TOP}
            onSort={(keys) => {
              setOpen(false)
              onAnswer(keys ? keys.join(', ') : 'como estaba')
            }}
          />
        ) : null}
      </Presence>
    </Specimen>
  )
}

/** La barra con la vida que cambia, los ajustes de verdad (en el estado de la muestra) y la vista con laterales (la grilla de la mesa en una ventana ancha). */
function BarSample({ title, note, lane: kind }: { title: string; note: ReactNode; lane: 'thinking' | 'chain' }) {
  const [life, setLife] = useState({ mine: 8000, theirs: 8000 })
  const [sounds, setSounds] = useState(true)
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
      : { kind: 'ask', text: t('auto.lane.chain', { link: 2, card: 'Ash Blossom & Joyous Spring', to: 'Branded Fusion' }), actions: [{ label: t('auto.lane.pass'), onSelect: () => setPassed((count) => count + 1) }] }
  const bar = (
    <AutoBar
      rivalName={t('duel.bar.rival')}
      life={life}
      turn={3}
      myTurn={kind === 'chain'}
      phase={kind === 'chain' ? 'main1' : 'battle'}
      onExit={() => setPassed((count) => count + 1)}
      lane={lane}
      log={<DuelLogTicker feed={[{ id: 'e1', kind: 'event', side: 'mine', text: 'Activás Branded Fusion' }]} onOpen={() => undefined} />}
      sounds={sounds}
      onSounds={setSounds}
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
