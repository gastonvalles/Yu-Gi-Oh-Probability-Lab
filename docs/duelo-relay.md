# Relay del duelo por enlace

El duelo por enlace junta a dos jugadores, cada uno en su dispositivo, por un **relay**: un Worker de Cloudflare (`duel-relay/`)
con un Durable Object por sala y otro (`RoomIndex`) para la lista de salas públicas. En la app lo usan `src/app/duel-socket.ts`
(el cliente, con reconexión) y `src/app/duel-rooms.ts` (la lista); lo que comparten los dos lados está en
`src/app/duel-relay-rules.ts`. Lo que viaja entre los jugadores (el protocolo del duelo) está en `docs/duelo.md`.

Publicado en `wss://ygo-lab-duel-relay.gastonvallesyeou.workers.dev`; el sitio lo encuentra por `VITE_DUEL_RELAY_URL`, cargada
en Vercel en todos los entornos.

## Qué hace y qué no

- Una sala por código, de **dos** jugadores y hasta **dos** espectadores; el tercero de cada uno recibe «sala llena» (un jugador
  no ocupa el lugar de un espectador ni al revés). La sala existe mientras haya conexiones: **no hay base de datos**.
- Reenvía cada mensaje de texto sin leerlo ni guardarlo: no sabe nada de cartas ni de reglas, y no es anti-trampas (toda la mesa
  pasa por él: es para jugar con amigos).
- Sus avisos (quién entra o sale, cuántos miran) son binarios, y un jugador no puede mandar binarios: nadie se hace pasar por él.
- **Espectadores** (`?role=spectator`): reciben el texto de los dos jugadores, cada mensaje con quién lo mandó (`0` o `1`, por
  orden de llegada, y quien reconecta conserva el suyo). Lo que manden los desconecta, salvo `resync`, que les pide a los
  jugadores que repitan su estado.
- **Al reconectar** (`hello` + `sync`), el relay cierra la conexión colgada de ese jugador, pero el cierre puede no llegarle al
  cliente viejo: la app no depende de recibirlo.
- **Cerrar la sala:** cuando un jugador cierra con `CLOSE_ROOM_OVER`, el relay avisa (`gone`) y corta a todos, y a quien llegue
  después le hace lo mismo sin dejarle ver nada: el que se queda no puede dejar la sala abierta para que un tercero vea su mesa.
  Sólo guarda una marca de sala cerrada, que se borra a la hora; un espectador no puede cerrarla. La app lo hace cuando el duelo
  terminó y el rival se fue (`docs/duelo.md`).
- No registra códigos ni direcciones: el registro de cada petición está apagado en `wrangler.jsonc`.

## Límites y códigos de cierre

- 16 KB por mensaje, 30 por segundo (ráfaga de 60) y sólo los orígenes de `ALLOWED_ORIGINS`.
- Espectadores, entre todos los de una sala: seis entradas seguidas y después una cada 2 s (si no, un 429 sin abrir la
  conexión); los jugadores reciben el pedido de estado en una ráfaga de tres y después uno cada 2 s; un espectador que lo pide de
  más diez veces se desconecta.
- Códigos: 1003 (un binario de un jugador), 1008 (ritmo, o un espectador que manda algo), 1009 (mensaje enorme), 4000
  (reemplazada por una conexión nueva), 4001 (sala llena), 4002 (`CLOSE_GONE`: la sala ya no existe) y 4400 (`CLOSE_ROOM_OVER`,
  lo manda un jugador).

## Salas públicas y duelos en vivo

- `GET /rooms` trae `{ rooms, live }`; `POST /rooms?room=CÓDIGO` anota una sala, `POST /rooms/close?room=CÓDIGO` la baja y
  `POST /rooms/live?room=CÓDIGO` avisa que su duelo sigue en vivo y cuántos lo miran. Los POST llevan el JSON como texto plano
  (sin consulta previa de CORS). La lógica es `RoomRegistry`.
- El anfitrión anota su sala con un token que sólo él conoce y la baja con ese token cuando llega el rival, cuando sale o cierra
  la pestaña y también cuando la dirección del navegador se queda sin sala (atrás, o `#duel` solo); la que nadie baja vence a los
  30 minutos. Tope de 100 salas y de una anotación cada cinco segundos por dirección (que se mira, no se guarda).
- Con el rival adentro, una sala pública pasa a los duelos en vivo mientras su anfitrión avise cada minuto (vence a los 3 minutos
  sin aviso y a las 4 horas aunque siga avisando); si el rival se va, vuelve a las que esperan.
- **Qué se publica:** el nombre del anfitrión, el formato, Single o Match, el reloj y el siding; de un duelo en vivo, además,
  cuántos miran, desde cuándo y el nombre de su rival (limpio como el del anfitrión: es lo único de quien entró que se publica, y
  sólo de un duelo público). Nada de la mesa, y **una sala privada nunca se anota.** Los nombres se muestran como texto.

## Versiones: primero el relay, después el sitio

Los dos lados se publican por separado y ninguno rompe al otro, pero se publica **primero el relay** y hay que volver a
publicarlo cuando cambia `duel-relay/` **o `src/app/duel-relay-rules.ts`** (el Worker lo empaqueta):

- Una sala pública acepta los relojes de hoy (50 o sin tiempo) y los de antes (20, 40, 60, 90), y `genesysCap` (opcional; mal
  escrito, se ignora): un relay de antes rechazaría el 50 y descartaría el tope.
- `live` va aparte de `rooms`: un cliente de antes no ve los duelos en vivo ni los toma por salas. Con un relay de antes, un
  cliente nuevo no ve duelos en vivo y su aviso no se registra (la app sólo da por bueno `{ result: 'ok' }`): baja la sala al
  llegar el rival, como siempre.

## Probarlo en tu máquina (sin cuenta)

```bash
cd duel-relay
npx wrangler@4 dev --local --port 8788 --persist-to C:/tmp/relay --var "ALLOWED_ORIGINS:http://localhost:5173,http://127.0.0.1:5173"
```

El sitio, con `VITE_DUEL_RELAY_URL=ws://127.0.0.1:8788` en `.env.local`. La prueba de punta a punta (sin la variable se saltea,
así que no corre en el CI) juega un duelo con una caída de la conexión y prueba los espectadores y sus topes:

```bash
DUEL_RELAY_E2E_URL=ws://127.0.0.1:8788 npm test -- duel-relay.e2e
```

- **El publicado** también acepta `localhost:5173` y `127.0.0.1:5173` (el servidor de desarrollo tiene que estar en ese puerto),
  pero una sala pública armada probando aparece en la arena de producción: probá en privada o cerrala.
- **Windows:** `SQLITE_CANTOPEN` es el largo de la ruta (por eso el `--persist-to` corto). Levantar `wrangler dev` varias veces
  deja procesos `workerd` colgados y el relay deja de contestar (la página queda en «Conectando…»): matalos y levantá uno solo,
  con otra carpeta en `--persist-to`.

## Publicarlo (con la cuenta de Cloudflare)

1. `cd duel-relay && npx wrangler@4 login` (la cuenta gratuita alcanza).
2. Si el sitio cambia de dirección, `ALLOWED_ORIGINS` en `duel-relay/wrangler.jsonc` (separados por coma; `*` vale por letras,
   números y guiones; los despliegues de prueba de Vercel pasan sólo con el nombre del proyecto y el del equipo). Frena el abuso
   desde otras páginas, no es seguridad: un cliente que no es un navegador manda el encabezado que quiere.
3. `npx wrangler@4 deploy`.
4. Si cambió la dirección del Worker: `VITE_DUEL_RELAY_URL` en Vercel (en `wss://`; se lee al compilar, así que hay que volver a
   desplegar) y la CSP de `vercel.json` (sus dos reglas), o el navegador bloquea la conexión.

Cuánto se usa: en Cloudflare, Workers → `ygo-lab-duel-relay` → Logs (el relay sólo cuenta `room_opened`, `room_paired` y
`room_watched`, sin datos de nadie); `room_paired` sobre `room_opened` dice cuántas salas juntan a dos jugadores.
