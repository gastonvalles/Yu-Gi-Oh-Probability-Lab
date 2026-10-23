# Playground (`/playground`)

El catálogo vivo de la app: **todos los botones, los controles, la navegación, los títulos, los íconos y los assets**, en una sola página.
Cada muestra es el componente real (nunca una copia), así que lo que se cambia en `src/components/` se ve ahí y en toda la app a la vez.
La regla de trabajo: **todo cambio de diseño se prueba primero en el playground y recién después se lleva a las pantallas**.

- Se abre en `http://localhost:5173/playground` (desarrollo) y en `/playground` de producción. No está linkeada desde la app,
  la página lleva `noindex` y `robots.txt` la excluye.
- Vive en `src/components/playground/` y se baja aparte (`React.lazy` en `App.tsx`): la app no carga nada de eso si no se la pide.
- Es una herramienta de desarrollo: sus textos están en español y no pasan por `src/i18n` (el chequeo de textos hechos a mano
  salta la carpeta `playground`). Los componentes que muestra sí se traducen como siempre.

## Qué muestra

Las secciones son la lista `SECTIONS` de `Playground.tsx` (cada una con su descripción) y cada una vive en
`src/components/playground/sections/*.tsx`; cada muestra dice qué archivo la define. Los datos de muestra del duelo y de los
combos están en `sections/duel-sample.ts`. Lo que se arma solo: los íconos salen de `ICON_NAMES` (`ui/Icon.tsx`), los assets del
módulo `virtual:public-assets` (un plugin de `vite.config.ts` que lee `public/`) y los tokens de las hojas de estilo (`:root`):
un ícono, una imagen o una variable nueva de `index.css` aparecen solos. Lo único anotado a mano son las **sombras**
(`shadow-card`, `shadow-overlay`, `shadow-focus`): Tailwind no deja leerlas como variables, así que una nueva se suma en `SurfacesSection.tsx`.

## Cómo cambiar algo en toda la app tocando un solo componente

1. Abrí `/playground` y buscá la muestra. Cada una dice qué archivo la define.
2. Editá ese archivo (o el token en `index.css`). El servidor de desarrollo recarga y ves el cambio en todas las variantes a la vez.
3. Si la pantalla que querés cambiar no cambia, es porque no usa el componente: está en la lista de abajo («Fuera del sistema»). Se
   migra al componente en vez de tocarla suelta.

Para sumar un componente nuevo al catálogo: hacé una muestra con `<Specimen title note>` en la sección que corresponda
(o una sección nueva en `SECTIONS`, que arma sola el índice de la página).

## El armazón (`src/components/shell/`)

Es lo que arma toda la app (`DeckModeScreen` lo usa; el playground lo muestra con los mismos componentes, en «Navegación»): si algo
del menú o del cajón cambia acá, cambia en toda la app. Las reglas de la navegación están en `docs/design-system.md`, sección 5.

- `AppShell`: el armazón de toda la pantalla. En escritorio, el menú lateral a la izquierda y la pantalla a la derecha; en el celular,
  la barra de arriba, la barra de abajo con los cuatro grupos y la pantalla. Una vista a pantalla completa (`immersive`: la práctica y,
  en el duelo, sólo la mesa; el lobby, la sala, el siding y la pausa no lo son) no lleva barra de abajo. Recuerda si el menú estaba
  contraído (`ygo-lab:sidebar-collapsed`) y avisa cuánto espacio ocupa (`app/shell-layout.ts`) para que los botones flotantes y la mascota lo dejen libre.
- `AppNavbar` + `FeatureSearch`: la barra de arriba de escritorio (hamburguesa y marca, el buscador de la app, mascotas e idioma) y
  el buscador. Con ellos el menú lateral no lleva cabecera, buscador de cartas, mascotas ni idioma (`AppSidebar withNavbar`).
- `AppSidebar` + `SidebarNav` + `MiniGuide`: el menú lateral (la hamburguesa fija arriba si no hay barra; debajo, lo que scrollea con
  `scroll-yt`), la lista agrupada de destinos (la misma del cajón) y lo que se ve contraído.
- `MobileTabBar` + `GroupSheet`: la barra de abajo del celular (un botón por grupo, 64 px: `TAB_BAR_PX`) y la hoja de cada grupo, que
  prolonga la barra. «Tu deck» lleva el estado de cada paso (`NavItem.pill`), «Jugar» el aviso de una sala en pausa
  (`NavGroup.sheetNotice`) y sus entradas (`sheetItems`), y las demás una línea por destino (`NavItem.blurb`).
- `MobileTopBar` + `NavDrawer` (`DrawerPanel` por dentro): el nombre de la pantalla con la hamburguesa y el cajón: los destinos, el
  idioma (`LanguageSwitcher variant="segmented"`), «Tus datos» (`BackupActions variant="list"`) y abajo las redes
  (`SocialLinks size="lg"`), la privacidad y la autoría; foco atrapado, Escape y velo.
- `SidebarLegal`: el final del menú lateral (redes, privacidad, autoría y aviso de sitio no oficial): ninguna pantalla lleva pie.
- `nav-model.ts`: los tipos (`NavGroup`, `NavItem`); `buildAppNavGroups` (en `deck-workflow-navigation.ts`) arma los cuatro grupos.
  Las mascotas (`mascotsNavItem`) no están en un grupo: abren su panel. La búsqueda de cartas (`searchNavItem`, `onSelect('search')`)
  es una fila arriba de los grupos y un botón de 44 px en `MobileTopBar` (`onSearch`); el armazón la muestra con `searchAvailable`.

## Fuera del sistema (lo que falta migrar a un componente único)

Son los lugares que todavía arman algo «a mano»; cambiar el componente no los cambia (contado con `git grep`, sin `ui/` ni el playground):

- **`<button>` sueltos** en vez de `Button` / `IconButton` (cantidad por archivo): `life/LifeCalculatorScreen` 6, `search/SearchFeedback` 4,
  `search/MobileCardSearch` 4, `replays/LiveStreams` 4, `replays/ReplaysScreen` 3, `probability/rule-builder/CategoryPicker` 3,
  `probability/PracticeMat` 3, `probability/MatDialogs` 3, `expansions/ExpansionsScreen` 3, `duel/DuelBar` 3,
  `classification/ClassificationFields` 3, y uno o dos en otros 54 archivos (entre ellos `shell/GroupSheet` y `shell/MobileTabBar`).
  Muchos son chips o filas clickeables con su propia clase (`RULE_BUTTON` en `PracticeBoard`): conviene sumarlos a `ui/` como variantes.
- **Títulos sin `Heading`** (`<h2>`…`<h5>` a mano): `duel/DuelScreen` 3, `shell/NavDrawer` 3, `duel/DuelBanner` 2,
  `expansions/ExpansionsScreen` 2 y uno en otros nueve archivos (`comparison/TwoLists`, `deck-mode/DeckImportDrawer`,
  `duel/LobbyBanner`, `duel/RoomRules`, `probability/CardSheet`, `probability/LabRuleList`, `probability/rule-builder/CategoryPicker`,
  `probability/rule-builder/RuleStep` y `search/SearchFiltersDrawer`).
