import { useEffect, type ComponentType } from 'react'

import { AppToaster } from '../ui/AppToaster'
import { Badge } from '../ui/Badge'
import { Heading } from '../ui/Heading'
import { Icon, type IconName } from '../ui/Icon'
import { SectionHeader } from '../ui/SectionHeader'
import { supportText } from '../ui/typography'
import { AssetsSection } from './sections/AssetsSection'
import { ButtonsSection } from './sections/ButtonsSection'
import { DataSection } from './sections/DataSection'
import { DialogsSection } from './sections/DialogsSection'
import { DuelSection } from './sections/DuelSection'
import { IconsSection } from './sections/IconsSection'
import { NavigationSection } from './sections/NavigationSection'
import { SurfacesSection } from './sections/SurfacesSection'
import { TitlesSection } from './sections/TitlesSection'
import { TokensSection } from './sections/TokensSection'

interface PlaygroundSection {
  id: string
  title: string
  icon: IconName
  description: string
  Component: ComponentType
}

/** Las secciones del catálogo, en orden: la tabla de arriba sale de esta lista. */
const SECTIONS: PlaygroundSection[] = [
  { id: 'botones', title: 'Botones y controles', icon: 'hand', description: 'Button, IconButton, Segmented, Switch, Stepper, pastillas y Badge: todo lo que se toca.', Component: ButtonsSection },
  { id: 'navegacion', title: 'Navegación', icon: 'list', description: 'El menú lateral, la barra de arriba del celular, el cajón y el pie: el armazón de toda la app.', Component: NavigationSection },
  { id: 'titulos', title: 'Títulos', icon: 'tag', description: 'Heading, el encabezado de cada pantalla, el de una tarjeta y el de un diálogo.', Component: TitlesSection },
  { id: 'superficies', title: 'Tarjetas, avisos y campos', icon: 'layers', description: 'Card, Callout, EmptyState, Skeleton y los campos de texto.', Component: SurfacesSection },
  { id: 'datos', title: 'Datos', icon: 'chart', description: 'Anillos de progreso y repartidos, y la explicación a pedido.', Component: DataSection },
  { id: 'dialogos', title: 'Diálogos y avisos', icon: 'info', description: 'Modal en todos sus tamaños, las confirmaciones y los avisos (toast).', Component: DialogsSection },
  { id: 'duelo', title: 'Duelo por enlace', icon: 'layers', description: 'Los dos campos del duelo: tres formas de verlos en el celular.', Component: DuelSection },
  { id: 'iconos', title: 'Íconos', icon: 'cube', description: 'Todo el set, en sus tres variantes.', Component: IconsSection },
  { id: 'assets', title: 'Assets', icon: 'image', description: 'Los archivos de public/, la marca, las fuentes y las imágenes de cartas.', Component: AssetsSection },
  { id: 'tokens', title: 'Tokens del diseño', icon: 'sliders', description: 'Colores, radios, sombras y tipografías, leídos de index.css.', Component: TokensSection },
]

/**
 * `/playground`: el catálogo vivo de la app. Cada muestra es el componente real (no una copia), así que tocar un componente en `src/`
 * cambia acá y en toda la app a la vez: se prueba primero acá. No está linkeado desde la app ni lo indexan los buscadores.
 */
export default function Playground() {
  useEffect(() => {
    const previousTitle = document.title
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex,nofollow'
    document.head.append(meta)
    document.title = 'Playground · YGOUltraLab'

    return () => {
      meta.remove()
      document.title = previousTitle
    }
  }, [])

  return (
    <div className="min-h-dvh w-full min-w-0 bg-transparent text-foreground">
      <header className="sticky top-0 z-40 border-b border-border-subtle bg-background">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-4 gap-y-2 px-gutter py-3 min-[1101px]:px-6">
          <Icon name="sliders" size={22} className="text-primary-soft" />
          <Heading level="page" as="h1">
            Playground
          </Heading>
          <Badge tone="warning" shape="tag">
            herramienta de desarrollo
          </Badge>
          <a href="/" className="ml-auto rounded-control px-2 py-1 text-body font-medium text-primary-soft transition-colors hover:text-foreground focus-visible:outline-none focus-visible:shadow-focus">
            Volver a la app
          </a>
        </div>
        <nav aria-label="Secciones del catálogo" className="mx-auto flex max-w-content gap-1 overflow-x-auto px-gutter pb-2 min-[1101px]:px-6">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="flex shrink-0 items-center gap-1.5 rounded-control bg-lavender px-3 py-1.5 text-micro font-semibold text-foreground transition-colors hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus"
            >
              <Icon name={section.icon} size={14} />
              {section.title}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto grid w-full min-w-0 max-w-content gap-12 px-gutter pb-16 pt-6 min-[1101px]:px-6">
        <p className={`${supportText} max-w-prose`}>
          Cada muestra es el componente real, no una copia: lo que cambies en <code>src/components/</code> se ve acá y en toda la app a la vez. Probá primero
          acá, y recién después llevalo a las pantallas.
        </p>
        {SECTIONS.map(({ id, title, icon, description, Component }) => (
          <section key={id} id={id} aria-labelledby={`${id}-title`} className="grid min-w-0 scroll-mt-28 gap-4">
            <SectionHeader as="h2" icon={icon} title={<span id={`${id}-title`}>{title}</span>} description={description} />
            <Component />
          </section>
        ))}
      </main>
      <AppToaster />
    </div>
  )
}
