/**
 * Las dos señales rápidas que tiene DuelingBook: "pensando" (🤔) y "todo bien / paso" (👍). Viajan como mensajes de chat, sólo con su emoji (sin texto): el rival las
 * reconoce por el emoji, en cualquier idioma, y además salen un instante como un globo junto a las vidas de quien las manda (ver `useSignals`).
 * El 💭 con su texto es el de las versiones anteriores: se sigue reconociendo.
 */
const THINKING = '🤔'
const LEGACY_THINKING = '💭'
const GOOD = '👍'

export const thinkingMessage = () => THINKING
export const GOOD_MESSAGE = GOOD
/** Las dos señales de un emoji solo (sin el 💭 con texto de antes): se dibujan grandes, como una reacción. */
export const isEmojiSignal = (text: string) => text === GOOD || text === THINKING
export const isSignal = (text: string) => text === GOOD || text === THINKING || text.startsWith(LEGACY_THINKING)
