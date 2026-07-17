import type { ReactElement } from 'react';
import { TvKdsBoard } from '../../components/tv/TvKdsBoard';
import BarPage from './page';
import BarTvPage from './tv/page';

describe('rotas do bar', () => {
  it('/bar monta o KDS individual na estação bar', () => {
    const element = BarPage() as ReactElement<{
      station: string;
      title: string;
      subtitle: string;
      authMode: string;
    }>;

    expect(element.type).toBe(TvKdsBoard);
    expect(element.props.station).toBe('bar');
    expect(element.props.title).toBe('Meu bar · Bebidas');
    expect(element.props.subtitle).toContain('individual');
    expect(element.props.authMode).toBe('staff');
  });

  it('/bar/tv permanece como display separado', () => {
    const element = BarTvPage() as ReactElement<{
      station: string;
      title: string;
      authMode?: string;
    }>;

    expect(element.type).toBe(TvKdsBoard);
    expect(element.props.station).toBe('bar');
    expect(element.props.title).toBe('Bar · Bebidas');
    expect(element.props.authMode).toBeUndefined();
  });
});
