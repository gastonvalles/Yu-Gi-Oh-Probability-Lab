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
