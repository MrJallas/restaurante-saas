const templates: string[] = [
  'Ola, {nome}! Que bom ter voce no {restaurante}. Vamos tornar essa experiencia inesquecivel?',
  'Bem-vindo de volta, {nome}! O {restaurante} sentiu sua falta. Que tal experimentar algo novo hoje?',
  '{nome}, seja muito bem-vindo ao {restaurante}! Nosso cardapio esta cheio de surpresas pra voce.',
  'Oi, {nome}! Preparamos tudo com carinho no {restaurante}. O que vai ser hoje?',
  'Que prazer receber voce, {nome}! No {restaurante}, cada prato conta uma historia.',
  '{nome}, voce chegou na hora certa! Temos novidades deliciosas no {restaurante} hoje.',
  'Ola, {nome}! Ja estamos preparando algo especial pra voce aqui no {restaurante}.',
  'Bem-vindo, {nome}! O {restaurante} esta pronto pra te surpreender. Vamos comecar?',
  '{nome}, que alegria te ver por aqui! O melhor do {restaurante} esta esperando por voce.',
  'Oi, {nome}! No {restaurante}, acreditamos que uma boa refeicao muda o dia. Bora?',
  '{nome}, seja bem-vindo! Nossos chefs estao inspirados hoje no {restaurante}.',
  'Ola, {nome}! Voce merece o melhor do {restaurante}. Me conta, o que esta com vontade?',
  '{nome}, que bom te receber! O {restaurante} preparou um cardapio que vai te encantar.',
  'Bem-vindo ao {restaurante}, {nome}! Posso te ajudar a escolher algo incrivel?',
  '{nome}, ola! Hoje e um otimo dia pra descobrir novos sabores no {restaurante}.',
  'Que honra receber voce, {nome}! O {restaurante} tem opcoes que vao te surpreender.',
  '{nome}, bem-vindo! Cada detalhe no {restaurante} foi pensado pra sua experiencia.',
  'Oi, {nome}! Vamos explorar juntos o que o {restaurante} tem de melhor?',
  '{nome}, que prazer! No {restaurante}, transformamos ingredientes em momentos especiais.',
  'Ola, {nome}! O aroma ja esta no ar... o {restaurante} esta pronto pra voce.',
  '{nome}, seja muito bem-vindo! Deixa eu te contar sobre as delicias do {restaurante}.',
  'Bem-vindo, {nome}! Aqui no {restaurante}, sabor e nossa especialidade.',
  '{nome}, oi! Temos pratos incriveis te esperando no {restaurante}. Vamos la?',
  'Ola, {nome}! O {restaurante} esta feliz em te receber. Me diz, posso sugerir algo?',
  '{nome}, que bom que veio! Hoje o cardapio do {restaurante} esta imperdivel.',
  'Bem-vindo ao {restaurante}, {nome}! Estou aqui pra tornar sua escolha mais facil.',
  '{nome}, ola! Sabia que o {restaurante} tem opcoes pra todos os gostos? Vamos ver?',
  'Oi, {nome}! Sua mesa esta pronta e o {restaurante} esta a postos. O que deseja?',
  '{nome}, que maravilha te ter aqui! O {restaurante} reservou o melhor pra voce.',
  'Ola, {nome}! Cada visita ao {restaurante} e uma nova aventura gastronomica. Bora?',
];

// Templates extras para clientes que voltam (com referencia ao historico)
const returningTemplates: string[] = [
  '{nome}, que bom te ver de novo! Da ultima vez voce pediu {ultimo_prato}. Quer repetir ou experimentar algo novo?',
  'Ola, {nome}! Lembro que voce gostou de {ultimo_prato}. Temos opcoes parecidas e novidades!',
  '{nome}, bem-vindo de volta ao {restaurante}! Que tal {ultima_bebida} pra acompanhar sua refeicao hoje?',
  'Oi, {nome}! Voce ja e de casa! Sua {ultima_sobremesa} continua no cardapio, viu?',
  '{nome}, que prazer te receber novamente! Preparamos novidades desde sua ultima visita.',
];

interface TemplateVariables {
  nome: string;
  restaurante: string;
  ultimo_prato?: string;
  ultima_bebida?: string;
  ultima_sobremesa?: string;
}

export function renderTemplate(templateIndex: number, variables: TemplateVariables): string {
  const allTemplates = [...templates, ...returningTemplates];
  const idx = templateIndex % allTemplates.length;
  let message = allTemplates[idx];

  message = message.replace(/\{nome\}/g, variables.nome);
  message = message.replace(/\{restaurante\}/g, variables.restaurante);

  if (variables.ultimo_prato) {
    message = message.replace(/\{ultimo_prato\}/g, variables.ultimo_prato);
  } else {
    message = message.replace(/\{ultimo_prato\}/g, 'um dos nossos pratos');
  }

  if (variables.ultima_bebida) {
    message = message.replace(/\{ultima_bebida\}/g, variables.ultima_bebida);
  } else {
    message = message.replace(/\{ultima_bebida\}/g, 'uma de nossas bebidas');
  }

  if (variables.ultima_sobremesa) {
    message = message.replace(/\{ultima_sobremesa\}/g, variables.ultima_sobremesa);
  } else {
    message = message.replace(/\{ultima_sobremesa\}/g, 'uma de nossas sobremesas');
  }

  return message;
}

export const TOTAL_TEMPLATES = templates.length + returningTemplates.length;
