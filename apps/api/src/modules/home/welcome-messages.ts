const templates: string[] = [
  'Olá, {nome}! Que bom ter você no {restaurante}. Vamos tornar essa experiência inesquecível?',
  'Bem-vindo de volta, {nome}! O {restaurante} sentiu sua falta. Que tal experimentar algo novo hoje?',
  '{nome}, seja muito bem-vindo ao {restaurante}! Nosso cardápio está cheio de surpresas pra você.',
  'Oi, {nome}! Preparamos tudo com carinho no {restaurante}. O que vai ser hoje?',
  'Que prazer receber você, {nome}! No {restaurante}, cada prato conta uma história.',
  '{nome}, você chegou na hora certa! Temos novidades deliciosas no {restaurante} hoje.',
  'Olá, {nome}! Já estamos preparando algo especial pra você aqui no {restaurante}.',
  'Bem-vindo, {nome}! O {restaurante} está pronto pra te surpreender. Vamos começar?',
  '{nome}, que alegria te ver por aqui! O melhor do {restaurante} está esperando por você.',
  'Oi, {nome}! No {restaurante}, acreditamos que uma boa refeição muda o dia. Bora?',
  '{nome}, seja bem-vindo! Nossos chefs estão inspirados hoje no {restaurante}.',
  'Olá, {nome}! Você merece o melhor do {restaurante}. Me conta, o que está com vontade?',
  '{nome}, que bom te receber! O {restaurante} preparou um cardápio que vai te encantar.',
  'Bem-vindo ao {restaurante}, {nome}! Posso te ajudar a escolher algo incrível?',
  '{nome}, olá! Hoje é um ótimo dia pra descobrir novos sabores no {restaurante}.',
  'Que honra receber você, {nome}! O {restaurante} tem opções que vão te surpreender.',
  '{nome}, bem-vindo! Cada detalhe no {restaurante} foi pensado pra sua experiência.',
  'Oi, {nome}! Vamos explorar juntos o que o {restaurante} tem de melhor?',
  '{nome}, que prazer! No {restaurante}, transformamos ingredientes em momentos especiais.',
  'Olá, {nome}! O aroma já está no ar... o {restaurante} está pronto pra você.',
  '{nome}, seja muito bem-vindo! Deixa eu te contar sobre as delícias do {restaurante}.',
  'Bem-vindo, {nome}! Aqui no {restaurante}, sabor é nossa especialidade.',
  '{nome}, oi! Temos pratos incríveis te esperando no {restaurante}. Vamos lá?',
  'Olá, {nome}! O {restaurante} está feliz em te receber. Me diz, posso sugerir algo?',
  '{nome}, que bom que veio! Hoje o cardápio do {restaurante} está imperdível.',
  'Bem-vindo ao {restaurante}, {nome}! Estou aqui pra tornar sua escolha mais fácil.',
  '{nome}, olá! Sabia que o {restaurante} tem opções pra todos os gostos? Vamos ver?',
  'Oi, {nome}! Sua mesa está pronta e o {restaurante} está a postos. O que deseja?',
  '{nome}, que maravilha te ter aqui! O {restaurante} reservou o melhor pra você.',
  'Olá, {nome}! Cada visita ao {restaurante} é uma nova aventura gastronômica. Bora?',
];

// Templates extras para clientes que voltam (com referência ao histórico)
const returningTemplates: string[] = [
  '{nome}, que bom te ver de novo! Da última vez você pediu {ultimo_prato}. Quer repetir ou experimentar algo novo?',
  'Olá, {nome}! Lembro que você gostou de {ultimo_prato}. Temos opções parecidas e novidades!',
  '{nome}, bem-vindo de volta ao {restaurante}! Que tal {ultima_bebida} pra acompanhar sua refeição hoje?',
  'Oi, {nome}! Você já é de casa! Sua {ultima_sobremesa} continua no cardápio, viu?',
  '{nome}, que prazer te receber novamente! Preparamos novidades desde sua última visita.',
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
