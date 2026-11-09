# YGOUltraLab

## Diseño

@docs/ux-ui-guidelines.md

Reglas visuales y tokens: `docs/design-system.md`. El catálogo vivo de los componentes es `/playground`: todo cambio de diseño se prueba ahí primero y después se lleva a las pantallas.

## Estilos: Tailwind, nunca CSS puro

Gastón (2026-10-30): todo se estila con utilidades de Tailwind v4 en el TSX; los tokens, las utilidades propias (`@utility`) y las animaciones (`--animate-*` con su `@keyframes` adentro de `@theme`) viven en `src/index.css`. **No se suma CSS propio**: ni selectores, ni archivos `.css` (`tailwind-only.test.ts`; la excepción heredada es `src/foil.css`, los efectos de rareza). Después, libertad, **priorizando el rendimiento al máximo**: se anima sólo `transform`/`translate`/`opacity` (compositor, sin repintar; nada de `@property` animada), todo con `motion-reduce:`, y JavaScript para animar sólo si hace falta orquestar (la librería `motion` no está instalada).

## Repo público y AGPL

El repo es público y la licencia es la AGPL-3.0-or-later (`LICENSE`, `NOTICE.md`; la app ofrece el código desde su menú y `licencia.test.tsx` lo vigila): nada de secretos, mails ni datos personales en commits, documentos, comentarios ni cuerpos de PR (también se ven), y lo que no es nuestro (imágenes de Konami, datos sin licencia) no se sube. Cambiar la licencia es decisión de Gastón.

## Retomar el trabajo

Sin contexto previo (otra PC, sin la memoria de Claude), leé `docs/retomar.md` (cómo arrancar, las decisiones en pie y la forma de trabajo) y `docs/roadmap.md` (lo pendiente).

## Documentación

Pocos documentos, cada uno con su trabajo, y **no son un diario**: el historial es `git log` y el cuerpo de cada PR.

- `README.md` (qué es, cómo se corre, dónde está cada cosa) y `PRODUCT.md` (para quién es y el tono).
- `docs/`: `roadmap.md`, `retomar.md`, `design-system.md` (reglas y tokens), `movimiento.md`, `ux-ui-guidelines.md`, `duelo.md`, `duelo-relay.md`, `motor-de-cartas.md`, `duelos-automaticos.md`, `departamento-ti.md` (el equipo de agentes, el tablero y las pruebas), `i18n.md` y `seguridad.md`.
- **Un renglón se queda sólo si** un test o el código lo hace cumplir, **o** dice algo que no se ve leyendo el código (una decisión, regla, trampa o límite, con su porqué), **o** orienta (dónde vive algo, cómo se corre). Lo demás sobra: lo que ya dice el comentario del archivo, la historia, las citas, las mediciones.
- **Se toca un doc sólo si cambia una regla, un componente o un comportamiento**, en una o dos líneas y donde corresponde: sin entradas con fecha ni números de PR. Los planes y los informes de una sola vez se borran al cumplirse (quedan en git; los de antes de la poda, en el commit `e4b63f6`).
- `src/__tests__/docs.test.ts` le pone un tope de tamaño a cada doc, no deja ninguno huérfano y revisa que toda ruta `docs/….md` exista.

## Orquestación: este chat es el Jefe de TI

Decisión de Gastón (2026-11-08): el chat principal dirige un **departamento de TI** de subagentes (herramienta `Agent`), **sin tope de agentes**, con Scrum + Kanban sobre cards locales (`.claude/ti/`). Gastón sólo habla con este chat. Plantel, tablero, WIP, candados, la capa única de pruebas, el QA en producción y el dashboard: `docs/departamento-ti.md`.

- **Lo trivial lo hace el Jefe directo** (una línea, un archivo abierto, el `git` de un cierre): lanzar un agente cuesta más.
- **Modelos:** buscar y leer código, `sonnet` (`Explore`); cambios mecánicos, `haiku`; planificar, diseñar y construir diseño, `opus`. Todo subagente con `effort: "high"`. **Fable** se sugiere, no se usa solo: la razón en una línea y se espera el sí de Gastón.
- **La card es el brief:** el objetivo con las palabras de Gastón, lo hecho o descartado, los archivos con ruta, la rama y el worktree (desde `origin/main`; no `isolation: "worktree"`, que parte del checkout principal, que puede estar atrasado) y el formato del reporte. Sin un brief claro no se lanza. Reporte quirúrgico; el Jefe mira el diff antes de contar.
- **Pruebas:** mientras se itera, sólo el test que se toca; **una sola capa antes de mergear** (`npm run gate`, la corre `ti-release`); la suite completa corre en el CI; el QA corre Playwright contra producción tras el deploy. Un mismo test reintentado 2 veces se frena y se reporta (va en todo brief).
- **Lo que sale del repo lo hace el Jefe** (push, PR, merge): sin esperar el CI y sin atribución a Claude. Los agentes dejan el commit local en su worktree.
- **Cuántas PR lo dice Gastón;** sin indicación, una por tarea. **Un merge por fase:** las láminas se integran en una rama local `fase-N` (los agentes rebasan sobre ella, sin push) y se sube una sola PR con las notas del parche de cada una.

## Notas del parche: cada cosa que se termina se le explica a los usuarios

Gastón (2026-10-21): siempre que se termina algo (una PR mergeada o una tanda), además del reporte técnico, el orquestador escribe una **explicación instructiva y resumida, como las notas de un parche de un juego**, dirigida a los **usuarios de la página** (no a quien programa): qué hay de nuevo o cambió, dónde se ve y cómo se usa.

- **Tono:** voseo, directo, en segunda persona («ahora podés…», «tocá…»). Nada de nombres de archivos, componentes, tokens ni números de PR.
- **Formato:** un título con el nombre de la novedad y, debajo, **Novedades** (viñetas cortas), **Cómo se usa** (2 a 4 pasos, sólo si hay algo que aprender), **Cambios y arreglos** y **Ojo** (límites conocidos, sólo si los hay). Varias novedades = un bloque por cada una.
- **Dónde va:** en el reporte final a Gastón y arriba del cuerpo de la PR bajo el título «Notas del parche»; lo técnico (archivos, decisiones, pruebas) sigue aparte, debajo.
- **Verdad antes que brillo:** sólo se cuenta lo que se verificó que anda; un arreglo interno que el usuario no nota se menciona en una línea o no se menciona.

## graphify

Gastón (2026-10-22): graphify está instalado (`uv tool install graphifyy`; el paquete oficial lleva doble «y») para ubicarse rápido en el código. Arma un grafo (`graphify-out/`: `graph.json`, `GRAPH_REPORT.md`, `graph.html`) leyendo el AST, **sin LLM y sin costo**.

- **Es local y no se sube** (`graphify-out/` está en `.gitignore`; `.graphifyignore` deja afuera lo que no es código). Cada checkout y cada worktree tiene el suyo.
- **Armarlo:** `graphify update .` en la raíz del worktree. Si no hay `graphify-out/graph.json`, se sigue como siempre (`git grep` y leer). Si el comando no se encuentra (una sesión abierta antes de la instalación no ve el PATH nuevo): `C:\Users\aiaza\.local\bin\graphify.exe`.
- **Usarlo:** `graphify query "<pregunta>"` antes del primer grep de una pregunta sobre el código, `graphify path "<A>" "<B>"` y `graphify explain "<concepto>"`; los archivos se leen sólo en las líneas que el grafo ya ubicó. Un subagente que explora código puede armarse el suyo al empezar.
- **Las docs y las imágenes** entran sólo con `/graphify .` en Claude Code: esa pasada sí usa un LLM y gasta tokens.
- **Hooks de git, sólo en el checkout principal** (`graphify hook install`): tras un commit, un merge o un checkout ahí el grafo se rehace solo en segundo plano (registro en `~/.cache/graphify-rebuild.log`); en un worktree vinculado no hacen nada. Saltarlos: `GRAPHIFY_SKIP_HOOK=1`; sacarlos: `graphify hook uninstall`.
