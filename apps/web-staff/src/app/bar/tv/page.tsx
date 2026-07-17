import { TvKdsBoard } from '../../../components/tv/TvKdsBoard';

export const metadata = {
  title: 'Bar · Bebidas',
};

export default function BarTvPage() {
  return (
    <TvKdsBoard
      station="bar"
      title="Bar · Bebidas"
      subtitle="Estação do bar"
      iconLabel="🍷"
      iconIsEmoji
      gridColumns={3}
    />
  );
}
