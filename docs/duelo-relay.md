# Relay del duelo por enlace

El duelo por enlace junta a dos jugadores, cada uno en su dispositivo, por un **relay**: un servidor chico que reenvía los mensajes de uno al otro. Vive en `duel-relay/` y corre en Cloudflare (un Worker más un Durable Object por sala).

## Qué hace y qué no

- Una sala por código de 8 letras, de **dos** jugadores y hasta **dos espectadores**. El tercer jugador, o el tercer espectador, recibe "sala llena" (un jugador no ocupa el lugar de un espectador ni al revés).
- **Una sala se cierra del todo** cuando un jugador cierra su conexión con el código `CLOSE_ROOM_OVER` (4400): el relay avisa a los que quedaban (un aviso binario `gone`) y los corta con `CLOSE_GONE` (4002), y a quien llegue después —a jugar o a mirar— le manda el mismo aviso y lo corta, sin dejarlo ver nada. Sólo guarda una marca de que la sala se cerró (sin datos de nadie), que se borra sola a la hora (una alarma del Durable Object). Un espectador no puede cerrar una sala. Es lo que usa la app cuando el duelo terminó y el rival se fue (ver `docs/duelo.md`): sin esto, el que se queda dejaba la sala abierta con un solo jugador y un tercero con el enlace entraba y veía su mesa. Quien cierra una sala ajena con ese código sólo cierra una sala en la que ya estaba.
- Reenvía cada mensaje de texto sin leerlo ni guardarlo. **No hay base de datos**: la sala existe mientras haya conexiones.
- Avisa a cada jugador cuando el otro entra o sale, y cuántos espectadores hay, con mensajes binarios (los jugadores no pueden mandar binarios, así nadie puede hacerse pasar por el relay).
- **Espectadores** (`?role=spectator` en la conexión): reciben el texto de los dos jugadores, cada mensaje precedido de quién lo mandó (un `0` o un `1` que asigna el relay por orden de llegada; un jugador que reconecta con su identidad conserva el suyo) y un aviso binario de cuántos jugadores hay. **No pueden hacer nada**: lo que manden no llega a ningún jugador y los desconecta (código 1008), salvo la palabra `resync`, que pide a los jugadores que repitan su estado (los jugadores lo reciben como un aviso binario de espectadores con `sync`; el relay lo deja pasar como mucho cada dos segundos por espectador). Al entrar uno, los jugadores reciben ese mismo aviso para que lo pongan al día.
- **Topes para los espectadores** (un enlace de espectador usado en bucle no tiene que hacer trabajar a los jugadores ni al relay): entre todos los de una sala, seis entradas seguidas y después una cada dos segundos (lo que pase se rechaza con un 429, sin abrir la conexión, y el cliente espera más cada vez); los jugadores reciben el pedido de que repitan su estado en una ráfaga de tres y después uno cada dos segundos, entren o pidan quienes pidan; y un espectador que pide el estado de más diez veces seguidas se desconecta (1008).
- Límites: 16 KB por mensaje, 30 mensajes por segundo (ráfaga de 60), y solo acepta conexiones de las páginas listadas en `ALLOWED_ORIGINS`. Lo que se pasa se cierra con un código (1003 binario, 1009 enorme, 1008 ritmo).
- Contesta el latido (`ping` → `pong`) sin despertar la sala, que hiberna entre mensajes.
- **Duelos públicos en vivo** (`POST /rooms/live?room=CODIGO`, y `live` en la respuesta de `GET /rooms`): cuando llega el rival a una sala **pública**, su anfitrión avisa cada minuto (`LIVE_HEARTBEAT_MS`) que el duelo sigue en vivo y cuántos lo miran (0 a 2, el tope de espectadores del relay; lo que él dice, revisado con `parseWatchers`), con el mismo token con que anotó la sala. La sala pasa de la lista de las que esperan rival a la de los duelos en vivo (`RoomRegistry.markLive` / `listLive`); si el anfitrión deja de avisar, vence a los 3 minutos (`LIVE_DUEL_TTL_MS`) y, aunque siga avisando, a las 4 horas (`LIVE_DUEL_MAX_MS`); si el rival se va, vuelve a las que esperan. **Qué se publica:** el nombre del anfitrión, el formato, Single o Match, el reloj, cuántos miran y desde cuándo; **y el nombre de quien juega contra el anfitrión** (`guest`, opcional: lo manda el anfitrión en cada aviso, limpio con `cleanPlayerName` como el suyo, para que la arena diga «Ana vs Beto»; un anfitrión de antes no lo manda y la arena sólo dice quién juega). Es lo único de quien entró que se publica, y sólo de un duelo **público** en vivo (aceptó entrar a una sala pública; su nombre sale cuando el duelo está en vivo y se va con él). Nada de lo que pasa en la mesa. **Una sala privada nunca se anota**: sólo la lista lo que su anfitrión eligió publicar. Sigue sin leer las salas ni los mensajes.
  - **Compatibilidad entre versiones** (los dos lados se despliegan por separado y ninguno rompe al otro): Los relojes que acepta una sala pública incluyen el 50 (el de hoy, junto con sin tiempo) y los de antes (20, 40, 60, 90), y la info de una sala suma `genesysCap` (opcional, 1 a 999, sólo en Genesys; mal escrito se ignora en vez de rechazar la sala): un relay de antes lo descartaría y rechazaría un reloj de 50, así que conviene publicar el Worker (`npx wrangler@4 deploy`) antes que el sitio. `GET /rooms` sigue trayendo `rooms` con lo de siempre y suma `live` **aparte**, así que un cliente de antes (que sólo lee `rooms`) no ve los duelos en vivo ni los toma por salas a las que entrar. Un cliente nuevo con un relay de antes recibe `{ rooms }` sin `live` (ningún duelo en vivo que mostrar) y su aviso a `/rooms/live` no se registra (ese relay contesta 200 con un texto o lo bloquea CORS: la app sólo da por buena la respuesta `{ result: 'ok' }`); entonces baja la sala al llegar el rival, como siempre. Por eso no importa el orden: conviene publicar primero el Worker (`npx wrangler@4 deploy`) y después el sitio, pero hasta que se publique el Worker la lista de duelos en vivo está vacía y no se rompe nada.
- Cuenta, sin datos de nadie, `room_opened` (entra el primer jugador), `room_paired` (llega el segundo) y `room_watched` (entra un espectador). No registra el código de la sala ni direcciones: el registro de cada petición (que traería el código en la dirección y la IP de quien se conecta) está apagado en `wrangler.jsonc` (`observability.logs.invocation_logs: false`).

- **Salas públicas** (`GET /rooms`, `POST /rooms?room=CODIGO`, `POST /rooms/close?room=CODIGO`): una lista aparte de las salas abiertas, en un solo Durable Object (`RoomIndex`, con la lista entera en su almacenamiento; migración `v2`). El relay sigue sin leer las salas: el anfitrión anota la suya al crearla (su nombre, Single o Match, formato, reloj y siding, revisados con `parsePublicRoomInfo`) con un token que sólo él conoce, y la baja con ese token cuando llega el rival, sale o cierra la pestaña; la que nadie baja vence a los 30 minutos (`PUBLIC_ROOM_TTL_MS`). Tope de 100 salas, de ritmo por dirección (una anotación cada cinco segundos; la dirección sólo se mira, no se guarda) y sólo desde los orígenes de `ALLOWED_ORIGINS`. Los POST llevan el JSON como texto plano para no necesitar consulta previa de CORS. Lo que la lista trae del anfitrión (su nombre) lo escribe él: la app lo muestra como texto. Es la lógica de `RoomRegistry` (`duel-relay-rules.ts`, probada sin red); la app la lee con `duel-rooms.ts`.
El código de la app que lo usa está en `src/app/duel-socket.ts` (cliente con reconexión) y `src/app/duel-relay-rules.ts` (lo que comparten los dos lados).
- **Sala fantasma si la dirección pierde la sala por afuera** (Gastón, 2026-10-19: «salgo de la sala, la misma no desaparece sino que queda fantasma»): bajar la sala al «salir» depende de que `DuelScreen` se entere de que ya no hay sala, y eso pasaba sólo al tocar la X (`leave()`) o al cambiar de pestaña (la pantalla se desmonta entera). El cambio de dirección del navegador (atrás, o pegar `#duel` sin sala) también saca la sala de la URL, pero el oyente de `hashchange` sólo actualizaba la sala cuando la dirección **traía** una (`if (next) …`); sin sala, no hacía nada y la app seguía creyendo que estaba adentro: la conexión del relay quedaba abierta y el aviso a la lista (`register`/el latido de `live`) se seguía repitiendo solo, sin bajarse nunca. Quien volvía a tocar esa sala desde la arena (siendo el propio anfitrión, que no debería poder) se encontraba con esa conexión vieja todavía viva adentro, con la configuración de otra sesión, y a los pocos segundos el relay cortaba la mezcla. Arreglado en `DuelScreen.tsx` (el oyente también vacía la sala cuando la dirección se queda sin una).

## Estado

**Publicado de nuevo el 2026-10-19** (versión `467ef51c`) con el cierre de la sala (`CLOSE_ROOM_OVER` / `gone`, arriba): la prueba de integración `duel-relay.e2e` (el caso de la sala que se cierra, el de unir a dos jugadores y el de la sala llena) pasó contra `wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`. Un cliente anterior al cierre sigue andando con este relay (para él es un cierre más), y este cliente con un relay anterior también (lo único que no hace el relay viejo es cortar a los demás y rechazar entradas a la sala cerrada).

Publicado el 2026-10-16 en `https://ygo-lab-duel-relay.gastonvallesyeou.workers.dev` con la lista de salas públicas (migración `v2`, PR #270); el sitio lo usa con `VITE_DUEL_RELAY_URL` cargada en Vercel (todos los entornos). Hay que volver a publicarlo (`npx wrangler@4 deploy`) cuando cambie `duel-relay/` **o `src/app/duel-relay-rules.ts`** (el Worker lo empaqueta).

## Probarlo en tu máquina (sin cuenta)

```bash
cd duel-relay
npx wrangler@4 dev --local --port 8788 --var "ALLOWED_ORIGINS:http://localhost:5173"
```

En **Windows**, si falla con `SQLITE_CANTOPEN`, es el límite de 260 caracteres de la ruta: apuntá el estado a una ruta corta con `--persist-to C:/tmp/relay`.

Con el relay levantado, la prueba de integración (no corre en el CI) juega un duelo completo con una caída de la conexión y prueba a los espectadores (el límite de dos, que no puedan mandar, las etiquetas, el pedido de estado y los topes de entradas y de pedidos):

```bash
DUEL_RELAY_E2E_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e
```

## Publicarlo (lo hacés vos, con tu cuenta de Cloudflare)

1. `cd duel-relay && npx wrangler@4 login` (abre el navegador; la cuenta gratuita alcanza).
2. Si tu sitio no es `yu-gi-oh-probability-lab.vercel.app`, ajustá `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` (separados por coma; `*` vale por letras, números y guiones, para los despliegues de prueba de Vercel). Los de prueba se aceptan sólo con el nombre del proyecto y el del equipo (`yu-gi-oh-probability-lab-*-gastonvalles-projects.vercel.app`): el nombre de otra cuenta que empiece igual no pasa. Esto frena el abuso desde otras páginas; no es seguridad (cualquier cliente que no sea un navegador puede mandar el encabezado que quiera).
3. `npx wrangler@4 deploy`. Devuelve una dirección como `https://ygo-lab-duel-relay.<tu-subdominio>.workers.dev`.
4. En Vercel, agregá la variable de entorno **`VITE_DUEL_RELAY_URL`** con esa dirección en `wss://` (`wss://ygo-lab-duel-relay.<tu-subdominio>.workers.dev`) y volvé a desplegar.
5. La política de seguridad de `vercel.json` permite sólo la dirección exacta del relay (`wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`, en sus dos reglas): si publicás el Worker con otro nombre o subdominio, cambiala ahí (y `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` si cambia el sitio), o el navegador bloqueará la conexión.

Al publicar una versión con espectadores, publicá **primero el relay**: un enlace de espectador abierto contra un relay anterior lo trataría como a un jugador (la app lo detecta y no lo usa, pero ocupa un lugar un instante).

Revisá en el panel de Cloudflare los límites vigentes del plan gratuito para Durable Objects y Workers antes de abrirlo al público.

## Ver cuánto se usa

En el panel de Cloudflare, Workers → `ygo-lab-duel-relay` → Logs: buscá los eventos `room_opened` y `room_paired`. Su cociente dice cuántas salas llegan a juntarse de a dos, que es la medida de si el duelo por enlace se usa de verdad.

## Cosas a saber

- Un mensaje de un jugador nunca se interpreta: el relay no sabe nada de cartas ni de reglas.
- Si un jugador se cae, el otro lo ve ausente; al volver, los dos se dan la mano de nuevo y el estado se repone solo (`hello` + `sync`).
- El relay cierra al jugador que reemplaza una conexión colgada con su mismo identificador, pero ese cierre puede no llegarle al cliente viejo (está colgado): la app no depende de recibirlo.
- Toda la información de la mesa viaja por el relay. No es anti-trampas: está pensado para jugar con amigos.
