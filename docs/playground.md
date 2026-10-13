# Playground (`/playground`)

El catálogo vivo de la app: **todos los botones, los controles, la navegación, los títulos, los íconos y los assets**, en una sola página.
Cada muestra es el componente real (nunca una copia), así que lo que se cambia en `src/components/` se ve ahí y en toda la app a la vez.
La regla de trabajo: **se prueba primero en el playground y recién después se lleva a las pantallas**.

- Se abre en `http://localhost:5173/playground` (desarrollo) y en `/playground` de producción. No está linkeada desde la app,
  la página lleva `noindex` y `robots.txt` la excluye.
- Vive en `src/components/playground/` y se baja aparte (`React.lazy` en `App.tsx`): la app no carga nada de eso si no se la pide.
- Es una herramienta de desarrollo: sus textos están en español y no pasan por `src/i18n` (el chequeo de textos hechos a mano
  salta la carpeta `playground`). Los componentes que muestra sí se traducen como siempre.

## Qué muestra y de dónde sale cada lista

| Sección | Muestra | Fuente de la lista |
|---|---|---|
| Botones y controles | `Button`, `IconButton`, `Segmented`, `Switch`, `Stepper`, pastillas de selección, `Badge`, el botón flotante | los componentes de `ui/` |
| Navegación | el menú lateral (abierto y contraído), la barra de arriba del celular, el cajón y el pie, y el armazón completo a pantalla completa | `components/shell/` |
| Títulos | `Heading` (4 niveles), `StepHero`, `SectionHeader`, el encabezado de un `Modal` | `ui/Heading.tsx`, `ui/typography.ts` |
| Tarjetas, avisos y campos | `Card`, `Callout`, `EmptyState`, `Skeleton`, campos, sombras | `ui/` y `ui/surfaces.ts` |
| Datos | `ProgressRing`, `SegmentedRing`, `InfoTip` | `ui/` |
| Diálogos y avisos | `Modal` en todos sus tamaños y los toasts | `ui/Modal.tsx`, `app/use-toast-message.ts` |
| Íconos | todo el set en `linear` / `bulk` / `bold`, con buscador | `ICON_NAMES` (sale de `ui/Icon.tsx`: un ícono nuevo aparece solo) |
| Assets | los archivos de `public/` por carpeta, la marca, las fuentes y las imágenes de cartas | módulo `virtual:public-assets` (plugin de `vite.config.ts`: lee la carpeta; una imagen nueva aparece sola) |
| Tokens del diseño | colores, radios, tamaños de texto, tipografías, medidas y animaciones | se leen de las hojas de estilo (`:root`): una variable nueva de `index.css` aparece sola |

Lo único anotado a mano son las **sombras** (`shadow-card`, `shadow-overlay`, `shadow-brand`, `shadow-focus`): Tailwind no deja leerlas
como variables. Si se suma una, se suma en `SurfacesSection.tsx`.

## Cómo cambiar algo en toda la app tocando un solo componente

1. Abrí `/playground` y buscá la muestra. Cada una dice qué archivo la define.
2. Editá ese archivo (o el token en `index.css`). El servidor de desarrollo recarga y ves el cambio en todas las variantes a la vez.
3. Si la pantalla que querés cambiar no cambia, es porque no usa el componente: está en la lista de abajo ("fuera del sistema"). Se
   migra al componente en vez de tocarla suelta.

Para sumar un componente nuevo al catálogo: hacé una muestra con `<Specimen title note>` en la sección que corresponda
(o una sección nueva en la lista `SECTIONS` de `Playground.tsx`, que arma sola la tabla de arriba).

## El armazón nuevo (`src/components/shell/`)

Lo que reemplaza a la barra de arriba y a la barra de abajo del celular (todavía **no está conectado** a la app: se prueba acá primero).

- `AppShell`: el armazón de toda la pantalla. En escritorio, menú lateral a la izquierda y la pantalla con su pie a la derecha; en el
  celular, barra de arriba con hamburguesa y la pantalla con su pie. Recuerda si el menú estaba contraído (`ygo-lab:sidebar-collapsed`).
- `SidebarNav`: la lista de destinos agrupada. La comparten el menú lateral y el cajón, así que un cambio acá cambia los dos.
- `AppSidebar`: marca, destinos, idioma, mascotas y el botón de contraer a una columna de íconos.
- `MobileTopBar` + `NavDrawer` (`DrawerPanel` por dentro): la hamburguesa y el cajón con el mismo menú (foco atrapado, Escape, velo).
- `AppFooter`: autoría, aviso de sitio no oficial, redes y privacidad.
- `nav-model.ts`: los tipos (`NavGroup`, `NavItem`) y `buildAppNavGroups` (en `deck-workflow-navigation.ts`) arma los grupos de la app:
  **Tu deck** (Deck · Roles · Lab · Comparar · Exportar), **Herramientas** (Práctica · Calculadora de LP, que abren un panel) y
  **Descubrir** (Meta · Replays).

## Fuera del sistema (lo que falta migrar a un componente único)

Foto del 2026-10-13. Son los lugares que todavía arman un botón o un título "a mano" en vez de pasar por `Button` / `IconButton` /
`Heading`; cambiar el componente no los cambia.

- **Títulos con clases a mano** (`m-0 text-lead font-semibold …`): `card-detail/CardOverlay`, `card-detail/CardPrices`,
  `comparison/KpiDetailModal`, `deck-mode/DeckBuilderClassicPreview`, `deck-mode/DeckImportDrawer`, `DeckZone`, `meta/MetaDeckModal`,
  `probability/LabPendingClassification`, `probability/LabRuleList`, `probability/PatternEditorDrawer`,
  `probability/rule-builder/CategoryPicker`, y el título del propio `ui/Modal`. Todos deberían ser `<Heading level=…>`.
- **`<button>` sueltos** (cantidad por archivo): `search/MobileCardSearch` 6, `life/LifeCalculatorScreen` 6, `probability/PracticeMat` 5
  (fases, replay, pilas), `search/SearchFeedback` 4, `search/DesktopSearchPanel` 4, `probability/rule-builder/CategoryPicker` 4,
  `replays/ReplaysScreen` 3, `probability/rule-builder/ConditionBlock` 3, `probability/MatDialogs` 3, `meta/MetaScreen` 3,
  `classification/ClassificationFields` 3, y uno o dos en otros 25 archivos. Muchos son chips o filas clickeables con su propia
  clase (`RULE_BUTTON` en `PracticeBoard`, `REPLAY_BUTTON` en `PracticeMat`): conviene sumarlos a `ui/` como variantes.
- La barra de pasos de arriba (`DeckModeNavigation`), la de abajo del celular (`MobileBottomStepNav`) y `DeckModeShell` se borran cuando
  el armazón nuevo pase a la app.
