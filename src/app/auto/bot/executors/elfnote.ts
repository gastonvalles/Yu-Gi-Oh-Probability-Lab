import type { AskOf, CardLoc, CoreAsk } from '../../protocol'
import type { Bot, BotCard, BotReason, BotView } from '../bot'
import { ELFNOTE as E, ELFNOTE_DECK } from '../../../bot-deck-lists'
import { mayInterrupt } from '../interrupt'
import { turnBot, type CardFacts } from '../turn'
import {
  ATTACK_TIMING,
  atPlace,
  cardsOf,
  executorBot,
  firstOf,
  isMine,
  lastAttack,
  LOC,
  monstersOf,
  PHASE,
  ranked,
  threatOf,
  type DeckDecision,
  type DeckExecutor,
  type Play,
  type Scene,
} from './executor'

/**
 * El ejecutor de Elfnote (etapa 2 del bot): juega la lista fija de `bot-deck-lists.ts` con prioridades escritas a partir del texto impreso y los scripts (CardScripts al commit de
 * `testedWith`). La idea del mazo: un Elfnote de Nivel 6 en la Zona de Monstruos Principal del centro y Elfnote Power Patron (Cantante de Nivel 1) le suma 3 Niveles e Invoca por
 * Sincronía a June Pride (Nivel 10) en el centro, en su turno o en el tuyo. June Pride vuelve al Extra Deck y trae un Elfnote de la mano, otro del Deck y otro del cementerio: un
 * Nivel 6 al centro y, después, Power Patron (para tu turno) o Junoldo. Junoldo en el campo se destruye e Invoca a Junora; Nervedo, a Nerva.
 *
 * Main Phase, en orden (la primera que el núcleo ofrece y conviene):
 * 1. Lo que busca sin gastar la Invocación Normal: Pendulum Treasure (Nervedo al Extra Deck, que Invoca del Deck a Power Patron o a Junoldo; o Jupredo, que busca a Vidolia), Vidolia
 *    (revela a Junora o a Nerva y trae lo que la nombra), Jupredo en la Zona de Péndulo (se destruye con otro Power Patron de la mano), Non-Finito (Tributa a Nervedo de la mano y
 *    coloca Impasto), las Ars Magna desde la mano (Purification busca Citrinitas; Infinity, otra Ars Magna), Citrinitas (busca a Medius).
 * 2. Lucina (o Fortuna) se Invoca sola al centro; Lucina busca a Power Patron (o a Regina), Fortuna coloca Rhapsodia of Madness.
 * 3. Regina al centro (de la mano con un costo, o de modo Normal) trae a Power Patron del Deck; Medius también (de modo Normal, con Theorealize Past Lull o desde el cementerio
 *    tras Theorealize); si no, Power Patron de modo Normal con un Nivel 6 en el centro. Sin un Nivel 6 que llegue al centro, lo que Invoca un Power Patron trae a Junoldo.
 * 4. Power Patron sube el Nivel del centro e Invoca a June Pride; June Pride trae tres Elfnote; Junoldo a Junora, Nervedo a Nerva; Strelitzia (Power Patron y un Nivel 6), salvo
 *    que Power Patron quede con un Nivel 6 en el centro para tu turno.
 * 5. Psychic End Punisher destierra tu mejor carta; un monstruo que ataque si no queda otra jugada; colocar Rhapsodia e Impasto si están en la mano.
 * En tu turno: Lucina y Fortuna cambian de lugar con el centro y te devuelven un monstruo o una Mágica o Trampa a la mano; Power Patron Invoca a June Pride (o a Junora, que niega
 * tus cartas boca arriba) en tu Main Phase; Number 90 e Impasto contra tu efecto de monstruo, Diactorus y Rhapsodia contra tu carta. Sus handtraps (Ash, Ghost Ogre, Effect
 * Veiler, Nibiru, Droll & Lock Bird, Mulcharmy Fuwalos), como el rival de handtraps (`turnBot`). Sin regla (no las juega): Dragite, Haggard Lizardose, Clockwork Knight.
 */

const OWN = new Set<number>([...ELFNOTE_DECK.main, ...ELFNOTE_DECK.extra].map(([code]) => code))
/** Sus handtraps, en ese orden de preferencia: las usa como el rival de handtraps. */
const HANDTRAPS: number[] = [E.ash, E.veiler, E.ogre, E.nibiru, E.droll, E.fuwalos]
/** Lo que niega tu eslabón desde su campo (cuenta para `mayInterrupt`). */
const RESPONDERS = new Set<number>([E.n90, E.impasto, E.diactorus, E.rhapsodia])
/** Los Elfnote de Nivel 6 (Lanzadores de Conjuros: June Pride pide uno de material): los que van al centro. */
const SIX = new Set<number>([E.lucina, E.regina, E.fortuna])
/** Lo que manda o descarta primero (costos): lo que menos le sirve. */
const DISCARD: number[] = [E.vidolium, E.nervedo, E.jupredo, E.fuwalos, E.theorealize, E.terminus, E.treasure, E.vidolia, E.droll, E.nibiru, E.ogre, E.junoldo, E.purification, E.infinity, E.unification, E.theoMedius, E.pastLull, E.citrinitas, E.veiler, E.medius, E.ash, E.impasto, E.rhapsodia, E.fortuna, E.lucina, E.regina, E.patron]
/** Qué Invoca por Sincronía con Power Patron (un Elfnote o Junora), en orden: June Pride (Nivel 10, con el del centro), Junora y, si no se puede, Strelitzia. */
const SYNCHRO = [E.junePride, E.junora, E.strelitzia]
/** Material de Sincronía o Xyz: lo que más conviene usar primero (Power Patron y Regina vuelven a buscar; las Ars Magna no hacen nada en el campo). */
const MATERIAL: number[] = [E.patron, E.regina, E.junoldo, E.unification, E.infinity, E.purification, E.medius, E.theoMedius, E.fortuna, E.lucina]

const handCodes = (view: BotView) => view.me.hand.map((card) => card.code)
const inHand = (view: BotView, code: number) => handCodes(view).includes(code)
const deckLeft = (view: BotView, code: number) => view.me.deckLeft?.[code] ?? 0
const extraLeft = (view: BotView, code: number) => view.me.extraLeft?.[code] ?? 0
const inGrave = (view: BotView, code: number) => view.me.grave.some((card) => card.code === code)
const onField = (view: BotView, code: number) => cardsOf(view.me).some((card) => card.code === code && card.pos !== 'set')
const reasonOf = (key: string, ...cards: number[]): BotReason => ({ key: `auto.bot.reason.${key}`, cards })
const nOf = (description: string) => Number(BigInt(description) & 0xfffffn)
const codeOfDesc = (description: string) => Number(BigInt(description) >> 20n)
/** El monstruo de su Zona de Monstruos Principal del centro. */
const center = (view: BotView) => view.me.monsters[2] ?? null
const centerFree = (view: BotView) => center(view) === null
/** Un Elfnote de Nivel 6 (o subido) boca arriba en el centro: lo que Power Patron sube a 9 para June Pride. */
const sixInCenter = (view: BotView) => {
  const card = center(view)

  return card !== null && card.pos !== 'set' && SIX.has(card.code)
}
/** Tus cartas boca arriba (lo que Lars, Rhapsodia y Psychic End Punisher pueden frenar). */
const yourFaceUp = (view: BotView) => cardsOf(view.them).filter((card) => card.code !== 0 && card.pos !== 'set')
const normalLeft = (s: Scene) => ![...s.done].some((id) => id.startsWith('normal-') || id.startsWith('beater-'))
/** Power Patron ya está en el campo o en la mano. */
const patronReady = (view: BotView) => onField(view, E.patron) || inHand(view, E.patron)
/** Lucina o Fortuna en el campo que ya usaron su efecto de la Main Phase: el costo de Regina (si está en el centro, lo libera para ella). */
const spent = (s: Scene, card: BotCard | null) => card !== null && card.pos !== 'set' && ((card.code === E.lucina && s.done.has('lucina-search')) || (card.code === E.fortuna && s.done.has('fortuna-place')))
/** Algo que mandar al cementerio para Regina: Citrinitas boca arriba, Lucina o Fortuna ya usadas, u otra carta Elfnote de la mano. */
const reginaFodder = (s: Scene) =>
  s.view.me.hand.filter((card) => ([E.lucina, E.fortuna, E.junoldo, E.citrinitas, E.rhapsodia, E.regina] as number[]).includes(card.code)).length > (inHand(s.view, E.regina) ? 1 : 0) ||
  cardsOf(s.view.me).some((card) => (card.code === E.citrinitas && card.pos !== 'set') || spent(s, card))
/** Lo que manda Regina como costo, en orden. */
const REGINA_COST: number[] = [E.citrinitas, E.lucina, E.fortuna, E.junoldo, E.rhapsodia, E.regina]
/** El disparo de Medius (una vez por turno, por nombre) todavía se puede usar: trae a Power Patron del Deck. */
const mediusLeft = (s: Scene) => !s.done.has(`trigger.${E.medius}.0`) && deckLeft(s.view, E.patron) + deckLeft(s.view, E.junoldo) > 0
/** El Power Patron de la mano que Jupredo destruye con ella (al Extra Deck boca arriba, dispara su efecto): Nervedo si queda Power Patron o Junoldo en el Deck; si no, -1. */
const jupredoFodder = (view: BotView) =>
  [...(deckLeft(view, E.patron) + deckLeft(view, E.junoldo) > 0 ? [E.nervedo] : []), E.vidolium, E.junoldo].find((code) => inHand(view, code)) ?? -1
/** El índice de la carta que menos le sirve (costo o descarte): la primera de `DISCARD`; las que no están ahí, al final. */
const cheapest = (list: readonly CardLoc[]) => ranked(list, (card) => -(DISCARD.indexOf(card.code) < 0 ? DISCARD.length : DISCARD.indexOf(card.code)))[0] ?? -1

/** Un Nivel 6 ya está en el centro o puede llegar este turno (Lucina o Fortuna de la mano, Regina con su costo): Power Patron le sirve. */
const sixReady = (s: Scene) => sixInCenter(s.view) || inHand(s.view, E.lucina) || inHand(s.view, E.fortuna) || (inHand(s.view, E.regina) && reginaFodder(s))
/** Lo que trae del Deck un efecto que Invoca un Power Patron: Power Patron si un Nivel 6 llega al centro; si no, Junoldo (desde el campo Invoca a Junora). */
const patronOrJunoldo = (s: Scene) => (sixReady(s) || extraLeft(s.view, E.junora) === 0 ? [E.patron, E.junoldo] : [E.junoldo, E.patron])

/** De cuántos lugares (mano, Deck, cementerio) traería June Pride un Elfnote. */
const refillFrom = (view: BotView) => {
  const elfnotes = [...SIX, E.patron]

  return [elfnotes.some((code) => inHand(view, code)), elfnotes.some((code) => deckLeft(view, code) > 0), elfnotes.some((code) => inGrave(view, code))].filter(Boolean).length
}
/**
 * Lo que se Invoca al centro si está libre: los Elfnote (Regina se activa desde ahí), las Sincronías Elfnote (June Pride y Strelitzia sólo funcionan ahí) y las Xyz (Lucina y Fortuna
 * se cambian de lugar con el monstruo del centro).
 */
const TO_CENTER = new Set<number>([E.regina, E.lucina, E.fortuna, E.patron, E.junePride, E.strelitzia, E.rhapsodia, E.n90])

/** Qué busca con Lucina: Power Patron si todavía puede Invocarla de modo Normal; si no, Regina (se Invoca sola en tu turno), Fortuna o Power Patron. */
const lucinaWants = (s: Scene) => (normalLeft(s) && !patronReady(s.view) ? [E.patron, E.regina, E.fortuna, E.junoldo] : [E.regina, E.fortuna, E.patron, E.junoldo])
/** Qué busca Power Patron al ir al cementerio como material: sin un Nivel 6 en la mano, Lucina (se Invoca sola al centro); si no, Regina, Rhapsodia, otra Power Patron. */
const patronWants = (view: BotView) => [
  ...(![...SIX].some((code) => inHand(view, code)) ? [E.lucina] : []),
  ...(!inHand(view, E.regina) ? [E.regina] : []),
  ...(!onField(view, E.rhapsodia) && !inHand(view, E.rhapsodia) ? [E.rhapsodia] : []),
  E.patron,
  E.fortuna,
  E.lucina,
  E.regina,
  E.citrinitas,
]

const PLAYS: Play[] = [
  // Lo que busca sin gastar la Invocación Normal.
  { id: 'treasure', kind: 'activate', code: E.treasure, when: (s) => deckLeft(s.view, E.nervedo) + deckLeft(s.view, E.vidolium) + deckLeft(s.view, E.jupredo) > 0, reason: () => reasonOf('play.starter', E.treasure) },
  // Vidolia: revela a Junora (trae a Power Patron o a Junoldo) o a Nerva (trae a Nervedo) y destierra boca abajo una carta de la mano.
  { id: 'vidolia', kind: 'activate', code: E.vidolia, from: LOC.HAND, when: (s) => !onField(s.view, E.vidolia), reason: () => reasonOf('play.starter', E.vidolia) },
  { id: 'vidolia-search', kind: 'activate', code: E.vidolia, from: LOC.SZONE, when: (s) => deckLeft(s.view, E.patron) + deckLeft(s.view, E.junoldo) + deckLeft(s.view, E.nervedo) > 0, reason: () => reasonOf('play.starter', E.vidolia) },
  // Jupredo a la Zona de Péndulo: se destruye con otro Power Patron de la mano y los dos van boca arriba al Extra Deck (Jupredo busca a Vidolia; Nervedo Invoca a Power Patron).
  { id: 'jupredo-scale', kind: 'activate', code: E.jupredo, from: LOC.HAND, when: (s) => jupredoFodder(s.view) >= 0, reason: () => reasonOf('play.starter', E.jupredo) },
  { id: 'jupredo', kind: 'activate', code: E.jupredo, from: LOC.SZONE, when: (s) => jupredoFodder(s.view) >= 0, reason: () => reasonOf('play.starter', E.jupredo) },
  // Non-Finito: Nervedo de la mano como Tributo y una Mágica o Trampa descartada (antes de Power Patron, que sólo deja Sincronías del Extra Deck); coloca Impasto.
  { id: 'non-finito', kind: 'special', code: E.nonFinito, from: LOC.EXTRA, when: (s) => inHand(s.view, E.nervedo), reason: () => reasonOf('play.special', E.nonFinito) },
  // Vidolium a la Zona de Péndulo y se destruye: Invoca a Power Patron de la mano (si la tiene) y, al ir boca arriba al Extra Deck, busca otra carta Power Patron.
  { id: 'vidolium-scale', kind: 'activate', code: E.vidolium, from: LOC.HAND, when: (s) => deckLeft(s.view, E.patron) + deckLeft(s.view, E.theoMedius) > 0, reason: () => reasonOf('play.starter', E.vidolium) },
  { id: 'vidolium', kind: 'activate', code: E.vidolium, from: LOC.SZONE, reason: () => reasonOf('play.starter', E.vidolium) },
  { id: 'purification', kind: 'activate', code: E.purification, from: LOC.HAND, when: (s) => deckLeft(s.view, E.citrinitas) > 0 && !inHand(s.view, E.citrinitas), reason: () => reasonOf('play.starter', E.purification) },
  { id: 'infinity', kind: 'activate', code: E.infinity, from: LOC.HAND, reason: () => reasonOf('play.starter', E.infinity) },
  { id: 'citrinitas', kind: 'activate', code: E.citrinitas, from: LOC.HAND, when: (s) => !onField(s.view, E.citrinitas), reason: () => reasonOf('play.starter', E.citrinitas) },
  { id: 'citrinitas-search', kind: 'activate', code: E.citrinitas, from: LOC.SZONE },
  // Al centro y a buscar.
  { id: 'lucina', kind: 'special', code: E.lucina, from: LOC.HAND, when: (s) => centerFree(s.view), reason: () => reasonOf('play.special', E.lucina) },
  { id: 'fortuna', kind: 'special', code: E.fortuna, from: LOC.HAND, when: (s) => centerFree(s.view) && !(inHand(s.view, E.lucina) && !s.done.has('lucina')), reason: () => reasonOf('play.special', E.fortuna) },
  { id: 'lucina-search', kind: 'activate', code: E.lucina, from: LOC.MZONE, reason: () => reasonOf('play.starter', E.lucina) },
  { id: 'fortuna-place', kind: 'activate', code: E.fortuna, from: LOC.MZONE, when: (s) => !onField(s.view, E.rhapsodia), reason: () => reasonOf('play.starter', E.fortuna) },
  // Regina al centro (de la mano, con un costo, o de modo Normal) trae a Power Patron del Deck; Medius también; o Power Patron de modo Normal con un Nivel 6 en el centro.
  { id: 'regina-quick', kind: 'activate', code: E.regina, from: LOC.HAND, when: (s) => (centerFree(s.view) || spent(s, center(s.view))) && reginaFodder(s), reason: () => reasonOf('play.special', E.regina) },
  // Regina de modo Normal pide un Tributo: nunca a Power Patron.
  { id: 'normal-regina', kind: 'summon', code: E.regina, when: (s) => centerFree(s.view) && !onField(s.view, E.patron), reason: () => reasonOf('play.normalEffect', E.regina) },
  { id: 'normal-patron', kind: 'summon', code: E.patron, when: (s) => sixInCenter(s.view), reason: () => reasonOf('play.normalEffect', E.patron) },
  { id: 'normal-medius', kind: 'summon', code: E.medius, when: (s) => !onField(s.view, E.patron) && deckLeft(s.view, E.patron) > 0, reason: () => reasonOf('play.normalEffect', E.medius) },
  { id: 'past-lull', kind: 'activate', code: E.pastLull, when: (s) => deckLeft(s.view, E.patron) + deckLeft(s.view, E.junoldo) > 0, reason: () => reasonOf('play.starter', E.pastLull) },
  // Sin Medius en la mano: Theorealize lo manda del Deck al cementerio y Medius vuelve devolviendo una carta de la mano al Deck.
  { id: 'theorealize', kind: 'activate', code: E.theorealize, from: LOC.HAND | LOC.SZONE, when: (s) => mediusLeft(s) && !inHand(s.view, E.medius) && !inGrave(s.view, E.medius) && deckLeft(s.view, E.medius) > 0, reason: () => reasonOf('play.starter', E.theorealize) },
  { id: 'medius-grave', kind: 'activate', code: E.medius, from: LOC.GRAVE, when: (s) => mediusLeft(s) && s.view.me.hand.some((card) => DISCARD.indexOf(card.code) >= 0 && DISCARD.indexOf(card.code) < DISCARD.indexOf(E.medius)), reason: () => reasonOf('play.special', E.medius) },
  { id: 'theo-medius', kind: 'activate', code: E.theoMedius, from: LOC.HAND, reason: () => reasonOf('play.special', E.theoMedius) },
  // Junoldo en la Zona de Péndulo: es una carta Power Patron y Elfnote en el campo (para Theorealize Medius y Past Lull) y roba 2 cuando se Invoca un Elfnote.
  { id: 'junoldo-scale', kind: 'activate', code: E.junoldo, from: LOC.HAND, when: (s) => (inHand(s.view, E.theoMedius) || inHand(s.view, E.pastLull)) && !onField(s.view, E.patron) },
  // Power Patron sube el centro a Nivel 9 e Invoca a June Pride.
  { id: 'patron', kind: 'activate', code: E.patron, from: LOC.MZONE, when: (s) => sixInCenter(s.view), reason: (s) => reasonOf('play.synchroLevel', E.patron, center(s.view)?.code ?? 0) },
  // June Pride vuelve al Extra Deck y trae tres Elfnote, si hay al menos dos que traer.
  {
    id: 'june-pride',
    kind: 'activate',
    code: E.junePride,
    from: LOC.MZONE,
    when: (s) => refillFrom(s.view) >= 2,
    reason: () => reasonOf('play.refill', E.junePride),
  },
  // Junoldo en el campo se destruye e Invoca a Junora (como Sincronía); al ir boca arriba al Extra Deck devuelve a la mano a Power Patron. Nervedo, igual, con Nerva.
  { id: 'junoldo-junora', kind: 'activate', code: E.junoldo, from: LOC.MZONE, when: (s) => extraLeft(s.view, E.junora) > 0, reason: () => reasonOf('play.extraTo', E.junora) },
  { id: 'nervedo-nerva', kind: 'activate', code: E.nervedo, from: LOC.MZONE, when: (s) => extraLeft(s.view, E.nerva) > 0, reason: () => reasonOf('play.extraTo', E.nerva) },
  // Strelitzia, salvo que Power Patron ya haya subido un Nivel con un Nivel 6 en el centro: así queda para Invocar a June Pride en tu turno.
  { id: 'synchro-strelitzia', kind: 'special', code: E.strelitzia, from: LOC.EXTRA, when: (s) => !(s.done.has('patron') && sixInCenter(s.view) && onField(s.view, E.patron)), reason: () => reasonOf('play.synchroNext', E.strelitzia) },
  // Las Xyz antes del efecto de Strelitzia (después sólo se Invocan Sincronías desde el Extra Deck).
  { id: 'xyz-n90', kind: 'special', code: E.n90, from: LOC.EXTRA, reason: () => reasonOf('play.xyz', E.n90) },
  { id: 'strelitzia', kind: 'activate', code: E.strelitzia, from: LOC.MZONE, when: (s) => [...SIX].some((code) => inHand(s.view, code) || inGrave(s.view, code)), reason: () => reasonOf('play.trigger', E.strelitzia) },
  // Sin un Nivel 6 para June Pride: Power Patron a otra Sincronía (al cementerio como material, busca un Elfnote).
  ...[E.punisher, E.pluto].map((code): Play => ({ id: `synchro-${code}`, kind: 'special', code, from: LOC.EXTRA, when: (s) => !sixInCenter(s.view) || !onField(s.view, E.patron), reason: () => reasonOf('play.synchroNext', code) })),
  { id: 'unification', kind: 'activate', code: E.unification, from: LOC.HAND, when: (s) => [E.infinity, E.purification].some((code) => inGrave(s.view, code) || s.view.me.banished.some((card) => card.code === code)) },
  { id: 'unification-draw', kind: 'activate', code: E.unification, from: LOC.MZONE, reason: () => reasonOf('play.draw', E.unification) },
  { id: 'punisher', kind: 'activate', code: E.punisher, from: LOC.MZONE, when: (s) => s.view.turn > 1 && yourFaceUp(s.view).length > 0 && s.view.lp.me > 2000 },
  { id: 'terminus', kind: 'activate', code: E.terminus, when: (s) => s.view.turn === 1 && !inHand(s.view, E.medius) && deckLeft(s.view, E.medius) > 0, reason: () => reasonOf('play.starter', E.terminus) },
  // Sin otra jugada: un monstruo que ataque o que quede en el campo, y Rhapsodia colocada.
  ...[E.medius, E.patron, E.theoMedius].map((code): Play => ({ id: `beater-${code}`, kind: 'summon', code, reason: () => reasonOf('play.beater', code) })),
  { id: 'set-rhapsodia', kind: 'set', code: E.rhapsodia, from: LOC.HAND, reason: () => reasonOf('play.setQuick', E.rhapsodia) },
  { id: 'set-impasto', kind: 'set', code: E.impasto, from: LOC.HAND, reason: () => reasonOf('play.setQuick', E.impasto) },
]

/** Sus efectos que se activan solos (disparos), por código y `n` del `desc`, y si conviene. */
const TRIGGERS: Record<number, (s: Scene, n: number, card: CardLoc) => boolean> = {
  [E.regina]: (_, n) => n === 1 || n === 2,
  [E.patron]: (_, n) => n === 1,
  [E.medius]: (_, n) => n === 0,
  [E.theoMedius]: (_, n) => n === 1,
  [E.infinity]: (_, n) => n === 1,
  [E.unification]: (_, n) => n === 1,
  [E.purification]: (_, n) => n === 1,
  [E.vidolium]: (_, n) => n === 2,
  [E.nervedo]: (_, n) => n === 1,
  [E.junoldo]: (_, n) => n === 0 || n === 2,
  [E.jupredo]: (_, n) => n === 2,
  [E.junora]: (_, n) => n === 0,
  [E.nonFinito]: (_, n) => n === 1,
  [E.knight]: (_, n) => n === 0,
  [E.purifier]: (_, n) => n === 0,
  [E.diactorus]: (_, n) => n === 2,
  [E.punisher]: (_, n) => n === 1,
}
/** Cuál de sus efectos es el disparo, cuando la pregunta (`select_effectyn`) no lo dice. */
const TRIGGER_N: Record<number, number> = { [E.regina]: 1, [E.patron]: 1, [E.theoMedius]: 1, [E.infinity]: 1, [E.unification]: 1, [E.purification]: 1, [E.vidolium]: 2, [E.nervedo]: 1, [E.junoldo]: 2, [E.jupredo]: 2, [E.nonFinito]: 1 }

function chain(ask: AskOf<'select_chain'>, s: Scene): DeckDecision | null {
  const { view } = s
  const mine = view.turnPlayer === 'me'
  const top = view.chain.at(-1)
  const yours = top?.card?.ref.side === 'theirs' && top.state === 'chained'
  const pick = (code: number, test: (card: CardLoc & { description: string }) => boolean = () => true) => ask.selects.findIndex((card) => card.code === code && test(card))
  const activate = (index: number, id: string, reason?: BotReason): DeckDecision => ({ answer: { type: ask.type, index }, ...(reason ? { reason } : {}), rule: `elfnote.${id}`, intent: { id, code: ask.selects[index]!.code } })

  // Sus disparos (Regina al centro, Power Patron como material, Medius, las Ars Magna desterradas…).
  for (const [index, card] of ask.selects.entries()) {
    const trigger = TRIGGERS[card.code]
    const n = nOf(card.description)

    if (trigger && trigger(s, n, card)) return activate(index, `trigger.${card.code}.${n}`, reasonOf('play.trigger', card.code))
  }
  if (ask.forced || mine) return null
  const free = view.chain.length === 0 || yours
  const main = (view.phase & (PHASE.MAIN1 | PHASE.MAIN2)) !== 0

  // Contra tu eslabón: Number 90 (tu efecto de monstruo), Impasto (lo niega y lo destruye; Non-Finito vuelve en la End Phase), Diactorus (niega tu carta del campo), Rhapsodia (niega tu
  // carta boca arriba). Si vale gastarla (`mayInterrupt`).
  if (yours && top.card && mayInterrupt(view, s.facts, RESPONDERS)) {
    const place = top.card.place
    const source = place ? atPlace(view, place) : null
    const monster = place?.location === LOC.MZONE || ((s.facts(top.code)?.type ?? 0) & 0x1) !== 0
    const n90 = pick(E.n90)

    if (n90 >= 0 && monster && !s.done.has('respond.n90')) return activate(n90, 'respond.n90', reasonOf('handtrap.respond', E.n90, top.code))
    const impasto = pick(E.impasto)

    if (impasto >= 0 && monster && !s.done.has('respond.impasto')) return activate(impasto, 'respond.impasto', reasonOf('handtrap.respond', E.impasto, top.code))
    const diactorus = pick(E.diactorus, (card) => card.location === LOC.MZONE)

    if (diactorus >= 0 && source && !s.done.has('respond.diactorus')) return activate(diactorus, 'respond.diactorus', reasonOf('handtrap.respond', E.diactorus, top.code))
    const rhapsodia = pick(E.rhapsodia, (card) => card.location === LOC.SZONE)

    if (rhapsodia >= 0 && source && source.pos !== 'set' && !s.done.has('respond.rhapsodia') && monstersOf(view.me).some((card) => ((s.facts(card.code)?.type ?? 0) & 0x2000) !== 0)) {
      return activate(rhapsodia, 'respond.rhapsodia', reasonOf('handtrap.respond', E.rhapsodia, top.code))
    }
  }
  // Tu ataque recién declarado: Lucina lo devuelve a la mano si es de Nivel 6 o menos.
  const attack = view.chain.length === 0 && (ask.hint_timing_other & ATTACK_TIMING) !== 0 ? lastAttack(view) : null

  if (attack) {
    const lucina = pick(E.lucina)

    if (lucina >= 0 && (s.facts(attack.code)?.level ?? 99) <= 6 && !s.done.has('attack.lucina')) return activate(lucina, 'attack.lucina')
  }
  if (!free || !main) return null
  // En tu Main Phase: Lucina y Fortuna te devuelven a la mano un monstruo o una Mágica o Trampa boca arriba; Power Patron Invoca a June Pride o, con cartas tuyas boca arriba,
  // a Junora (sólo pueden atacar los del centro).
  const lucina = pick(E.lucina)

  if (lucina >= 0 && monstersOf(view.them).some((card) => card.code !== 0 && card.pos !== 'set' && (card.stats?.level ?? 99) <= 6) && !s.done.has('quick.lucina')) return activate(lucina, 'quick.lucina')
  const fortuna = pick(E.fortuna)

  if (fortuna >= 0 && view.them.spells.some((card) => card !== null && card.code !== 0 && card.pos !== 'set') && !s.done.has('quick.fortuna')) return activate(fortuna, 'quick.fortuna')
  const patron = pick(E.patron, (card) => card.location === LOC.MZONE)

  if (patron >= 0 && sixInCenter(view) && extraLeft(view, E.junePride) + extraLeft(view, E.junora) > 0 && !s.done.has('quick.patron')) return activate(patron, 'quick.patron', reasonOf('play.synchroYourTurn', E.patron))

  return null
}

/** El índice de la lista con la mejor carta tuya (la más peligrosa a la vista); con `test`, sólo entre ésas. */
const bestOfYours = (s: Scene, list: readonly CardLoc[], test: (card: CardLoc) => boolean = () => true) => {
  const order = ranked(list, (card) => (isMine(s.view, card) || !test(card) ? -Infinity : threatOf(s, card)))

  return order.length > 0 && !isMine(s.view, list[order[0]!]!) && test(list[order[0]!]!) ? order[0]! : -1
}

/**
 * Cuánto conviene usar una carta suya como material: Power Patron y Regina primero (buscan al ir al cementerio); después lo del centro (lo que sale del Extra Deck queda ahí, con
 * Lucina o Fortuna al lado para cambiarse de lugar en tu turno); Lucina y Fortuna, al final.
 */
function materialScore(s: Scene, card: CardLoc): number {
  const code = atPlace(s.view, card)?.code ?? card.code
  const index = MATERIAL.indexOf(code)

  return (index < 0 ? 0 : MATERIAL.length - index) * 10 + (card.location === LOC.MZONE && card.sequence === 2 ? 15 : 0)
}


function choose(ask: CoreAsk, s: Scene): DeckDecision | null {
  const { view } = s
  const current = s.current?.code ?? 0
  const one = (index: number, rule: string, reason?: BotReason): DeckDecision | null =>
    index < 0 || ask.type !== 'select_card' ? null : { answer: { type: ask.type, indices: [index] }, ...(reason ? { reason } : {}), rule: `elfnote.${rule}` }
  const picked = (index: number) => (ask.type === 'select_card' ? (ask.selects[index]?.code ?? 0) : 0)

  switch (ask.type) {
    case 'select_effectyn': {
      const trigger = TRIGGERS[ask.code]

      if (!OWN.has(ask.code) || !trigger) return null
      const n = codeOfDesc(ask.description) === ask.code ? nOf(ask.description) : (TRIGGER_N[ask.code] ?? 0)
      const yes = trigger(s, n, ask)

      return { answer: { type: ask.type, yes }, ...(yes ? { reason: reasonOf('play.trigger', ask.code), intent: { id: `trigger.${ask.code}.${n}`, code: ask.code } } : {}), rule: `elfnote.trigger.${yes ? 'yes' : 'no'}` }
    }
    case 'select_yesno': {
      const code = codeOfDesc(ask.description)
      // Power Patron: Invocar por Sincronía, sí. Strelitzia: bajar los Niveles, no. Terminus: buscar a Medius, sí. Lucina y Fortuna: devolver tu carta, sí.
      // Jupredo: destruir una carta del campo, si tenés alguna. Impasto: devolverte las Mágicas y Trampas, sí.
      const yes: Record<number, boolean> = { [E.patron]: true, [E.strelitzia]: false, [E.terminus]: true, [E.lucina]: true, [E.fortuna]: true, [E.rhapsodia]: true, [E.theoMedius]: true, [E.jupredo]: cardsOf(view.them).length > 0, [E.impasto]: true }
      const answer = yes[code]

      return answer === undefined ? null : { answer: { type: ask.type, yes: answer }, rule: `elfnote.yesno.${code}` }
    }
    case 'select_option': {
      // Medius y Vidolia: Invocar (no a la mano) lo que trae. Lo demás, la primera opción.
      const option = (code: number, n: number) => ask.options.findIndex((item) => codeOfDesc(item) === code && nOf(item) === n)
      const patronMonster = [E.patron, E.junoldo, E.nervedo, E.theoMedius].some((code) => inHand(view, code) || inGrave(view, code))
      const index =
        current === E.medius ? option(E.medius, 3) : current === E.vidolia ? option(E.vidolia, 2) : current === E.vidolium ? option(E.vidolium, patronMonster ? 4 : 5) : current === E.theoMedius ? option(E.theoMedius, 3) : -1

      return index < 0 ? null : { answer: { type: ask.type, index }, rule: `elfnote.option.${current}` }
    }
    case 'select_place': {
      // Lo que Invoca va al centro si está libre (Regina, June Pride y Strelitzia se activan desde ahí); lo que no es Elfnote, a la Zona Extra.
      if (view.turnPlayer !== 'me' || ask.player !== view.seat) return null
      const centerBit = 1 << 2

      if (centerFree(view) && (ask.field_mask & centerBit) === 0 && TO_CENTER.has(current)) {
        return { answer: { type: ask.type, places: [{ player: view.seat, location: LOC.MZONE, sequence: 2 }] }, rule: 'elfnote.place.center' }
      }
      return null
    }
    case 'select_unselect_card': {
      // Materiales de Sincronía o Xyz: Power Patron y Regina primero; con lo justo, termina. June Pride: uno de cada lugar, los de más valor.
      if (ask.can_finish && ask.unselect_cards.length > 0 && current !== E.junePride) return { answer: { type: ask.type, index: null }, rule: 'elfnote.material.done' }
      if (current === E.junePride) {
        if (ask.select_cards.length === 0) return ask.can_finish ? { answer: { type: ask.type, index: null }, rule: 'elfnote.refill.done' } : null
        // Primero un Nivel 6 (va al centro); después Power Patron (si ya subió un Nivel este turno, queda para Invocar a June Pride en el tuyo) y Junoldo (desde el campo Invoca a
        // Junora y devuelve a Power Patron a la mano), antes que otro Nivel 6.
        const six = ask.unselect_cards.some((card) => SIX.has(card.code))
        const order: number[] = six ? [E.patron, E.junoldo, E.regina, E.lucina, E.fortuna] : [E.regina, E.lucina, E.fortuna, E.patron, E.junoldo]
        const index = ranked(ask.select_cards, (card) => (order.includes(card.code) ? order.length - order.indexOf(card.code) : 0))[0]!

        return { answer: { type: ask.type, index }, rule: 'elfnote.refill' }
      }
      const index = ranked(ask.select_cards, (card) => (isMine(view, card) ? materialScore(s, card) : -1))[0]

      return index === undefined ? null : { answer: { type: ask.type, index }, rule: 'elfnote.material' }
    }
    case 'select_card':
      break
    default:
      return null
  }

  const list = ask.selects
  const from = (location: number) => list.every((card) => (card.location & location) !== 0)
  const want = (prefer: readonly number[], rule: string, key?: string) => {
    const index = Math.max(0, firstOf(list, prefer))

    return one(index, rule, key ? reasonOf(key, current, picked(index)) : undefined)
  }

  if (list.every((card) => isMine(view, card))) {
    // Qué Invoca por Sincronía Power Patron: June Pride si se puede.
    if (from(LOC.EXTRA) && current === E.patron) {
      // En tu turno, con cartas tuyas boca arriba, Junora primero (las niega todas al Invocarse).
      const index = Math.max(0, firstOf(list, view.turnPlayer === 'them' && yourFaceUp(view).length > 0 ? [E.junora, ...SYNCHRO] : SYNCHRO))

      return one(index, 'synchro.patron', reasonOf('play.synchroNext', picked(index)))
    }
    // Materiales en un `select_card`.
    if ((current === E.n90 || current === E.patron) && from(LOC.MZONE)) {
      const indices = ranked(list, (card) => materialScore(s, card)).slice(0, Math.max(1, ask.min))

      return { answer: { type: ask.type, indices }, rule: 'elfnote.material' }
    }
    switch (current) {
      case E.lucina:
        return from(LOC.DECK) ? want(lucinaWants(s), 'search.lucina', 'play.search') : null
      case E.fortuna:
        return from(LOC.DECK | LOC.HAND) ? want([E.rhapsodia], 'place.fortuna') : null
      case E.patron:
        return from(LOC.DECK) ? want(patronWants(view), 'search.patron', 'play.search') : null
      case E.regina:
        // Del Deck: Power Patron si no está en el campo (sube el Nivel de Regina); si no, Lucina o Fortuna. Como costo: lo que menos le sirve.
        if (from(LOC.DECK)) return want(onField(view, E.patron) || s.done.has('patron') ? [E.lucina, E.fortuna, E.patron, E.junoldo] : [E.patron, E.lucina, E.fortuna, E.junoldo], 'summon.regina', 'play.extraTo')
        {
          // La del centro primero (ya usó su efecto y le deja el lugar a Regina, que desde ahí trae otro Elfnote); Lucina o Fortuna del campo lo dicen así.
          const centerCard = list.findIndex((card) => card.location === LOC.MZONE && card.sequence === 2)
          const index = centerCard >= 0 ? centerCard : Math.max(0, firstOf(list, REGINA_COST))
          const card = list[index]!

          return one(index, 'cost.regina', reasonOf(card.location === LOC.MZONE ? 'target.spent' : 'target.cost', current, card.code))
        }
      case E.medius:
        // Al volver del cementerio devuelve al Deck lo que menos le sirve de la mano.
        if (!from(LOC.DECK)) return one(ranked(list, (card) => (card.location === LOC.HAND ? 100 : 0) - Math.max(0, DISCARD.indexOf(card.code)))[0]!, 'cost.medius')
        return want([...patronOrJunoldo(s), E.nervedo, E.theoMedius, E.jupredo], 'summon.medius', 'play.extraTo')
      case E.treasure:
        // Nervedo Invoca del Deck a Power Patron o a Junoldo; Jupredo busca a Vidolia.
        return want(deckLeft(view, E.patron) + deckLeft(view, E.junoldo) > 0 ? [E.nervedo, E.jupredo, E.vidolium, E.junoldo] : [E.vidolium, E.jupredo, E.nervedo, E.junoldo], 'treasure')
      case E.nervedo:
        return want([...patronOrJunoldo(s), E.theoMedius, E.jupredo], 'summon.nervedo', 'play.extraTo')
      case E.vidolium:
        if (from(LOC.HAND | LOC.GRAVE)) return want([...patronOrJunoldo(s), E.theoMedius, E.nervedo, E.jupredo], 'summon.vidolium', 'play.extraTo')
        return want(onField(view, E.patron) ? [E.theoMedius, E.patron, E.vidolia, E.terminus, E.junoldo] : [E.patron, E.vidolia, E.theoMedius, E.terminus, E.junoldo], 'search.vidolium', 'play.search')
      case E.junoldo:
        // Su robo descarta lo que menos le sirve; del Extra Deck o el cementerio, Power Patron primero. Desde el campo, Junora (la única).
        if (from(LOC.HAND)) return one(cheapest(list), 'cost.junoldo')
        return want([E.junora, E.patron, E.regina, E.lucina, E.fortuna], 'search.junoldo', 'play.search')
      case E.jupredo:
        // Del Deck: Vidolia si no la tiene; si no, Terminus. Lo que destruye con ella: el Power Patron de la mano (nunca a Elfnote Power Patron).
        if (from(LOC.DECK)) return want(inHand(view, E.vidolia) || onField(view, E.vidolia) ? [E.terminus, E.vidolia] : [E.vidolia, E.terminus], 'search.jupredo', 'play.search')
        {
          const index = list.findIndex((card) => card.location === LOC.HAND && card.code === jupredoFodder(view))
          const other = list.findIndex((card) => card.location === LOC.HAND && card.code !== E.patron)

          return index >= 0 || other >= 0 ? one(index >= 0 ? index : other, 'cost.jupredo') : null
        }
      case E.vidolia: {
        // Revela a Junora (Power Patron y Junoldo la nombran) o a Nerva (Nervedo); destierra lo que menos le sirve; del Deck, Power Patron si no la tiene.
        if (from(LOC.EXTRA)) return want(deckLeft(view, E.patron) + deckLeft(view, E.junoldo) > 0 ? [E.junora, E.nerva] : [E.nerva, E.junora], 'reveal.vidolia')
        if (from(LOC.HAND)) return one(cheapest(list), 'cost.vidolia')
        return want(patronReady(view) ? [E.junoldo, E.nervedo, E.patron] : [...patronOrJunoldo(s), E.nervedo], 'search.vidolia', 'play.extraTo')
      }
      case E.nonFinito:
        // Descarta la Mágica o Trampa que menos le sirve, Tributa a Nervedo y coloca Impasto.
        if (from(LOC.DECK)) return want([E.impasto, E.citrinitas], 'set.nonFinito')
        return one(list.some((card) => card.code === E.nervedo) ? list.findIndex((card) => card.code === E.nervedo) : cheapest(list), 'cost.nonFinito')
      case E.impasto:
        // El Fusión que destierra hasta la End Phase: Non-Finito primero.
        return want([E.nonFinito, E.diactorus, E.nerva], 'cost.impasto')
      case E.citrinitas:
        return want(normalLeft(s) && !inHand(view, E.medius) ? [E.medius, E.unification, E.infinity, E.purification] : [E.unification, E.infinity, E.purification, E.medius], 'search.citrinitas', 'play.search')
      case E.infinity:
        return want(inHand(view, E.citrinitas) || onField(view, E.citrinitas) ? [E.unification, E.purification] : [E.purification, E.unification], 'search.infinity', 'play.search')
      case E.purification:
        return from(LOC.DECK) ? want([E.citrinitas], 'search.purification', 'play.search') : null
      case E.unification:
        if (from(LOC.GRAVE | LOC.REMOVED) && list.every((card) => card.location !== LOC.MZONE)) return want([E.purification, E.infinity], 'revive.unification', 'play.extraTo')
        return want([E.purification, E.infinity, E.unification], 'cost.unification')
      case E.theoMedius:
        return want([E.pastLull, E.theorealize, E.unification, E.infinity, E.purification], 'search.theoMedius', 'play.search')
      case E.pastLull:
        return want([E.medius], 'summon.pastLull', 'play.extraTo')
      case E.terminus:
        return want(from(LOC.DECK | LOC.EXTRA) && list.some((card) => card.code === E.vidolium) ? [E.vidolium, E.nervedo, E.junoldo] : [E.medius, E.theoMedius], 'terminus')
      case E.strelitzia:
      case E.rhapsodia:
        return want([E.lucina, E.regina, E.fortuna], `summon.${current}`, 'play.extraTo')
      case E.junePride:
        return want([E.regina, E.lucina, E.patron, E.junoldo, E.fortuna], 'refill')
      case E.punisher:
        // Su monstruo que menos vale.
        return one(ranked(list, (card) => -materialScore(s, card) - (card.sequence === 2 ? 100 : 0))[0]!, 'cost.punisher')
    }
    return null
  }

  // Lo que devuelve, destruye, niega o destierra lo tuyo: al declarar un ataque, el atacante; si no, tu carta más peligrosa.
  const attack = (view.phase & PHASE.BATTLE) !== 0 ? lastAttack(view) : null
  const attacker = attack ? list.findIndex((card) => !isMine(view, card) && card.location === LOC.MZONE && card.code === attack.code) : -1
  const top = view.chain.findLast((link) => link.card?.ref.side === 'theirs')
  const source = top ? list.findIndex((card) => !isMine(view, card) && card.code === top.code && card.location !== LOC.GRAVE) : -1
  const index = attacker >= 0 ? attacker : current === E.rhapsodia && source >= 0 ? source : bestOfYours(s, list)

  if (index >= 0) {
    const key = current === E.lucina || current === E.fortuna ? 'target.bounce' : current === E.rhapsodia ? 'target.negate' : current === E.punisher ? 'target.banish' : 'target.destroy'

    return one(index, `target.${current}`, reasonOf(key, current, picked(index)))
  }
  return null
}

export const ELFNOTE_EXECUTOR: DeckExecutor = { plays: PLAYS, chain, choose }

/** El bot de Elfnote: el ejecutor y, para lo que no decide, sus handtraps como el rival que juega su turno (`turnBot`). */
export function elfnoteBot(facts: (code: number) => CardFacts | undefined, aliasOf: (code: number) => number = () => 0, attributeOf?: (code: number) => number): Bot {
  const reacts = turnBot(HANDTRAPS, [], aliasOf, attributeOf, facts, (view) => mayInterrupt(view, facts, RESPONDERS, aliasOf))
  // Sus cartas con regla (`chain`): si no la usó, no era el momento, y no se cuenta como «no sé cuándo conviene».
  const fallback: Bot = (ask, view, context) => {
    const decision = reacts(ask, view, context)
    const held = decision.rule === 'handtrap.hold.noRule' ? (decision.reason?.cards?.[0] ?? 0) : 0

    return held && OWN.has(held) && !HANDTRAPS.includes(held) ? { answer: decision.answer, rule: 'elfnote.hold' } : decision
  }

  return executorBot(ELFNOTE_EXECUTOR, facts, fallback)
}

