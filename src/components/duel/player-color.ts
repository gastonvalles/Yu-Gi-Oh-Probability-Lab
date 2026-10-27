/** De quién es lo que se ve: lo tuyo o lo del rival (en la pantalla de quien mira, el anfitrión es "lo tuyo" y el invitado "lo del rival"). */
export type PlayerSide = 'mine' | 'theirs'

/**
 * El color de cada jugador, el mismo en sus puntos de vida y en su globo del chat para que se vea de un vistazo quién es quién: el tuyo, violeta claro; el del rival, ámbar.
 * Las clases van completas (y no armadas con un prefijo) para que Tailwind las encuentre.
 */
export const PLAYER_COLOR: Record<PlayerSide, { /** El nombre en el chat (y el de quién es el turno). */ text: string; /** El borde de la placa de vidas. */ border: string; /** El fondo del globo del chat. */ bubble: string; /** Relleno hondo con el texto blanco: la chapa del dueño en sus vidas y lo que va encima del arte de una carta (la insignia del eslabón): el teñido no se lee sobre una imagen (blanco 7,6:1 sobre el violeta y 4,8:1 sobre el ámbar hondo). */ fill: string; /** La barra de sus vidas (de 8000). */ bar: string }> = {
  mine: { text: 'text-accent', border: 'border-accent/60', bubble: 'bg-accent/20', fill: 'bg-primary text-white', bar: 'bg-accent' },
  theirs: { text: 'text-info-soft', border: 'border-info/55', bubble: 'bg-info/20', fill: 'bg-warning-solid text-white', bar: 'bg-info' },
}
