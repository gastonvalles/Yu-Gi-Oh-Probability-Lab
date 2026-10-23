# YGOUltraLab

## Diseño

@docs/ux-ui-guidelines.md

Las reglas visuales, los componentes y los tokens están en `docs/design-system.md`; el catálogo vivo es `/playground`
(`docs/playground.md`): todo cambio de diseño se prueba ahí primero y después se lleva a las pantallas.

## Retomar el trabajo

Si arrancás sin contexto previo (otra PC, sin la memoria de Claude), leé `docs/retomar.md`: el estado por áreas, cómo arrancar, las decisiones en pie, lo pendiente y la forma de trabajo.

## Documentación

Hay pocos documentos y cada uno tiene un trabajo; **no son un diario**: el historial es `git log` y el cuerpo de cada PR (con sus «Notas del parche» y su detalle técnico).

- `README.md`: qué es la app, cómo se corre y dónde está cada cosa. `PRODUCT.md`: para quién es y el tono.
- `docs/retomar.md`: una foto del estado, las decisiones en pie, lo pendiente y la forma de trabajo, para arrancar sin la memoria de Claude (otra PC).
- Diseño: `docs/design-system.md` (reglas, tokens y un índice corto de componentes: el detalle de cada uno está en su comentario), `docs/playground.md` (el catálogo vivo `/playground`) y `docs/ux-ui-guidelines.md` (cómo se lee un pedido de diseño).
- Un tema cada uno: `docs/duelo.md` y `docs/duelo-relay.md`, `docs/motor-de-cartas.md`, `docs/i18n.md` y `docs/seguridad.md`.
- **Se toca un doc sólo si cambia una regla, un componente o un comportamiento**, en una o dos líneas y en el lugar que corresponde: nada de entradas con fecha, citas ni números de PR. Los planes y los informes de una sola vez se borran cuando se cumplen (quedan en git). `src/__tests__/docs.test.ts` le pone un tope de tamaño a cada doc, no deja ninguno huérfano y revisa que toda ruta `docs/….md` exista.

## Orquestación: este chat coordina, los subagentes trabajan

Decisión de Gastón (2026-10-20): el chat principal es el **orquestador**. Reparte el trabajo en subagentes (herramienta `Agent`), junta lo que cada uno le reporta y le cuenta a Gastón el resultado. Lo trivial (una línea, un archivo que ya está abierto, el `git` de un cierre) lo hace él directo: lanzar un agente cuesta más.

| Tarea | Agente (`subagent_type`) | Modelo (`model`) |
|---|---|---|
| **Buscar y leer código rápido**: dónde está algo, qué hace, quién lo usa, qué tests lo cubren, cómo lo resuelve otro sitio | `Explore` (o `general-purpose` si tiene que correr algo) | `sonnet` (Sonnet 5.5) |
| **Cambios mecánicos y livianos**: renombrar o mover, claves de i18n, ajustar un test o un doc, repetir un patrón ya decidido | `general-purpose` | `haiku` |
| **Planificar y diseñar**: arquitectura, diseño de una pantalla o un componente, plan de varios pasos, crítica de diseño (y construir lo que es de diseño) | `Plan` (sólo el plan) o `general-purpose` (plan y construcción) | `opus` (Opus 5.5) |

- **Siempre con esfuerzo máximo:** todo subagente se lanza con `effort: "max"`.
- **Fable (`fable`) se sugiere, no se usa solo:** en un caso específico (un bug que ya falló dos intentos, un cambio que cruza varias capas, una decisión difícil de revertir, una revisión de seguridad, una arquitectura con mucha incertidumbre) el orquestador le propone a Gastón usar Fable, con la razón en una línea, y espera el sí antes de lanzarlo.
- **El brief es todo lo que el agente sabe:** el objetivo con las palabras de Gastón, lo que ya se hizo o se descartó, los archivos que importan (con ruta), la rama y el worktree donde trabaja (desde `origin/main`; no `isolation: "worktree"`, que parte del checkout principal, que puede estar atrasado), las reglas del repo que le tocan y el formato del reporte. Sin un brief claro no se lanza.
- **Reporte quirúrgico:** cada agente devuelve un resumen corto —qué hizo o encontró, `archivo:línea`, decisiones y por qué, riesgos o lo que dejó afuera, y el resultado de `typecheck`, `lint`, `test` y `build` si tocó código—, sin volcar archivos ni logs.
- **El orquestador verifica antes de contar:** mira el diff y corre lo que sea barato (no da por hecho lo que el agente dice haber hecho) y recién entonces le reporta a Gastón en pocas líneas: qué quedó, qué falta y qué decisión le toca a él.
- **Lo que sale del repo lo hace el orquestador** (push, PR, merge), con las reglas de siempre: mergear sin esperar el CI y sin atribución a Claude. Los agentes trabajan en su worktree y dejan el commit local hecho.
- **En paralelo sólo lo que no toca los mismos archivos;** si no, uno atrás del otro.
- **Un mismo test que se reintenta 2 veces, se frena** (Gastón, 2026-10-21): si el orquestador o un agente corre de nuevo el mismo test dos veces porque falla o se comporta distinto, para y reporta en resumen el problema (qué test, qué dice el fallo, qué se probó) en vez de seguir reintentando; si no, sigue. Va en el brief de todo agente.
- **Cuántas PR lo dice Gastón en cada pedido:** «hace una sola pr» (2026-10-21, con dos ramas de agentes listas) = se juntan en una rama y se sube una única PR; «hacelo de más barato a más caro y mergeá cada PR por separado» (2026-10-21, las animaciones) = una PR por pieza, de la más barata a la más cara, cada una mergeada por separado. Sin indicación, una PR por tarea.
- **Tests livianos** (Gastón, 2026-10-21: «podemos usar jest… lo que los haga más rápidos y livianos»; medido: Jest no acelera lo que pesa —el cuerpo de los tests es el mismo y migrar 258 archivos es caro—, se queda Vitest): mientras se itera se corre **sólo lo que se toca** (`npx vitest --run src/__tests__/<archivo>` o `npx vitest related <archivos> --run`) y la suite completa (`npm test`, ~48 s con los procesos por defecto y ~51 s con `VITEST_MAX_WORKERS=6`, medido el 2026-10-21: corre en `vmForks`, ver `projects` en `vite.config.ts`; la pantalla del duelo y la mesa de práctica están partidas en varios archivos, `duel-screen-*.test.tsx` y `practice-mat-*.test.tsx`, con el arnés común en `src/__tests__/support/`: con seis procesos el archivo más lento tarda ~24 s (antes, uno solo tardaba ~68 s); con los procesos por defecto, la carga los estira hasta ~40 s; si uno nuevo pasa de ~20 s, se parte igual) **una sola vez al cierre**. Cada suite abre ~15 procesos: con **tres o más agentes a la vez** se corre con `VITEST_MAX_WORKERS=6` (varios timeouts «por carga» —`playground`, `replays-screen`, `expansions-memo`— eran de esto, no de un bug). Va en el brief de todo agente.

## Notas del parche: cada cosa que se termina se le explica a los usuarios

Gastón (2026-10-21): siempre que se termina algo (una PR mergeada o una tanda), además del reporte técnico, el orquestador escribe una **explicación instructiva y resumida, como las notas de un parche de un juego**, dirigida a los **usuarios de la página** (no a quien programa): qué hay de nuevo o cambió, dónde se ve y cómo se usa.

- **Tono:** voseo, directo, en segunda persona («ahora podés…», «tocá…»), como si le hablaras a quien juega o arma su deck. Nada de nombres de archivos, componentes, tokens ni números de PR.
- **Formato:** un título con el nombre de la novedad y, debajo, **Novedades** (lo que ahora se puede hacer, en viñetas cortas), **Cómo se usa** (2 a 4 pasos, sólo si hay algo que aprender), **Cambios y arreglos** (lo que ya andaba y ahora anda mejor) y **Ojo** (límites conocidos, sólo si los hay). Una novedad = unas pocas líneas; si son varias, un parche con un bloque por cada una.
- **Dónde va:** en el reporte final a Gastón y arriba del cuerpo de la PR bajo el título «Notas del parche». Lo técnico (archivos, decisiones, pruebas) sigue aparte, debajo.
- **Verdad antes que brillo:** sólo se cuenta lo que se verificó que anda; los límites van en «Ojo». Un arreglo interno que el usuario no nota (un test, un refactor) se menciona en una línea o no se menciona.

## graphify

Gastón (2026-10-22): graphify está instalado en la máquina (`uv tool install graphifyy`; el paquete oficial lleva doble «y») para ubicarse rápido en el código: unos 1.700 archivos, con pantallas de 2.500 líneas como `PracticeMat.tsx`. Arma un grafo de conocimiento (`graphify-out/`: `graph.json`, `GRAPH_REPORT.md` y `graph.html`) leyendo el AST de los archivos, **sin LLM y sin costo**.

- **El grafo es local y no se sube:** `graphify-out/` está en `.gitignore` (pesa ~10 MB y se rehace de una). Cada checkout y cada worktree tiene el suyo y refleja lo que hay en ese directorio. `.graphifyignore` deja afuera lo que no es código (`public/`, `src/data/`, el lock).
- **Armarlo:** `graphify update .` en la raíz del worktree (la primera vez, un minuto; después sólo relee lo que cambió). Si no hay `graphify-out/graph.json`, se sigue como siempre (`git grep` y leer los archivos). Si el comando no se encuentra (la app de escritorio toma el PATH al abrirse, así que una sesión anterior a la instalación no lo ve), se llama con la ruta completa: `C:\Users\aiaza\.local\bin\graphify.exe`.
- **Usarlo**, con el grafo armado: `graphify query "<pregunta>"` antes del primer grep de una pregunta sobre el código, `graphify path "<A>" "<B>"` para ver cómo se conectan dos cosas y `graphify explain "<concepto>"` para un concepto; los archivos se leen sólo en las líneas que el grafo ya ubicó. `GRAPH_REPORT.md` es para una mirada de arquitectura. Un subagente que explora código puede armarse el suyo al empezar.
- **Las docs y las imágenes** entran sólo con `/graphify .` en Claude Code: esa pasada sí usa un LLM y gasta tokens; lo normal es el modo sin costo.
- **Hooks de git, sólo en el checkout principal** (`graphify hook install`, puestos en esta máquina el 2026-10-22): después de un commit, un merge o un checkout ahí, el grafo se rehace solo en segundo plano (de 20 a 60 s; el registro está en `~/.cache/graphify-rebuild.log`). En un worktree vinculado los hooks no hacen nada: el grafo es del checkout principal y cada worktree arma el suyo con `graphify update .`. Para saltarlos en un comando: `GRAPHIFY_SKIP_HOOK=1`; para sacarlos: `graphify hook uninstall`.
