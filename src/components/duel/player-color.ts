/** De quién es lo que se ve: lo tuyo o lo del rival (en la pantalla de quien mira, el anfitrión es "lo tuyo" y el invitado "lo del rival"). */
export type PlayerSide = 'mine' | 'theirs'

/**
 * El color de cada jugador, el mismo en sus puntos de vida y en su globo del chat para que se vea de un vistazo quién es quién: el tuyo, violeta claro; el del rival, ámbar.
 * Las clases van completas (y no armadas con un prefijo) para que Tailwind las encuentre.
 */
export const PLAYER_COLOR: Record<PlayerSide, { /** El número de las vidas y el nombre en el chat. */ text: string; /** El borde de la casilla de vidas. */ border: string; /** El fondo del globo del chat. */ bubble: string }> = {
  mine: { text: 'text-accent', border: 'border-accent/50', bubble: 'bg-accent/20' },
  theirs: { text: 'text-info-soft', border: 'border-info/50', bubble: 'bg-info/20' },
}
