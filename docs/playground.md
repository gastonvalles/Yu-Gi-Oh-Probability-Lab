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
| Botones y controles | `Button` (con `outline` sobre una tarjeta), `IconButton` (también `swatch`, el círculo de color del menú de una fila de tier list), `Segmented`, `FilterChips` («Todos» elegido, una rareza elegida entre varias, cuentas y uno apagado), `Switch`, `Stepper`, pastillas de selección, la fila elegida y el «+» por fila (`listItemSelected`, `rowAddButton`), `Badge` (también `onImage`, sobre una foto), el botón flotante; lo elegido de todos va en ámbar | los componentes de `ui/` |
| Navegación | el menú lateral (abierto y contraído), la barra de arriba del celular, la barra de abajo con sus hojas, el cajón y el pie, y el armazón completo a pantalla completa; además los controles del replay, la **lista de pasos** (con un combo de muestra de 18 jugadas: se avanza con los botones, se elige el ancho —la columna de la mesa, el diálogo del celular o libre— y el interruptor «Detalles» la vuelve compacta) y el **tablero chico** de un paso a tres anchos (los dos con las flechas de lo que se movió), y las **flechas de movimiento**: un tablero por cada camino que dibujan (de una pila a una casilla y al revés, de la mano y a la mano, debajo de un Xyz, varias cartas juntas, casillas vecinas, sobre cartas boca arriba y un paso con más caminos que el tope), con la frase de su paso, a tres anchos | `components/shell/`; `probability/ReplayBar.tsx`, `PracticeMatPanel.tsx`, `MatSnapshot.tsx`, `app/mat-arrows.ts` y los combos de `playground/sections/duel-sample.ts` (`sampleCombo`, `sampleArrowCombo`) |
| Títulos | `Heading` (4 niveles), `StepHero`, `SectionHeader`, el encabezado de un `Modal` | `ui/Heading.tsx`, `ui/typography.ts` |
| Tarjetas, avisos y campos | `Card`, `Callout`, `EmptyState`, `Skeleton`, campos, sombras | `ui/` y `ui/surfaces.ts` |
| Datos | `ProgressRing`, `SegmentedRing`, `CardEffectText`, `CardEffectTraits`, `CardArtPicker` (en columna, con muchos artes), **`TierStrip` y el tablero del creador** (la fila del meta, de sólo lectura, y el `TierMakerBoard` de verdad con tres filas —una en el gris oscuro de la letra clara—: al final de cada fila el engranaje y el agarre, y las filas se arrastran con el mouse, con el dedo o con ↑ ↓), `InfoTip` | `ui/` (y `card-detail/` para `CardEffectText`, `CardEffectTraits` y `CardArtPicker`; `meta/` y `app/use-tier-row-drag.ts` para las tier lists) |
| El Lab | el veredicto (`LabScoreCard`), la lente (`Segmented variant="lens"`), «Lo que más te frena» (`LabSuggestion`), «Qué robás de cada rol» y «Falta un paso para medir», con un deck de muestra | `probability/` (los componentes reales) y `playground/sections/LabResultSection.tsx` |
| Reglas del Lab | la tarjeta de reglas (Salidas | Problemas), el número en vivo, la regla en una frase, una condición, qué cuenta y el editor entero | `probability/` (los componentes reales) y `playground/sections/RulesSection.tsx` |
| Duelo por enlace | los dos campos del duelo (el del rival espejado, las Zonas Extra compartidas, una magia de campo boca arriba en cada lado —Fire King Island la tuya, de arte claro, y Pandemonium la del rival, oscura— y un Xyz de cada lado con materiales: el tuyo en ataque con tres, el del rival en defensa con dos), tres formas de verlos en el celular, **la magia de campo de fondo** (tu Zona de campo boca arriba, boca abajo o vacía, para ver el arte entrar y apagarse sólo en tu mitad), **los materiales de un Xyz** (la pila de dorsos y el aro con la cantidad, de 0 a 5 materiales, tuyo y del rival, en ataque y en defensa, con las casillas del celular a 360, 390 y 430 px) y la arena de la mesa (fondo, placa y marcas de lo que se puede elegir) | `duel/DuelTable.tsx`, `probability/MaterialStack.tsx` y `probability/MatArena.tsx` (`FieldArt`); el duelo de muestra, `playground/sections/duel-sample.ts` y **«Registro sobre el campo»** (el cartel con las dos últimas jugadas, con «Agregar una jugada»: se arrastra de costado para sacarlo y vuelve con la jugada siguiente) y **«Handtraps del rival»** (el simulador de «Jugar solo»: la franja de su mano, con cartas sin usar y una usada, y la fila y la hoja del pool: `probability/RivalHandStrip.tsx` y `duel/HandtrapPool.tsx`). |
| Diálogos y avisos | `Modal` en todos sus tamaños, «Confirmación» (`ConfirmDialog`: tres de referencia y cinco de la app con sus textos reales, con el selector de idioma para verlas en inglés), el **visor de una pila** con una muestra por estado (el de siempre, con una carta marcada; «Elegir varias» con dos elegidas —una con la mira—, sin nada elegido, el Main con buscador y «Elegir todas», y el menú de varias cartas con una opción apagada que dice por qué: `CardMenu` en escritorio, `CardSheet` en el celular), la ficha del Lab, la carta en grande y los toasts. **Al cerrar cada diálogo se ve su salida** (150 ms, la inversa de su entrada: el velo se funde y el panel se achica o baja; el menú de la carta vuelve a la carta y la hoja del celular baja, envuelta en `Presence`); con movimiento reducido se van de golpe | `ui/Modal.tsx`, `probability/ConfirmDialog.tsx`, `probability/MatDialogs.tsx` (`PileViewer`, `CardMenu`), `probability/CardSheet.tsx`, `card-detail/CardZoom.tsx`, `app/use-toast-message.ts`; las cartas del visor son las del combo de muestra (`duel-sample.ts`) |
| Íconos | todo el set en `linear` / `bulk` / `bold`, con buscador | `ICON_NAMES` (sale de `ui/Icon.tsx`: un ícono nuevo aparece solo) |
| Assets | los archivos de `public/` por carpeta, la marca, las fuentes y las imágenes de cartas | módulo `virtual:public-assets` (plugin de `vite.config.ts`: lee la carpeta; una imagen nueva aparece sola) |
| Tokens del diseño | colores, radios, tamaños de texto, tipografías, medidas y animaciones | se leen de las hojas de estilo (`:root`): una variable nueva de `index.css` aparece sola |

Lo único anotado a mano son las **sombras** (`shadow-card`, `shadow-overlay`, `shadow-focus`): Tailwind no deja leerlas
como variables. Si se suma una, se suma en `SurfacesSection.tsx`.

## Cómo cambiar algo en toda la app tocando un solo componente

1. Abrí `/playground` y buscá la muestra. Cada una dice qué archivo la define.
2. Editá ese archivo (o el token en `index.css`). El servidor de desarrollo recarga y ves el cambio en todas las variantes a la vez.
3. Si la pantalla que querés cambiar no cambia, es porque no usa el componente: está en la lista de abajo ("fuera del sistema"). Se
   migra al componente en vez de tocarla suelta.

Para sumar un componente nuevo al catálogo: hacé una muestra con `<Specimen title note>` en la sección que corresponda
(o una sección nueva en la lista `SECTIONS` de `Playground.tsx`, que arma sola la tabla de arriba).

## El armazón nuevo (`src/components/shell/`)

Reemplazó a la barra de pasos de arriba: es lo que arma toda la app (`DeckModeScreen` lo usa; el
playground lo muestra con los mismos componentes). Si algo del menú, del cajón o del pie cambia acá, cambia en toda la app.

- `AppShell`: el armazón de toda la pantalla. En escritorio, menú lateral a la izquierda y la pantalla a la derecha; en el
  celular, barra de arriba con el nombre de la pantalla y la hamburguesa, la barra de abajo con los cuatro grupos y la pantalla (una vista a pantalla completa, `immersive`, no lleva barra de abajo: la práctica y, en el duelo, sólo la mesa; el lobby, la sala, el siding y la pausa sí). Con los pasos del deck muestra además `FlowSteps`. Recuerda si el menú estaba contraído (`ygo-lab:sidebar-collapsed`)
  y avisa cuánto espacio ocupa (`app/shell-layout.ts`) para que los botones flotantes y la mascota lo dejen libre.
- `SidebarNav`: la lista de destinos agrupada del menú lateral (índigo, con el destino abierto en ámbar).
- `AppNavbar` + `FeatureSearch`: la barra de arriba de escritorio (hamburguesa y marca, el buscador de la app, mascotas e idioma) y el buscador que busca pantallas, herramientas, cartas, expansiones y sus códigos, decks de torneo, jugadores y replays (también por palabras como «vidas» o «pdf»). Con ellos el menú lateral deja de llevar cabecera, buscador de cartas, mascotas e idioma (`AppSidebar withNavbar`).
- `MobileTabBar` + `GroupSheet`: la barra de abajo del celular (un botón por grupo) y la hoja que sube con las opciones del grupo, como en el lienzo: prolonga la barra (el mismo índigo, sin velo ni sombra, de alto dinámico; la barra queda a la vista: tocar otro grupo cambia de hoja y el mismo la cierra; con una hoja abierta sólo su grupo va en ámbar; al cerrarse baja por detrás de la barra). «Tu deck» lleva el estado de cada paso a la derecha (`NavItem.pill`), «Duelo» el aviso de una sala en pausa (`NavGroup.sheetNotice`) y sus cuatro entradas (`sheetItems`) y las demás una línea que explica cada destino (`NavItem.blurb`). Mide 64 px (`TAB_BAR_PX` en `app/shell-layout.ts`) y los botones flotantes la dejan libre.
- `AppSidebar`: armado como el menú de YouTube. Arriba, fija, la hamburguesa (siempre a la vista, abierto o contraído: abre y contrae el menú) con la marca; debajo lo que scrollea con la barra fina `scroll-yt` (la fila de «Buscar cartas» si la pantalla la ofrece, destinos, mascotas, idioma) y, al final, `SidebarLegal`.
- `MobileTopBar` + `NavDrawer` (`DrawerPanel` por dentro): el nombre de la pantalla con la hamburguesa y el cajón de ajustes del lienzo: idioma (`LanguageSwitcher variant="segmented"`, Español | English), «Tus datos» (`BackupActions variant="list"`) y abajo las redes (`SocialLinks size="lg"`), la privacidad y la autoría; foco atrapado, Escape, velo; al cerrarse vuelve a la izquierda y el velo se funde.
- `SidebarLegal`: el final del menú lateral (redes arriba, privacidad debajo, autoría y aviso de sitio no oficial); reemplazó al pie `AppFooter`, que ya no existe: ninguna pantalla lleva pie.
- `nav-model.ts`: los tipos (`NavGroup`, `NavItem`) y `buildAppNavGroups` (en `deck-workflow-navigation.ts`) arma los grupos de la app:
  **Tu deck** (el recorrido del Lab: Deck · Roles · Lab · Comparar), **Jugar** (Práctica · Duelo con un amigo · Calculadora de LP · Exportar, que es sacar el deck para el torneo o el simulador), **Descubrir** (Tier lists · Crear tier list · Decks de torneo · Replays) y **Cartas** (Expansiones · Banlists).
  Las mascotas (`mascotsNavItem`) no están en un grupo: van abajo del menú lateral y en el cajón del celular, y abren su panel.
  Lo mismo la búsqueda de cartas (`searchNavItem`, `onSelect('search')`): una fila arriba de los grupos del menú lateral y del cajón, y un botón de 44 px a la derecha de `MobileTopBar` (`onSearch`); el armazón la muestra con `searchAvailable`.

## Fuera del sistema (lo que falta migrar a un componente único)

Foto del 2026-10-16. Son los lugares que todavía arman un botón "a mano" en vez de pasar por `Button` / `IconButton`; cambiar el
componente no los cambia. Los títulos ya están migrados: todos pasan por `Heading` (también el de `Modal`, `SectionHeader` y `StepHero`).

- **`<button>` sueltos** (cantidad por archivo, sin contar `ui/` ni el playground): `search/MobileCardSearch` 6, `life/LifeCalculatorScreen` 6,
  `duel/DuelBar` 5, `search/SearchFeedback` 4, `search/DesktopSearchPanel` 4, `probability/rule-builder/CategoryPicker` 4,
  `replays/ReplaysScreen` 4, `expansions/ExpansionsScreen` 4, `probability/rule-builder/ConditionBlock` 3, `probability/PracticeMat` 3
  (fases, replay, pilas), `probability/MatDialogs` 3, `classification/ClassificationFields` 3, y uno o dos en otros 37 archivos
  (entre ellos las piezas nuevas del armazón: `GroupSheet`, `MobileTabBar`). Muchos son chips o filas clickeables con su propia
  clase (`RULE_BUTTON` en `PracticeBoard`): conviene sumarlos a `ui/` como variantes.
