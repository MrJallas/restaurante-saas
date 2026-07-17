import { TvKdsBoard } from '../../../components/tv/TvKdsBoard';

export const metadata = {
  title: 'Cozinha · KDS',
};

export default function CozinhaTvPage() {
  return (
    <TvKdsBoard
      station="kitchen"
      title="Cozinha · KDS"
      subtitle="Estação principal"
      iconLabel="🍳"
      iconIsEmoji
      gridColumns={4}
    />
  );
}
