import { useState } from 'react'

import { StepHero } from '../../StepHero'
import { Button } from '../../ui/Button'
import { Heading, type HeadingLevel } from '../../ui/Heading'
import { Icon } from '../../ui/Icon'
import { IconButton } from '../../ui/IconButton'
import { Modal } from '../../ui/Modal'
import { SectionHeader } from '../../ui/SectionHeader'
import { field } from '../../ui/surfaces'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const LEVELS: Array<{ level: HeadingLevel; tag: string; use: string }> = [
  { level: 'page', tag: 'h1', use: 'El título de la pantalla (uno por pantalla).' },
  { level: 'section', tag: 'h2', use: 'Título de una tarjeta, un diálogo o un panel.' },
  { level: 'card', tag: 'h3', use: 'Título de un ítem adentro de una tarjeta o una lista.' },
  { level: 'kicker', tag: 'p', use: 'Sobretítulo corto en mayúsculas; no es un encabezado.' },
]

/** Los títulos: todos salen de `Heading` (y de `StepHero` / `SectionHeader` / `Modal`, que lo usan); los estilos viven en `ui/typography.ts`. */
export function TitlesSection() {
  const [modal, setModal] = useState(false)

  return (
    <div className="grid gap-4">
      <Specimen title="Heading" layout="column" note={<>Cuatro niveles. Cambiar el tamaño o el peso de uno se hace en <Tag>ui/typography.ts</Tag> y cambia en toda la app. Archivo: <Tag>ui/Heading.tsx</Tag></>}>
        {LEVELS.map(({ level, tag, use }) => (
          <div key={level} className="grid gap-1 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0 min-[700px]:grid-cols-[12rem_minmax(0,1fr)] min-[700px]:items-baseline">
            <span className="flex gap-1.5">
              <Tag>level="{level}"</Tag>
              <Tag>{tag}</Tag>
            </span>
            <span className="grid gap-0.5">
              <Heading level={level} as="div">
                {level === 'kicker' ? 'Sobretítulo' : 'Así se ve un título'}
              </Heading>
              <span className="text-micro text-soft">{use}</span>
            </span>
          </div>
        ))}
      </Specimen>

      <Specimen title="StepHero" layout="column" note={<>El encabezado de cada pantalla: ícono, título, una línea de contexto (sólo en escritorio), ayuda a pedido y acciones. Archivo: <Tag>components/StepHero.tsx</Tag></>}>
        <StepHero title="Armá tu deck" icon="cards" subtitle="Una línea que dice para qué sirve la vista." />
        <StepHero
          title="Probability Lab"
          icon="flask"
          subtitle="Con ayuda, un botón pegado al título y acciones a la derecha."
          help="La explicación larga sólo se ve si la pedís con el ícono “i”."
          titleAction={
            <IconButton tone="ghost" size="sm" aria-label="Guía">
              <Icon name="info" />
            </IconButton>
          }
          side={
            <>
              <Button variant="secondary" icon="download">
                Exportar
              </Button>
              <Button variant="primary" icon="play">
                Medir
              </Button>
            </>
          }
        />
        <StepHero
          title="Con formulario"
          icon="tag"
          subtitle="La parte de la derecha es un formulario."
          sideVariant="form"
          side={
            <>
              <input aria-label="Nombre" defaultValue="Mi deck" className={`${field} h-11 px-3 text-body`} />
              <select aria-label="Formato" className={`${field} h-11 px-3 text-body`}>
                <option>TCG</option>
              </select>
            </>
          }
        />
      </Specimen>

      <SpecimenGrid min="22rem">
        <Specimen title="SectionHeader" layout="column" note={<>Encabezado de tarjeta o sección. Archivo: <Tag>ui/SectionHeader.tsx</Tag></>}>
          <SectionHeader title="Solo el título" />
          <SectionHeader icon="chart" title="Con ícono" description="Y una descripción corta abajo." />
          <SectionHeader
            icon="sliders"
            title="Con acciones"
            description="Los controles van a la derecha."
            actions={
              <Button size="sm" icon="plus">
                Sumar
              </Button>
            }
          />
        </Specimen>

        <Specimen title="Modal" note={<>Encabezado de todo diálogo: sobretítulo, ícono, título y subtítulo. Archivo: <Tag>ui/Modal.tsx</Tag></>}>
          <Button size="sm" onClick={() => setModal(true)}>
            Abrir un diálogo
          </Button>
          <Modal isOpen={modal} onClose={() => setModal(false)} size="sm" kicker="Sobretítulo" icon="tag" title="Título del diálogo" subtitle="El subtítulo explica en una línea." footer={<Button onClick={() => setModal(false)}>Entendido</Button>}>
            <p className="m-0 text-body text-muted">El contenido del diálogo.</p>
          </Modal>
        </Specimen>
      </SpecimenGrid>
    </div>
  )
}
