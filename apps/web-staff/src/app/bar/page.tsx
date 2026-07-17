import { TvKdsBoard } from '../../components/tv/TvKdsBoard';

export const metadata = {
  title: 'Meu bar · Bebidas',
};

/**
 * KDS individual do bartender.
 *
 * A página não está no gate de TV (`/bar/tv` continua protegido por PIN).
 * As chamadas do board passam pelo proxy same-origin e usam o cookie httpOnly
 * `staff_token` emitido no login; apps/api revalida a sessão e o papel antes
 * de avançar qualquer item da estação bar.
 */
export default function BarPage() {
  return (
    <TvKdsBoard
      station="bar"
      title="Meu bar · Bebidas"
      subtitle="Estação individual do bartender"
      iconLabel="🍷"
      iconIsEmoji
      gridColumns={3}
      authMode="staff"
    />
  );
}
