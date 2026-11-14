# Movimiento

Cómo se anima sin trabar la app (la mesa, en un celular); la base, en `CLAUDE.md`.

## Curvas

Nada va en `linear`, salvo el reloj, un anillo que se barre, lo que gira sin fin y el parallax. Tres curvas (su uso, en `app/motion.ts`): `--ease-out`, `--ease-in-out` y `--ease-snap`. Excepciones: la gravedad de la moneda y el dado (`--ease-gravedad-*`), el golpe (`--ease-golpe`), la invocación (`--ease-llegada`/`-revelar`) y los bucles. En el JS, sus espejos (`EASE_*`); en un `@keyframes`, el valor literal. Con rebote, sólo `--ease-out-back` y `--ease-rebote-*`.

**El campo se mueve sólo a propósito** (la sacudida de un impacto, `app/field-impact.ts`, que se termina antes de medir la mesa); sin querer, es un bug. **Lo que entra y sale barre o rebota desde su lado, nunca en diagonal** (`index.css`); con movimiento reducido, fundido.

## La mesa: nada en el hilo principal

- Los efectos de un paso se fijan en el mismo dibujo de la jugada (`nextFxStep`), nunca en un efecto: un `setState` ahí redibuja la mesa con los vuelos en el aire.
- Un número que cuenta escribe por ref (`useLifeNumber(…, ref)`); su golpe, su «−N» y su barra (`scaleX`) arrancan en el mismo cuadro; un reloj de segundos es una hoja con su tick (`RoundClock`); lo que sigue al dedo, en un `requestAnimationFrame`; medir el DOM, en una fase de lectura y otra de escritura.
- La mesa es `memo` y compara `duel` y `duel.auto` campo por campo: lo que le pasa una pantalla va con `useMemo`/`useCallback`, nunca inline.

## Cartas en el compositor

- Sólo se anima `transform`/`translate`/`scale`/`rotate` y `opacity`, en `replace`: `composite: 'add'` no se compone. Dos movimientos, en dos elementos (afuera vuela, adentro gira).
- Un aro, sombra o destello es una capa ya dibujada que anima `opacity`/`scale` (`fx-ring`), nunca `box-shadow` en un keyframe, y ninguna carta ni casilla transiciona `box-shadow` ni el color del borde (`filter` sí: gris y atenuado, en `CARD_TRANSITION`; Chromium lo compone).
- La jugada de una sola carta a la vista que cruza la mesa vuela en 3D (`app/card-lift.ts`): afuera el camino y la subida, adentro la inclinación, y brillo, sombra y polvo como capas. Derechos: reparto, barajado, mano, lotes, cartas ocultas y la que llega con dos en el aire. Con movimiento reducido, un fundido.
- Ningún vuelo se corta: una jugada con cartas en el aire las retoma. Una animación que termina se cancela (`cancelWhenDone`): si no, la GPU deja sin componer las transiciones de `transform` siguientes.
- Una marca no late para siempre (dos o tres veces y queda quieta); la cadena, hasta resolver.
- Lo que se mueve sin parar anima `transform` o `rotate` en su propio elemento, nunca una `@property` ni una variable (repinta en cada cuadro). La estela de un ataque (`ChevronTrail`) es un solo fondo con el halo dibujado que corre con `translate` (`animate-chevrons`): sin `filter` ni `box-shadow` en lo que se mueve o escala.

## Entrar y salir

- Lo que entra en tanda va con `stagger`; un `fixed` adentro de eso se corre: va por portal.
- **Lo que se cierra también sale** (`app/use-presence.ts`). Trampas: `<Presence>` sola no anima (el hijo llama a `usePresence`, o pasa por `Modal` / `SideDrawer` con `isOpen={!useLeaving()}` y ata Escape, el scroll y el foco a `!leaving`); una `key` que cambia al cerrar, un `return null` antes del `Modal` o una entrada sin su fotograma en `EXITS` matan la salida (para esconder sin cerrar, `hidden`).
- **Invocar del Extra o un Ritual** (`app/summon-entrance.ts`) frena el duelo hasta que se va su velo (`onEntering`).
- **La cadena en grande** (`ChainNotice.tsx`), sólo al encadenar; al resolver se funde (0,2 s) y quedan los medallones (`ChainBadge`). Ritmo: `chainDwell`, que sus gestos (`CHAIN_BEAT_MS`) no alargan. **Flipbooks** (`app/flipbooks.ts`): una imagen, `steps()` sobre `translate`.
- **Sin animar, a propósito:** las cubiertas del duelo, los carteles con temporizador (el turno, la moneda y el dado, los avisos), lo que despliega en el flujo (`InfoTip`, `MultiSelect`, `<details>`) y lo que cierra navegando.
