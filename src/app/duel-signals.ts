/**
 * Las señales rápidas: "pensando" (🤔) y "continuá" (👍). Viajan como mensajes de chat, sólo con su emoji (sin texto): el rival las reconoce por el emoji,
 * en cualquier idioma (un cliente viejo ve el emoji en el chat), y salen un instante como un globo junto a las vidas de quien las manda (ver `useSignals`).
 *
 * El ✋ «Esperá» y el 💭 con texto de antes ya no son señales: si un cliente viejo los manda, se ven como un mensaje más.
 */
const THINKING = '🤔'
const GOOD = '👍'

export const thinkingMessage = () => THINKING
export const GOOD_MESSAGE = GOOD
/** Las señales son un emoji solo: se dibujan grandes, como una reacción. */
export const isEmojiSignal = (text: string) => text === GOOD || text === THINKING
