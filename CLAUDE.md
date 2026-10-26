# YGOUltraLab

## Diseño

@docs/ux-ui-guidelines.md

Reglas visuales, componentes y tokens: `docs/design-system.md`. El catálogo vivo es `/playground`: todo cambio de diseño se prueba ahí primero y después se lleva a las pantallas.

## Repo público y AGPL

El repo es público y la licencia es la AGPL-3.0-or-later (`LICENSE`, `NOTICE.md`; la app ofrece el código desde su menú y `licencia.test.tsx` lo vigila): nada de secretos, mails ni datos personales en commits, documentos, comentarios ni cuerpos de PR (también se ven), y lo que no es nuestro (imágenes de Konami, datos sin licencia) no se sube. Cambiar la licencia es decisión de Gastón.

## Retomar el trabajo

Sin contexto previo (otra PC, sin la memoria de Claude), leé `docs/retomar.md`: cómo arrancar, las decisiones en pie, lo pendiente y la forma de trabajo.

## Documentación

Pocos documentos, cada uno con su trabajo, y **no son un diario**: el historial es `git log` y el cuerpo de cada PR.

- `README.md` (qué es, cómo se corre, dónde está cada cosa) y `PRODUCT.md` (para quién es y el tono).
- `docs/`: `retomar.md`, `design-system.md` (reglas, tokens, componentes y el catálogo `/playground`), `ux-ui-guidelines.md`, `duelo.md`, `duelo-relay.md`, `motor-de-cartas.md`, `duelos-automaticos.md`, `i18n.md` y `seguridad.md`.
- **Un renglón se queda sólo si** un test o el código lo hace cumplir, **o** dice algo que no se ve leyendo el código (una decisión, regla, trampa o límite, con su porqué), **o** orienta (dónde vive algo, cómo se corre). Lo demás sobra: lo que ya dice el comentario del archivo, la historia, las citas, las mediciones.
- **Se toca un doc sólo si cambia una regla, un componente o un comportamiento**, en una o dos líneas y donde corresponde: sin entradas con fecha ni números de PR. Los planes y los informes de una sola vez se borran al cumplirse (quedan en git; los de antes de la poda, en el commit `e4b63f6`).
- `src/__tests__/docs.test.ts` le pone un tope de tamaño a cada doc, no deja ninguno huérfano y revisa que toda ruta `docs/….md` exista.

## Orquestación: este chat coordina, los subagentes trabajan

Decisión de Gastón (2026-10-20): el chat principal es el **orquestador**. Reparte el trabajo en subagentes (herramienta `Agent`), junta lo que cada uno le reporta y le cuenta a Gastón el resultado. Lo trivial (una línea, un archivo que ya está abierto, el `git` de un cierre) lo hace él directo: lanzar un agente cuesta más.

| Tarea | Agente (`subagent_type`) | Modelo (`model`) |
|---|---|---|
| **Buscar y leer código rápido**: dónde está algo, qué hace, quién lo usa, qué tests lo cubren, cómo lo resuelve otro sitio | `Explore` (o `general-purpose` si tiene que correr algo) | `sonnet` (Sonnet 5.5) |
| **Cambios mecánicos y livianos**: renombrar o mover, claves de i18n, ajustar un test o un doc, repetir un patrón ya decidido | `general-purpose` | `haiku` |
| **Planificar y diseñar**: arquitectura, diseño de una pantalla o un componente, plan de varios pasos, crítica de diseño (y construir lo que es de diseño) | `Plan` (sólo el plan) o `general-purpose` (plan y construcción) | `opus` (Opus 5.5) |

- **Esfuerzo `high` y a lo sumo 3 agentes a la vez** (Gastón, 2026-10-26): todo subagente se lanza con `effort: "high"`; nunca más de tres simultáneos.
- **Fable (`fable`) se sugiere, no se usa solo:** en un caso específico (un bug que ya falló dos intentos, un cambio que cruza varias capas, una decisión difícil de revertir, una revisión de seguridad, una arquitectura con mucha incertidumbre) el orquestador le propone a Gastón usar Fable, con la razón en una línea, y espera el sí antes de lanzarlo.
- **El brief es todo lo que el agente sabe:** el objetivo con las palabras de Gastón, lo que ya se hizo o se descartó, los archivos que importan (con ruta), la rama y el worktree donde trabaja (desde `origin/main`; no `isolation: "worktree"`, que parte del checkout principal, que puede estar atrasado), las reglas del repo que le tocan y el formato del reporte. Sin un brief claro no se lanza.
- **Reporte quirúrgico:** cada agente devuelve un resumen corto —qué hizo o encontró, `archivo:línea`, decisiones y por qué, riesgos o lo que dejó afuera, y el resultado de `typecheck`, `lint`, `test` y `build` si tocó código—, sin volcar archivos ni logs.
- **El orquestador verifica antes de contar:** mira el diff y corre lo que sea barato (no da por hecho lo que el agente dice haber hecho) y recién entonces le reporta a Gastón en pocas líneas: qué quedó, qué falta y qué decisión le toca a él. **Una sola verificación por PR** (Gastón, 2026-10-26): el constructor mide una vez en la app real y con números; el orquestador revisa el diff y corre `typecheck`, `lint` y `docs.test.ts`, sin repetir la medición.
- **Lo que sale del repo lo hace el orquestador** (push, PR, merge), con las reglas de siempre: mergear sin esperar el CI y sin atribución a Claude. Los agentes trabajan en su worktree y dejan el commit local hecho.
- **En paralelo sólo lo que no toca los mismos archivos;** si no, uno atrás del otro.
- **Un mismo test que se reintenta 2 veces, se frena** (Gastón, 2026-10-21): si el orquestador o un agente corre de nuevo el mismo test dos veces porque falla o se comporta distinto, para y reporta en resumen el problema (qué test, qué dice el fallo, qué se probó) en vez de seguir reintentando; si no, sigue. Va en el brief de todo agente.
- **Cuántas PR lo dice Gastón en cada pedido:** «hacé una sola PR» = las ramas de los agentes se juntan en una y se sube una única PR; «una PR por pieza, de la más barata a la más cara, y mergeá cada una por separado» = eso. Sin indicación, una PR por tarea.
- **Tests livianos** (Gastón, 2026-10-21): mientras se itera se corre **sólo lo que se toca** (`npx vitest --run src/__tests__/<archivo>` o `npx vitest related <archivos> --run`) y la suite completa (`npm test`, ~50 s) **una sola vez al cierre**. Cada suite abre ~15 procesos: con **tres agentes a la vez**, `VITEST_MAX_WORKERS=6` (los timeouts «por carga» de `playground`, `replays-screen` o `expansions-memo` eran de eso, no de un bug). Un test nuevo que pase de ~20 s se parte, como `duel-screen-*` y `practice-mat-*` (con el arnés común en `src/__tests__/support/`). No se migra a Jest: no acelera lo que pesa. Va en el brief de todo agente.

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
