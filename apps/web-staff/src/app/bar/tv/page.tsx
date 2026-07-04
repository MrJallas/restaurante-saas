import { TvKdsBoard } from '../../../components/tv/TvKdsBoard';

export const metadata = {
  title: 'Bar · Bebidas',
};

export default function BarTvPage() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <TvKdsBoard
        station="bar"
        title="Bar · Bebidas"
        subtitle="Estação do bar"
        iconLabel="🍷"
        iconIsEmoji
        gridColumns={3}
      />
    </>
  );
}
