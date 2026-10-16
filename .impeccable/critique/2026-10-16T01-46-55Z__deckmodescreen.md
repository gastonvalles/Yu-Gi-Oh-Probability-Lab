---
target: armazon y flujo Deck-Roles-Lab-Comparar
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\aiaza\\OneDrive\\Documents\\Workspace\\Proyectos\\YGO Probability Lab\\src\\components\\deck-mode\\DeckModeScreen.tsx"
target_fingerprint: "sha256:5facea9f6e860ce46900013b17427dffd38c80508eafaa67f8b89d9dd9732831"
target_path: "C:\\Users\\aiaza\\OneDrive\\Documents\\Workspace\\Proyectos\\YGO Probability Lab\\src\\components\\deck-mode\\DeckModeScreen.tsx"
timestamp: 2026-10-16T01-46-55Z
slug: src-components-deck-mode-deckmodescreen-tsx
---
# Critique: armazón y flujo Deck → Roles → Lab → Comparar (línea base, diseño actual)

Method: dual-agent (A: revisión de diseño · B: detector + navegador). Fecha: 2026-10-16. App con el diseño actual (violeta, verde, azul), 390 y 1280 px, vacío y con un deck de torneo cargado.

## Puntaje de salud del diseño: 27/40 (Aceptable)

| # | Heurística | Puntaje | Problema clave |
|---|---|---|---|
| 1 | Visibilidad del estado | 3 | El estado de cada paso (Listo/En progreso/Pendiente) sólo está en tooltip y nombre accesible. |
| 2 | Coincidencia con el mundo real | 3 | "10 de cada 10 manos abren limpias" junto a un anillo de 95.2 %; cuatro nombres para lo mismo. |
| 3 | Control y libertad | 2 | Modal del Lab no descartable la primera vez; 23 sugerencias se confirman de a una. |
| 4 | Consistencia | 3 | El lobby del duelo no usa StepHero; rutas (#workspace, #categorization) hablan otro idioma que el menú. |
| 5 | Prevención de errores | 3 | Muy bien en lo destructivo; "Guardar deck actual" crea una build con el mismo nombre. |
| 6 | Reconocimiento vs recuerdo | 2 | Tres íconos mudos en el celular; menú contraído a 14 íconos bajo 1400 px. |
| 7 | Flexibilidad y eficiencia | 2 | Sin "Confirmar todas", un solo deck en el builder, sin atajos. |
| 8 | Estética y minimalismo | 3 | 95.2 % dicho dos veces, 3.9 % tres; editor con 35 artes y precios. |
| 9 | Recuperación de errores | 3 | Mensajes muy buenos; hash desconocido redirige sin avisar. |
| 10 | Ayuda y documentación | 3 | Nadie explica que el flujo es Deck → Roles → Lab en el momento. |
| Total | | 27/40 | Aceptable |

## Veredicto de especificidad

Propio en el centro (anillos, tiers, tiles de torneo, mesa con dorso real, voz), intercambiable en el armazón (cuadrado violeta, "Probability Lab", lista agrupada, pie de portfolio; nada dice deck ni duelo). Oportunidades perdidas: Comparar con la misma silueta que Roles/Lab, paleta ámbar ausente, nota "Excelente/Sólido…" sólo en aria-label.

Detector (regex sobre .tsx, subestima): 1 primario + 1 advisory. Falsos positivos: border-accent-on-rounded en un kbd (DeckBuilderClassicPreview.tsx:117) y bounce-easing intencional (PracticeMat.tsx:203). Navegador (5 vistas): dark-glow + ai-color-palette sobre el badge de marca (AppBrand.tsx:12, token primary; se va con el logo nuevo); skipped-heading real en el builder (h1 → h3 sin h2), no visto por la revisión.

## Impresión general

Centro excelente (resultado del Lab) y un camino hacia él que lo traiciona: ~46 toques y un modal antes del primer número, y un titular que contradice al anillo.

## Qué funciona

1. Tarjeta de resultado del Lab (anillo, frase, 1º/2º, razón y remedio accionable).
2. Tubería Descubrir → builder (dos toques, 70 cartas con roles sugeridos).
3. Diálogos destructivos y de pausa que nombran la acción y el camino de vuelta.

## Problemas prioritarios

1. [P1] ~46 toques antes del primer número: "Confirmar sugerencia" no avanza, no hay "Confirmar todas", el Lab no calcula con sugeridas. Fix: confirmar las 23, confirmar y pasar a la siguiente, Lab provisional con sugeridas. Comando: /impeccable shape.
2. [P1] El titular se contradice ("10 de cada 10" vs 95.2 %; "buenas/limpias/jugables"). Fix: una unidad ("de cada 100") y un nombre; decimal en el tooltip. Comando: /impeccable clarify.
3. [P1] Cadena Deck → Roles → Lab → Comparar cortada e invisible; en el celular sólo hamburguesa → cajón. Fix: barra de 4 grupos con hoja, "Clasificar roles →" al llegar a 40, cierre en el Lab. Comando: /impeccable shape.
4. [P2] Modal forzado del Lab (sin X, tapa el estado vacío). Fix: Callout descartable bajo el primer resultado. Comando: /impeccable distill.
5. [P2] La mascota tapa controles (chips, ©, círculo DP). Fix: apagadas por defecto en celular o detrás del contenido y esquivando lo interactivo. Comando: /impeccable layout.

## Personas

Casey: cada cambio de paso = hamburguesa → cajón con la otra mano; confirmar/siguiente ×23; mascota sobre chip y ©.
Jordan: tres cajas mudas, formato "Sin límite" sin explicar, chips sin glosa, modal sobre porcentajes aún no vistos.
Alex: sin confirmar en lote, sin biblioteca de decks, sin "3×" ni atajo de foco.
Duelista en el torneo: LP a dos toques con la mano izquierda, operaciones a la izquierda, "Duelista 1/2" en vez de Vos/Rival, reloj no arranca solo.

## Observaciones menores

P2: Comparar con build de igual nombre y veredicto "Son iguales" duplicado; editor de roles a 390 px con dos primarios y botón sobre el texto. P3: texto del aro de Roles text-[0.625rem] con 3,45:1; Descubrir anuncia "Pendiente"; Banlists bajo el borde del menú a 800 px; "Trampas" cortado a 390 px. Azul #0087ff vivo (badge B, "Belen WCQ", Extra); ámbar ausente.

## Preguntas

¿El Lab calculando con sugerencias haría de confirmar un refinamiento? ¿Comparar es la biblioteca de decks sin nombre? ¿Qué se pierde con mascotas apagadas en celular? ¿El duelo como entrada de primer nivel con acceso a torneo (reloj + vidas)?
