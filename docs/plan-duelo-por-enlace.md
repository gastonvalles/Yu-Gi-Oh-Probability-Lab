# Plan: duelo por enlace (celular ↔ PC)

Estado: **implementado** (nota del 2026-10-16: el duelo por enlace, los espectadores, las salas públicas, el Match con siding y la reconexión ya están en `main`; cómo funciona hoy está en `docs/duelo.md` y `docs/duelo-relay.md`). Lo que sigue es la propuesta original, escrita sin código sobre la rama `main` del 2026-10-14 y el estudio de DuelingBook, Dueling Nexus y YGOPocket (`docs/referencia-ygopocket.md`); sirve para entender por qué se hizo así, no como estado actual.

## 1. Qué es y qué no es

**Es:** dos personas duelan en la mesa de práctica, cada una en su dispositivo, entrando con un enlace. Juego **manual** (como DuelingBook): cada una mueve sus cartas, el otro lo ve en vivo. Sin cuenta, sin chat libre, sin matchmaking, sin base de datos.

**No es:** un motor de reglas (Dueling Nexus), ni un lobby público, ni un sistema anti-trampas. Es para amigos; se puede ver la información oculta abriendo las herramientas del navegador, y se asume.

## 2. Lo que ya tenés y lo hace barato

| Pieza | Dónde | Por qué importa |
| --- | --- | --- |
| Reductor puro y determinista | `matReducer` en `src/app/practice-mat.ts` | Cada jugada ya es un dato (`MatAction`); replicarla es mandarla y aplicarla. |
| Mesa = `initial` + `actions` + `cursor` | `use-mat-session.ts` | Es event sourcing: el estado de un lado se reconstruye con `replayMat`. La sincronización al reconectar es mandar eso. |
| Mezclas con semilla | `{type:'shuffle', seed}`, `shuffleWithSeed` | Los dos lados barajan igual sin mandar el orden. |
| Dos duelistas con LP, reloj, deshacer | `life-calculator.ts` / `life-store.ts` | Ya modela a los dos jugadores; solo hay que sincronizar sus acciones. |
| Pasar un deck por enlace | `src/app/ydke.ts`, importación `.ydk` | Resuelve llevar el deck de la PC al celular sin cuenta. |
| Efectos y animaciones de la mesa | `mat-effects.ts`, `MatFx.tsx` | Se reutilizan para animar lo que hace el rival. |

Restricciones: `vercel.json` limita `connect-src` (hay que sumar el relay) y las funciones de Vercel **no mantienen WebSockets**, así que el tiempo real vive en otro servicio.

## 3. Decisiones (con recomendación)

**D1. Transporte.** Recomendado: **relay WebSocket en Cloudflare** (un Worker + un Durable Object por sala, ~100 líneas, sin base de datos). Alternativa: WebRTC directo con PeerJS (casi sin backend) pero en redes móviles necesita un servidor TURN para conectar de forma fiable, que es justo el caso celular↔PC. Un servicio gestionado (Ably, Supabase Realtime) también sirve. Verificar los límites vigentes del plan gratuito antes de fijar. El resto del código solo conoce una interfaz `DuelTransport` (enviar / recibir / presencia), así que cambiarlo después es barato y los tests usan uno en memoria.

**D2. Información oculta.** Hoy los ids de la mesa son `${id}-${n}` y **llevan la identidad de la carta**: mandarlos tal cual le mostraría la mano y el mazo al rival. Solución: por la red cada carta viaja con un **id opaco** (`c1…cN`, `e1…eM`, por duelo). El rival solo aprende la identidad de una carta cuando esta pasa a un lugar público (campo boca arriba, cementerio, destierro boca arriba, material Xyz, o al mostrarla). Se calcula de forma genérica con una función `publicIds(estado)`: en cada jugada se manda la identidad de las cartas que **entraron** al conjunto público, sin mirar el tipo de jugada. Así una acción nueva queda cubierta sin tocar nada.

**D3. Modelo.** Dos sesiones espejo: la mía (`MatSession`) y la del rival, que es la misma estructura alimentada por los mensajes del otro lado. Cada uno solo mueve sus cartas. Lo que afecta al rival (destruir, controlar) se pide hablando, como en DuelingBook.

**D4. Turno compartido.** No se cambia el reductor. Una capa de duelo (`DuelState`) deriva de quién es el turno: cuando un lado completa su End Phase pasa el turno. Regla del primer robo: el que va segundo roba en su primer turno (el estado inicial de la mesa asume que quien empieza no roba).

**D5. Enlace.** `#duel?room=K7QF2M9X`, hash como el resto de la app. Código de 8 caracteres (≈40 bits), quien lo sabe entra. Los ajustes (LP inicial, mano, formato, reloj) los manda el anfitrión en el mensaje `hello`, no van en la URL.

**D6. Sin persistencia.** La sala vive mientras haya conexiones. Si alguien se cae, al volver el que sigue conectado reenvía el estado.

## 4. Diseño técnico

### Mensajes (versión 1, JSON, `n` = número de secuencia por emisor)

| Tipo | Contenido | Para qué |
| --- | --- | --- |
| `hello` | rol, nombre, ajustes, cantidad de cartas en main y extra | Presentarse; el anfitrión fija los ajustes |
| `init` | estado inicial **enmascarado** (mazo mezclado con ids opacos, mano ya robada) | Arrancar el espejo |
| `act` | `MatAction` con ids opacos + `reveal: {idOpaco: idCarta}` | Cada jugada |
| `undo` | — | "Volver atrás" de mi última jugada, avisa al espejo |
| `life` | `LifeAction` con jugadores como `me`/`opp` | Sincroniza LP, reloj |
| `roll` | moneda, dado o piedra-papel-tijera + valor | Quién empieza, efectos aleatorios |
| `say` | señal predefinida ("pensando", "ok", "esperá") | Comunicar sin chat libre |
| `sync` | `init` + lista de jugadas + identidades reveladas | Reconexión |
| `bye` | — | Salida ordenada |

El relay reenvía todo al otro participante sin interpretarlo. Máximo 16 KB por mensaje y unos 30 mensajes por segundo por conexión; la sala se cierra 2 minutos después de quedar vacía; solo acepta el origen de la app; no guarda contenido. Cuenta, sin datos personales, salas creadas y duelos con dos jugadores, para medir demanda.

### Flujo

1. Anfitrión: menú → "Duelo con un amigo" → ajustes → se crea la sala → enlace para copiar o compartir (Web Share).
2. Invitado: abre el enlace → elige su deck (el del builder, un link YDKE o un `.ydk`) → "Listo".
3. Los dos están listos → moneda o piedra-papel-tijera → arranca.
4. Cada jugada local: se aplica, se enmascara, se envía. Cada jugada remota: se aplica al espejo, se anima y entra al historial común (reutiliza `describeMatAction`).

### Pantalla

Escritorio: campo rival espejado (girado 180°) arriba, el propio abajo, panel central con fases, turno y LP de ambos. Celular: el campo propio completo y el del rival como tira plegable con la última jugada; **el diseño se decide con maquetas en `/playground` antes de implementar**, como hiciste con el menú. Se respeta la regla de no achicar las cartas en defensa.

### Reconexión (requisito de primera clase)

Safari en iOS suspende los WebSockets al bloquear la pantalla o pasar a segundo plano. El cliente reintenta con espera creciente, escucha `visibilitychange`, y al volver a la sala dispara `sync`. Probarlo en un teléfono real, no solo en el emulador.

## 5. Entregas (cada una sola, con prueba y mergeable)

| # | Qué | Tamaño | Listo cuando |
| --- | --- | --- | --- |
| A | `src/app/mat-public.ts`: ids opacos, `publicIds`, diferencia de revelado, aplicar jugada remota. Sin red ni interfaz | M | Una prueba con miles de secuencias aleatorias de jugadas deja el espejo idéntico al lado emisor enmascarado, y ningún id del espejo contiene una identidad real |
| B | Protocolo + `use-duel-session` + transporte en memoria | M | Dos clientes en un test completan un duelo; el reintento y el `sync` tras una caída restauran el estado; secuencias duplicadas o desordenadas se ignoran |
| C | `duel-relay/` (Worker + DO), `WebSocketTransport`, CSP, variable de entorno con la URL | M | Dos pestañas conectadas por el relay real completan un duelo; mensajes grandes y ráfagas se rechazan |
| D | Interfaz: entrada de menú, crear y unirse, elegir deck, campo rival, LP y turno, estados de conexión (primero en `/playground`) | L | Un celular y una PC juegan 3 turnos completos |
| E | Moneda, dado, piedra-papel-tijera, señales, anuncio de ataque (nuevo `attack` solo para el registro), historial común, pulido móvil | M | Duelo completo sin salir de la app |
| F | Después: guardar el duelo como replay o combo (la lista de jugadas ya está), revancha, espectadores | — | — |

Orden por riesgo: A es lo más delicado (si el espejo se desincroniza o filtra información, nada más importa), por eso va primero y sin interfaz.

## 6. Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Desincronización | El reductor sigue siendo puro; una prueba falla si una `MatAction` no es serializable a JSON; regla escrita: toda acción nueva debe ser determinista y apta para la red |
| Filtración de la mano | Ids opacos y revelado por diferencia (D2); se documenta que no es anti-trampas |
| iOS suspende la conexión | `sync` al volver (sección 4); prueba manual en teléfono |
| Abuso | Solo salas por enlace, sin chat libre, límites de tamaño y de ritmo en el relay |
| Costo del relay | Solo se reenvía; se mide con el contador de salas antes de gastar más |
| Doble mesa en el celular | Dibujar el campo rival más simple (sin arrastre ni menús) |
| Imágenes de Konami | Misma proxy de imágenes de la app; revisar los términos de YGOPRODeck al crecer |

## 7. Cómo sabemos si vale la pena

El relay cuenta, sin identificar a nadie: salas creadas, salas con dos jugadores, duelos con más de 10 jugadas. Si en unas semanas hay uso real, se piensa en cobrar; si no, se gastó poco. La fricción más visible del "celular ↔ PC" es **pasar el deck de un dispositivo al otro**: en el MVP se resuelve con YDKE; sincronizar mazos con una cuenta es el candidato natural a función de pago (ver el estudio de monetización).

## 8. Preguntas abiertas

1. ¿Aceptás sumar una cuenta de Cloudflare para el relay (plan gratuito)? La alternativa es un servicio gestionado, que también pide cuenta.
2. Celular: ¿tira plegable del rival o alternar entre los dos campos? Se resuelve con maquetas en `/playground`.
3. ¿El reloj de 50 minutos y el LP del duelo se sincronizan siempre, o solo si el anfitrión lo activa?
