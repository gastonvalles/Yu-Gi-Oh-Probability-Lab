# YGOUltraLab

## Diseño

@docs/ux-ui-guidelines.md

Las reglas visuales, los componentes y los tokens están en `docs/design-system.md`; el catálogo vivo es `/playground`
(`docs/playground.md`): todo cambio de diseño se prueba ahí primero y después se lleva a las pantallas.

## Retomar el trabajo

Si arrancás sin contexto previo (otra PC, sin la memoria de Claude), leé `docs/retomar.md`: dónde quedó el rediseño, los pendientes, las decisiones en pie y el lienzo de prototipos.

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
- **Tests livianos** (Gastón, 2026-10-21: «podemos usar jest… lo que los haga más rápidos y livianos»; medido: Jest no acelera lo que pesa —el cuerpo de los tests es el mismo y migrar 258 archivos es caro—, se queda Vitest): mientras se itera se corre **sólo lo que se toca** (`npx vitest --run src/__tests__/<archivo>` o `npx vitest related <archivos> --run`) y la suite completa (`npm test`, ~80 s: corre en `vmForks`, ver `projects` en `vite.config.ts`; un solo archivo, `duel-screen.test.tsx`, es casi todo ese tiempo) **una sola vez al cierre**. Cada suite abre ~15 procesos: con **tres o más agentes a la vez** se corre con `VITEST_MAX_WORKERS=6` (varios timeouts «por carga» —`playground`, `replays-screen`, `expansions-memo`— eran de esto, no de un bug). Va en el brief de todo agente.

## Notas del parche: cada cosa que se termina se le explica a los usuarios

Gastón (2026-10-21): siempre que se termina algo (una PR mergeada o una tanda), además del reporte técnico, el orquestador escribe una **explicación instructiva y resumida, como las notas de un parche de un juego**, dirigida a los **usuarios de la página** (no a quien programa): qué hay de nuevo o cambió, dónde se ve y cómo se usa.

- **Tono:** voseo, directo, en segunda persona («ahora podés…», «tocá…»), como si le hablaras a quien juega o arma su deck. Nada de nombres de archivos, componentes, tokens ni números de PR.
- **Formato:** un título con el nombre de la novedad y, debajo, **Novedades** (lo que ahora se puede hacer, en viñetas cortas), **Cómo se usa** (2 a 4 pasos, sólo si hay algo que aprender), **Cambios y arreglos** (lo que ya andaba y ahora anda mejor) y **Ojo** (límites conocidos, sólo si los hay). Una novedad = unas pocas líneas; si son varias, un parche con un bloque por cada una.
- **Dónde va:** en el reporte final a Gastón y arriba del cuerpo de la PR bajo el título «Notas del parche». Lo técnico (archivos, decisiones, pruebas) sigue aparte, debajo.
- **Verdad antes que brillo:** sólo se cuenta lo que se verificó que anda; los límites van en «Ojo». Un arreglo interno que el usuario no nota (un test, un refactor) se menciona en una línea o no se menciona.
