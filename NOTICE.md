# Aviso y licencias

**YGOUltraLab** · Copyright (C) 2026 Gastón Valles

Este programa es software libre: podés redistribuirlo y modificarlo bajo los términos de la **GNU Affero General Public License** publicada por la Free Software Foundation, en su versión 3 o (a tu elección) cualquier versión posterior (`AGPL-3.0-or-later`; el texto completo está en `LICENSE`). Se distribuye con la esperanza de que sea útil, pero **sin ninguna garantía**.

## Código fuente

<https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab>: la versión que está en línea es la de la rama `main`. La app lo ofrece a quien la usa desde el enlace «Código fuente» de su menú, como pide la cláusula 13 de la licencia. Cómo correrlo y dónde está cada cosa: `README.md`.

## Lo que la licencia no cubre

La licencia es del **código**. No da permiso para usar el nombre «YGOUltraLab», su logo ni sus mascotas como marca propia, y no toca lo que es de otros:

- Yu-Gi-Oh!, los nombres, los textos, las ilustraciones y las imágenes de las cartas (y los personajes que se usan de mascota) son marcas y obras de Konami Digital Entertainment. Este proyecto no es oficial ni está afiliado a Konami.
- Los datos de las cartas y los decks de torneo son de [YGOPRODeck](https://ygoprodeck.com/api-guide/), los precios de [TCGCSV](https://tcgcsv.com/) y las listas de prohibidas, de las listas públicas de la comunidad; cada fuente conserva sus términos.

## Componentes de terceros que se entregan con la app

| Componente | Licencia | Código fuente |
| --- | --- | --- |
| `ocgcore`, el motor de reglas de EDOPro (el duelo automático lo corre compilado a WebAssembly en el navegador) | AGPL-3.0-or-later | <https://github.com/edo9300/ygopro-core> |
| `ocgcore-wasm` 0.1.6, que lo compila a WebAssembly y lo envuelve para JavaScript (fija la versión del núcleo como submódulo `cpp/ygo`) | MIT (el `.wasm` lleva el núcleo AGPL) | <https://github.com/n1xx1/ocgcore-wasm> |
| Scripts de las cartas de Project Ignis (`CardScripts`) | AGPL-3.0-or-later | <https://github.com/ProjectIgnis/CardScripts> |
| Lexend Deca (tipografía, autoalojada) | SIL OFL 1.1 | `src/fonts/OFL-Lexend.txt` |

La versión exacta de los scripts de Project Ignis que sirve el sitio (el commit de `CardScripts`) está fijada en `auto-data.lock.json`.

Las demás dependencias (React, Vite, Tailwind y el resto de `package.json`) mantienen sus licencias; sus avisos van en sus paquetes.

`cards.cdb` (la base de cartas de Project Ignis) no tiene licencia publicada: no está en este repositorio.
