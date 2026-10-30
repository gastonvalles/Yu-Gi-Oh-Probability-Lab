# Movimiento

Cómo se anima sin trabar la app (sobre todo la mesa, en un celular). La regla de base está en `CLAUDE.md` («Estilos»): sólo `transform`/`translate`/`opacity`, todo con `motion-reduce:`.

## Curvas

Nada va en `linear`, salvo el reloj, un anillo que se barre, lo que gira sin fin y el parallax. Tres curvas, no más: `--ease-out` para lo que entra o se queda, `--ease-in-out` para lo que viaja (vuelos, barajado, el ataque) y `--ease-snap` para lo que arranca ya en movimiento (pops, lo que suelta un gesto, la moneda, las medallas). Excepciones: la gravedad de la moneda y el dado (`--ease-gravedad-*`) y los bucles (`ease-in-out` de CSS). En el JS, `EASE_OUT`, `EASE_IN_OUT` y `EASE_SNAP` de `app/motion.ts` (la Web Animations API no lee `var()`); en un `@keyframes`, el valor literal. Lo vigila `motion-curves.test.ts`.

## La mesa: nada en el hilo principal

- Los efectos de un paso se fijan en el mismo dibujo de la jugada (`nextFxStep`), nunca en un efecto: un `setState` ahí vuelve a dibujar la mesa con los vuelos en el aire (`practice-mat-renders.test.tsx`).
- Un número que cuenta escribe por ref (`useLifeNumber(…, ref)`); un reloj de segundos es una hoja con su tick (`RoundClock`); lo que sigue al dedo, en un `requestAnimationFrame`; medir el DOM, en una fase de lectura y otra de escritura.
- La mesa es `memo` y compara `duel` y `duel.auto` campo por campo: lo que le pasa una pantalla va con `useMemo`/`useCallback`, nunca inline (`auto-screen-renders.test.tsx`).

## Cartas en el compositor

- Sólo se anima `transform`/`translate`/`scale`/`rotate` y `opacity`, en `replace`: `composite: 'add'` no se compone (sólo sobre una carta que ya vuela, `flying`). Dos movimientos van en dos elementos (el de afuera vuela, el de adentro gira).
- Un aro, sombra o destello es una capa ya dibujada que anima `opacity`/`scale` (`fx-ring`); nunca `box-shadow` en un keyframe (`motion-rings.test.ts`, `motion-compositor.test.ts`), y ninguna carta ni casilla transiciona `box-shadow`, `filter` ni el color del borde.
- Ningún vuelo se corta: una jugada con cartas en el aire las retoma. Una animación que termina se cancela (`cancelWhenDone`): si no, la GPU deja sin componer las transiciones de `transform` siguientes de esa carta.
- Lo que se mueve sin parar anima `transform` o `rotate` en su propio elemento, nunca una `@property` ni una variable (recalcula estilos y repinta en cada cuadro).

## Entrar y salir

- Lo que entra en tanda va con `stagger`; un `fixed` adentro de eso se corre (el `transform` lo vuelve su bloque contenedor): va por portal.
- **Lo que se cierra también sale** (`app/use-presence.ts`). Trampas: `<Presence>` sola no anima (el hijo llama a `usePresence`, o pasa por `Modal` / `SideDrawer` con `isOpen={!useLeaving()}` y ata Escape, el scroll y el foco a `!leaving`); una `key` que cambia al cerrar, un `return null` antes del `Modal` o una entrada sin su fotograma en `EXITS` matan la salida (para esconder sin cerrar, `hidden`).
- **Sin animar, a propósito:** las cubiertas del duelo, los carteles con temporizador (el turno, la moneda y el dado, los avisos), lo que despliega en el flujo (`InfoTip`, `MultiSelect`, `<details>`) y lo que se cierra navegando.
