/**
 * Relógio e barreiras para a gravação da "noite cheia".
 *
 * O vídeo final é um grid 2x2 com as quatro personas lado a lado, e o que ele
 * precisa provar é SIMULTANEIDADE: quando o cliente age, a tela do staff reage
 * na mesma hora. Isso só lê bem se os quatro vídeos estiverem alinhados no
 * tempo.
 *
 * Alinhar por "cada um faz sua parte e torcemos" não funciona: um login que
 * demora 2s a mais desloca a persona inteira e a reação cruzada cai fora do
 * quadro. Então usamos duas ferramentas:
 *
 *   Relogio  — todos partem do MESMO t0 e agendam ações em marcas absolutas
 *              ("aos 12s eu clico"), não em atrasos relativos.
 *   Barreira — quando uma persona precisa do resultado de outra (a recepção só
 *              aprova depois que o cliente pediu acesso), quem depende espera
 *              o sinal em vez de chutar um sleep.
 */

export class Relogio {
  private t0: number;

  constructor() {
    this.t0 = Date.now();
  }

  /** Reinicia a origem. Chame quando as 4 abas já estiverem carregadas. */
  zerar() {
    this.t0 = Date.now();
  }

  /** Segundos decorridos, para log. */
  agora(): number {
    return (Date.now() - this.t0) / 1000;
  }

  /**
   * Espera até a marca absoluta `segundos` da linha do tempo. Se a marca já
   * passou, volta na hora — e avisa, porque atraso acumulado é o que
   * desalinha o grid.
   */
  async ate(segundos: number, quem = ''): Promise<void> {
    const alvo = this.t0 + segundos * 1000;
    const falta = alvo - Date.now();
    if (falta <= 0) {
      if (falta < -1500) {
        console.log(`  ⚠ ${quem} atrasou ${Math.round(-falta / 100) / 10}s na marca ${segundos}s`);
      }
      return;
    }
    await new Promise((r) => setTimeout(r, falta));
  }
}

/**
 * Ponto de encontro entre personas. Quem produz chama `libera()`; quem depende
 * chama `espera()`.
 *
 * Tem timeout porque numa gravação é melhor seguir com um quadrante imperfeito
 * do que travar os quatro vídeos esperando um sinal que não vem.
 */
export class Barreira {
  private resolver!: () => void;
  private pronta: Promise<void>;
  private liberada = false;

  constructor(public nome: string) {
    this.pronta = new Promise<void>((r) => {
      this.resolver = r;
    });
  }

  libera() {
    if (this.liberada) return;
    this.liberada = true;
    console.log(`  ✓ barreira liberada: ${this.nome}`);
    this.resolver();
  }

  async espera(timeoutMs = 45_000): Promise<boolean> {
    const estourou = Symbol('timeout');
    const r = await Promise.race([
      this.pronta.then(() => true),
      new Promise((res) => setTimeout(() => res(estourou), timeoutMs)),
    ]);
    if (r === estourou) {
      console.log(`  ⚠ barreira "${this.nome}" estourou ${timeoutMs}ms — seguindo mesmo assim`);
      return false;
    }
    return true;
  }
}
