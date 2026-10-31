import { useState } from 'react'

import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { Carousel } from '../../ui/Carousel'
import { ListGroup, ListRow } from '../../ui/ListRow'
import { SectionHeader } from '../../ui/SectionHeader'
import { ShortcutGrid, ShortcutTile } from '../../ui/ShortcutGrid'
import { overline } from '../../ui/typography'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const DECKS = [
  { place: 'Winner · WCQ regional', name: 'Ars Magna Elfnote', size: '40 + 15 + 15' },
  { place: 'Runner-up · WCQ regional', name: 'Clown Crew', size: '40 + 15 + 15' },
  { place: 'Top 4 · YCS', name: 'Fire King Snake-Eye', size: '41 + 15 + 15' },
  { place: 'Top 8 · YCS', name: 'Ryzeal Mitsurugi', size: '40 + 15 + 15' },
]

/** Una carta de muestra: recta (regla 8), del tamaño de una miniatura. */
const CardStub = ({ className = 'h-14 w-10' }: { className?: string }) => <span aria-hidden="true" className={cx('block shrink-0 rounded-none bg-tint/14', className)} />

/** Listas, atajos, encabezados con enlace y el carrusel: las piezas del celular prolijo. */
export function ListsSection() {
  const [timer, setTimer] = useState(true)
  const [side, setSide] = useState(false)
  const [picked, setPicked] = useState('lu')
  const [rival, setRival] = useState('elfnote')
  const [said, setSaid] = useState('')

  return (
    <div className="grid gap-4">
      <SpecimenGrid min="22rem">
        <Specimen title="SectionHeader con enlace" layout="column" note={<>Título a la izquierda y una acción corta a la derecha, ámbar como los enlaces, a la altura del título y con 44 px de toque (<Tag>link</Tag>). Archivo: <Tag>ui/SectionHeader.tsx</Tag></>}>
          <SectionHeader title="En la arena ahora" link={{ label: 'Ver las 12', onClick: () => setSaid('Ver las 12') }} />
          <SectionHeader title="Tus decks" link={{ label: 'Ver todos', href: '#listas' }} />
          <SectionHeader title="Salas que esperan" link={{ label: 'Actualizar', chevron: false, onClick: () => setSaid('Actualizar') }} />
          <SectionHeader title="Un título largo que no entra en un renglón del celular" link={{ label: 'See all 12', onClick: () => setSaid('See all 12') }} />
          {said ? <p className="text-micro text-soft">Tocaste: {said}</p> : null}
        </Specimen>

        <Specimen title="ShortcutGrid" layout="column" note={<>Cuatro por fila (dos si la grilla mide menos de 19 rem), cada atajo con su borde, un solo tinte; sólo la insignia resalta. Archivo: <Tag>ui/ShortcutGrid.tsx</Tag></>}>
          <ShortcutGrid label="Atajos del deck">
            <ShortcutTile icon="cards" label="Deck" onClick={() => setSaid('Deck')} />
            <ShortcutTile icon="tag" label="Roles" badge={{ text: '3', label: '3 cartas sin rol' }} onClick={() => setSaid('Roles')} />
            <ShortcutTile icon="flask" label="Lab" onClick={() => setSaid('Lab')} />
            <ShortcutTile icon="swap" label="Comparar" onClick={() => setSaid('Comparar')} />
            <ShortcutTile icon="gear" label="Reglas" onClick={() => setSaid('Reglas')} />
            <ShortcutTile icon="link" label="Retar a un amigo" onClick={() => setSaid('Retar a un amigo')} />
            <ShortcutTile icon="heart" label="Vidas" href="#listas" />
            <ShortcutTile icon="download" label="Exportar" disabled onClick={() => setSaid('Exportar: primero armá un deck')} />
          </ShortcutGrid>
          <Tag>en inglés (los nombres más largos)</Tag>
          <ShortcutGrid label="Play shortcuts">
            <ShortcutTile icon="link" label="Challenge a friend" onClick={() => setSaid('Challenge a friend')} />
            <ShortcutTile icon="tag" label="Join with a code" onClick={() => setSaid('Join with a code')} />
            <ShortcutTile icon="gear" label="Rules" onClick={() => setSaid('Rules')} />
          </ShortcutGrid>
          <Tag>cargando</Tag>
          <ShortcutGrid label="Atajos cargando" loading={4} />
        </Specimen>
      </SpecimenGrid>

      <SpecimenGrid min="22rem">
        <Specimen title="ListGroup + ListRow (lista)" layout="column" note={<>Una sola tarjeta con líneas finas; la fila entera es el objetivo. El final es uno solo: flecha, valor, botón o interruptor. Archivo: <Tag>ui/ListRow.tsx</Tag></>}>
          <ListGroup label="Salas y duelos">
            <ListRow initials="NI" title="Sala de Nico" subtitle="Match · TCG · 50 min" end={<Button size="sm" onClick={() => setSaid('Entrar a la sala de Nico')}>Entrar</Button>} />
            <ListRow initials="LU" title="Lu vs Fede" subtitle="Mirando 1 de 2" selected={picked === 'lu'} onClick={() => setPicked('lu')} />
            <ListRow media={<CardStub />} title="Fire King · 1° en el regional" subtitle="40 + 15 · hace 2 días" selected={picked === 'fk'} onClick={() => setPicked('fk')} />
            <ListRow icon="trophy" tone="success" title="Ganaste 2 de 3" subtitle="Tinte con significado (success)" href="#listas" />
            <ListRow icon="lock" title="Sala cerrada" subtitle="Apagada: todavía no se puede entrar" disabled onClick={() => setSaid('no llega')} />
            <ListRow media={<CardStub className="h-12 w-9" />} wrap title="Con wrap, un registro: el título es una frase entera, en varios renglones y sin negrita (Qué hizo el bot y por qué)." onClick={() => setSaid('Registro')} />
          </ListGroup>
        </Specimen>

        <Specimen title="ListGroup + ListRow choice (una elección)" layout="column" note={<>Los rivales de Solo: adentro de un <Tag>role="radiogroup"</Tag>, cada fila es un <Tag>radio</Tag> (sin flecha: elegir no abre nada) y la elegida lleva el aro ámbar. Apagada, con <Tag>aria-disabled</Tag>: se enfoca y dice por qué. Archivos: <Tag>ui/ListRow.tsx</Tag> <Tag>duel/SoloScreen.tsx</Tag></>}>
          <div role="radiogroup" aria-label="Rival de muestra">
            <ListGroup>
              <ListRow choice media={<CardStub />} title="Elfnote" subtitle="Sincronías en el centro, también en tu turno." selected={rival === 'elfnote'} end={<Badge>Último</Badge>} onClick={() => setRival('elfnote')} />
              <ListRow choice icon="target" title="Pasivo" subtitle="No juega: sólo recibe." selected={rival === 'passive'} onClick={() => setRival('passive')} />
              <ListRow choice media={<CardStub />} title="Ryzeal" subtitle="Necesita el modo automático" disabled onClick={() => setRival('ryzeal')} />
            </ListGroup>
          </div>
        </Specimen>

        <Specimen title="ListGroup (ajustes)" layout="column" note={<>Título y apoyo a la izquierda; a la derecha, el interruptor (la fila entera lo cambia) o el valor con la flecha.</>}>
          <ListGroup label="Reglas de la sala">
            <ListRow title="Límite de tiempo por turno" subtitle="Cada jugador tiene su reserva, que corre sólo en su turno." toggle={{ checked: timer, onChange: setTimer }} />
            <ListRow title="Sidedeck" subtitle="Con el Side Deck: se arma entre un duelo y el siguiente." toggle={{ checked: side, onChange: setSide }} />
            <ListRow title="Formato" value="TCG" onClick={() => setSaid('Formato')} />
          </ListGroup>
          <Tag>cargando</Tag>
          <ListGroup label="Cargando" loading />
          <Tag>vacía</Tag>
          <ListGroup label="Sin salas" empty="Todavía no hay salas abiertas" />
        </Specimen>
      </SpecimenGrid>

      <Specimen title="Carousel" layout="column" note={<>La siguiente asoma (dice «hay más» sin escribirlo); los puntos siguen a la que se ve y cada uno lleva a la suya; en escritorio, flechas y ←/→. Con <Tag>bleed</Tag> el carril sale hasta el borde del celular: sólo sobre el lienzo, por eso acá (adentro de una muestra) va sin él. Archivo: <Tag>ui/Carousel.tsx</Tag></>}>
        <Carousel label="Decks ganadores">
          {DECKS.map((deck) => (
            <Card key={deck.name} className="grid gap-4">
              <div className="grid gap-0.5">
                <span className={overline}>{deck.place}</span>
                <strong className="truncate text-lead font-semibold text-foreground">{deck.name}</strong>
              </div>
              <div className="flex gap-1.5">
                {[0, 1, 2, 3, 4].map((card) => (
                  <CardStub key={card} className="aspect-[59/86] min-w-0 flex-1" />
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border-subtle pt-3">
                <span className="whitespace-nowrap text-body tabular-nums text-muted">{deck.size}</span>
                <Button variant="outline" size="sm" onClick={() => setSaid(deck.name)}>
                  Ver el deck
                </Button>
              </div>
            </Card>
          ))}
        </Carousel>
        <Tag>una sola tarjeta: sin puntos</Tag>
        <Carousel label="Un deck">
          <Card className="text-body text-muted">El único deck de la lista.</Card>
        </Carousel>
      </Specimen>
    </div>
  )
}
