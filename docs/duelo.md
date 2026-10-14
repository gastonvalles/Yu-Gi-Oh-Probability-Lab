# Duelo con un amigo

Dos personas juegan la mesa de práctica una contra la otra, cada una en su dispositivo (celular y PC, o dos celulares), entrando con un enlace. No hay cuentas, ni base de datos, ni reglas automáticas: es una mesa manual compartida, como DuelingBook. El relay que junta a los dos está en `duel-relay/` (ver `docs/duelo-relay.md`).

## Cómo se ve

El paso `#duel` ("Duelo con un amigo", en las herramientas del menú) **sólo se ofrece donde la app sabe a qué relay conectarse**: la variable `VITE_DUEL_RELAY_URL` (`wss://…workers.dev`). Sin ella el menú no lo muestra y abrir `#duel` dice que todavía no está disponible. La variable se lee al compilar: cargarla en Vercel exige volver a desplegar.

1. **Lobby**: nombre (se recuerda), con qué deck se juega (el del builder, o uno que se pega: un enlace `ydke://` o un `.ydk`, que es lo que deja entrar desde un celular sin deck armado; el último pegado se recuerda y, con el builder vacío, se usa solo), los puntos de vida (8000 o 4000; sólo cuenta lo que elige quien crea) y "Crear un duelo" o "Unirme" pegando el enlace entero o el código de 8 letras y números.
2. **Sala**: el enlace para el rival (copiar o compartir), quién está, y "Repartir mi mano" cuando están los dos.
3. **Mesa**: la de la práctica con el campo del rival espejado arriba (las dos Extra Monster Zone compartidas en el centro), los puntos de vida de los dos, de quién es el turno, el reloj de la ronda compartido y la conexión. La mano del rival se ve como dorsos (sólo se cuenta); lo que no está a la vista, no viaja.
   - El reloj de 50 minutos arranca solo cuando los dos repartieron y **no se puede reiniciar a mano** (sólo pausar y reanudar).
   - El turno cuenta los pases de los dos. La carta del turno se roba cuando empieza el turno propio (el rival pasó el suyo): la mesa del duelo no roba sola al pasar (`skipDraw` en la jugada de fase), así el segundo roba en su primer turno y el primero no roba de más.
   - **Atacar** / **Ataque directo** en la Battle Phase (la mesa no cuenta el daño); el rival ve un aviso grande en el centro con quién ataca a quién.
   - El botón **+** agrega una ficha, o pone y quita contadores (tocando cartas hasta "Listo"; arrastrar el + sobre una carta le pone uno).
4. **Panel "Moneda, dado y más"**: moneda y dado (los dos ven la misma tirada), piedra-papel-tijera (el rival no ve tu elección hasta que elegís la tuya), quién empieza, señales rápidas, rendirse (con confirmación) y un registro de lo último que pasó. Lo que hace el rival se avisa aunque el panel esté cerrado.
5. **Final**: pierde quien se queda sin puntos de vida o se rinde. El cartel del resultado trae la **revancha**: cuando los dos la piden, se limpia la mesa, los puntos y el reloj, y cada uno vuelve a repartir en la misma sala.

Es para jugar con amigos: no está pensado contra quien mire el tráfico de red (ver "Qué ve el rival").

## Cómo está armado

```
src/app/mat-public.ts      la mesa pública: ids opacos, qué ve el rival, jugadas con ids opacos, espejo (puro)
src/app/duel-protocol.ts   los mensajes y su validación (todo lo que llega es dato de otra persona)
src/app/duel-session.ts    createDuel(transport, opciones): mi mesa, el espejo del rival, vidas, reloj, juegos, revancha
src/app/duel-socket.ts     el transporte por WebSocket: reconexión, latido, visibilitychange
src/app/duel-relay-rules.ts lo que comparten el cliente y el relay (código de sala, límites)
src/app/duel-games.ts      moneda, dado, piedra-papel-tijera, quién empieza, señales, resultado
src/app/duel-deck.ts       lee un deck de ydke:// o .ydk
src/app/duel-link.ts, duel-turn.ts, use-duel.ts   el enlace, de quién es el turno, el gancho de React
src/components/duel/       DuelScreen (lobby, sala, mesa), DuelBar, DuelGames, DuelDeckPicker, DuelTable
duel-relay/                el Worker + Durable Object de Cloudflare (ver docs/duelo-relay.md)
```

La mesa sigue siendo `matReducer` (puro y determinista) y cada jugada es una `MatAction` serializable. Cada jugador mueve sólo sus cartas, así que no hay edición simultánea sobre lo mismo: **cada lado aplica las jugadas del otro a un espejo de su mesa** con el mismo reductor, y por eso los dos quedan iguales.

### Mensajes (`duel-protocol.ts`)

| Mensaje | Para qué |
| --- | --- |
| `hello` | quién soy (`sid` cambia si recargo), el rol y, del anfitrión, los ajustes |
| `sync` | mi mesa de ahora (enmascarada), lo que ya sabés de ella, mis puntos de vida y, del anfitrión, el reloj; arranca, reconecta y repara |
| `act` / `undo` | una jugada mía o el "volver atrás"; `n` cuenta las que llevo |
| `life` / `clock` | mis puntos de vida (siempre el valor) y el reloj compartido (gana el anfitrión) |
| `game` | moneda, dado, piedra-papel-tijera, quién empieza, señales, rendirse, revancha (número de secuencia propio) |
| `resync` | me perdí algo: mandame un `sync` |

Un mensaje repetido o viejo se ignora (por su número); uno que falta pide un `sync`. El protocolo está en la versión 1: un cliente viejo ignora los mensajes que no conoce.

### Qué ve el rival

Las cartas de la mesa llevan en su id la identidad de la carta (`card-123-2`), así que **por la red viajan con ids opacos** (`c1`, `c2`…). El rival sólo sabe qué carta es una cuando está donde puede verla (campo boca arriba, cementerio, destierro boca arriba, materiales Xyz) o cuando se la muestran (revelar, declarar, activar): una carta se manda una sola vez (`reveal` en cada jugada). Su mano, su deck y lo boca abajo son sólo ids opacos. No impide que alguien abra las herramientas del navegador y mire el tráfico.

### Reconexión

Safari en iOS suspende los WebSockets al bloquear la pantalla. El cliente reintenta con espera creciente, despierta con `visibilitychange` y `online`, y al volver pide un `sync`. Si el rival **recarga** la página, su mesa se pierde: vuelve a la sala y reparte otra mano (su elección de piedra-papel-tijera y su pedido de revancha se le repiten).

## Probarlo

Con dos pestañas del navegador, una creando y otra uniéndose con el enlace:

1. Un relay local: `docs/duelo-relay.md` (`wrangler dev --local`, con tu origen en `ALLOWED_ORIGINS`), o el publicado.
2. La app: `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788 npm run dev` (para el relay publicado, su dirección `wss://…`; el relay publicado sólo acepta los orígenes de `duel-relay/wrangler.jsonc`: `localhost:5173` y `127.0.0.1:5173` sirven).
3. Cada pestaña necesita un deck: el del builder, o pegar un enlace `ydke://`. El origen es nuevo para cada puerto, así que no comparte lo guardado.

Los tests de la pantalla juegan duelos completos de dos jugadores sobre una sala en memoria (`src/__tests__/support/memory-room.ts`); `duel-relay.e2e.test.ts` juega uno contra un relay de verdad y sólo corre con `VITE_DUEL_RELAY_URL` definida (no corre en el CI; con la variable en un `.env.local` el resto de `npm test` también lo intentaría).

En **Windows**, `wrangler dev` levantado varias veces en una sesión deja procesos `workerd` colgados que traban los archivos del estado y el relay deja de contestar (la página queda en "Conectando…"): apagalos todos y levantá uno solo con otra carpeta en `--persist-to`.

## Qué se descartó a propósito

El chat de DuelingBook casi no cuenta jugadas (sólo declarar efecto, moneda, dado y ofertas), así que no hay un registro compartido de las jugadas de la mesa: se ven en el tablero. Tampoco hay espectadores, guardar el duelo como replay, ofertas de empate, revelar de forma persistente, elegir el objetivo del ataque tocando el monstruo del rival (se elige en el menú, que anda bien en el celular), chat libre, siding, torneos ni cuentas.

## Para no repetir un error

Los problemas de layout (un elemento de 0 px, una barra que queda debajo del borde de la ventana) **no aparecen en los tests de jsdom**: hay que medir con `getBoundingClientRect` en un navegador a tamaño de celular (416×734). Así aparecieron la mano del rival aplastada por la columna que scrollea y la barra de abajo de la mesa fuera de pantalla.
