// Reapplies common Portuguese accents to text that often arrives unaccented
// from bank CSV exports, OCR, or external systems.
//
// Matching is case-insensitive against the unaccented form and preserves the
// original casing of each word (lowercase, Capitalized, or UPPERCASE).

const ACCENT_MAP: Record<string, string> = {
  // ---------------- Finance / banking ----------------
  cartao: "cartão", cartoes: "cartões",
  credito: "crédito", creditos: "créditos",
  debito: "débito", debitos: "débitos",
  transacao: "transação", transacoes: "transações",
  divida: "dívida", dividas: "dívidas",
  transferencia: "transferência", transferencias: "transferências",
  descricao: "descrição", descricoes: "descrições",
  deposito: "depósito", depositos: "depósitos",
  emprestimo: "empréstimo", emprestimos: "empréstimos",
  prestacao: "prestação", prestacoes: "prestações",
  comissao: "comissão", comissoes: "comissões",
  pensao: "pensão", pensoes: "pensões",
  liquidacao: "liquidação",
  servico: "serviço", servicos: "serviços",
  juridico: "jurídico", juridica: "jurídica",
  publico: "público", publica: "pública",
  cobranca: "cobrança", cobrancas: "cobranças",
  contribuicao: "contribuição", contribuicoes: "contribuições",
  aplicacao: "aplicação", aplicacoes: "aplicações",
  resgate: "resgate",
  rendimento: "rendimento",
  investimento: "investimento", investimentos: "investimentos",
  acoes: "ações", acao: "ação",
  poupanca: "poupança",
  saldo: "saldo",
  tarifa: "tarifa", tarifas: "tarifas",
  imposto: "imposto", impostos: "impostos",
  reembolso: "reembolso",
  pagamento: "pagamento", pagamentos: "pagamentos",
  recebimento: "recebimento", recebimentos: "recebimentos",
  recebido: "recebido", recebida: "recebida",
  enviado: "enviado", enviada: "enviada",
  agencia: "agência", agencias: "agências",
  proximo: "próximo", proxima: "próxima",
  ultimo: "último", ultima: "última",
  numero: "número", numeros: "números",
  codigo: "código", codigos: "códigos",
  referencia: "referência", referencias: "referências",
  historico: "histórico",
  titulo: "título", titulos: "títulos",
  vencimento: "vencimento",

  // Currencies
  dolar: "dólar", dolares: "dólares",
  iene: "iene",
  libra: "libra",

  // ---------------- Common nouns / adjectives ----------------
  area: "área", areas: "áreas",
  agua: "água", aguas: "águas",
  energia: "energia",
  refeicao: "refeição", refeicoes: "refeições",
  educacao: "educação",
  saude: "saúde",
  farmacia: "farmácia", farmacias: "farmácias",
  medico: "médico", medica: "médica",
  hospital: "hospital",
  veiculo: "veículo", veiculos: "veículos",
  combustivel: "combustível", combustiveis: "combustíveis",
  manutencao: "manutenção",
  restauracao: "restauração",
  restaurante: "restaurante", restaurantes: "restaurantes",
  padaria: "padaria",
  cafe: "café", cafes: "cafés",
  acucar: "açúcar",
  almoco: "almoço",
  cha: "chá",
  loteria: "loteria",
  taxi: "táxi", taxis: "táxis",
  onibus: "ônibus",
  aviao: "avião", avioes: "aviões",
  estacao: "estação", estacoes: "estações",
  hoteis: "hotéis",
  hospedagem: "hospedagem",
  passagem: "passagem", passagens: "passagens",
  servidor: "servidor",
  internet: "internet",
  telefonica: "telefônica", telefonico: "telefônico",
  televisao: "televisão",
  eletrica: "elétrica", eletrico: "elétrico",
  eletronico: "eletrônico", eletronicos: "eletrônicos",
  comercio: "comércio", comercial: "comercial",
  industria: "indústria", industrias: "indústrias",
  empresa: "empresa", empresas: "empresas",
  associacao: "associação", associacoes: "associações",
  organizacao: "organização", organizacoes: "organizações",
  instituicao: "instituição", instituicoes: "instituições",
  educacional: "educacional",
  consultoria: "consultoria",
  advocacia: "advocacia",
  contabilidade: "contabilidade",
  gestao: "gestão",
  administracao: "administração",
  operacao: "operação", operacoes: "operações",
  promocao: "promoção", promocoes: "promoções",
  protecao: "proteção",
  inscricao: "inscrição", inscricoes: "inscrições",
  matricula: "matrícula", matriculas: "matrículas",
  mensalidade: "mensalidade", mensalidades: "mensalidades",
  anuidade: "anuidade",
  parcela: "parcela", parcelas: "parcelas",
  fatura: "fatura", faturas: "faturas",
  mes: "mês", meses: "meses",
  estorno: "estorno",
  recarga: "recarga",
  saque: "saque",
  juros: "juros",
  taxa: "taxa", taxas: "taxas",

  // Pronouns / connectors / common words
  voce: "você", voces: "vocês",
  nao: "não",
  sao: "são",
  esta: "está",
  ja: "já",
  ate: "até",
  apos: "após",
  porem: "porém",
  tambem: "também",
  alem: "além",
  atras: "atrás",
  pe: "pé", pes: "pés",
  pos: "pós",
  pre: "pré",
  noticia: "notícia", noticias: "notícias",
  assistencia: "assistência",
  emergencia: "emergência",
  experiencia: "experiência",
  ciencia: "ciência",
  paciencia: "paciência",
  conferencia: "conferência",
  preferencia: "preferência",
  diferenca: "diferença",
  presenca: "presença",
  licenca: "licença",
  seguranca: "segurança",
  crianca: "criança", criancas: "crianças",

  // Months
  janeiro: "janeiro",
  fevereiro: "fevereiro",
  marco: "março",
  abril: "abril",
  maio: "maio",
  junho: "junho",
  julho: "julho",
  agosto: "agosto",
  setembro: "setembro",
  outubro: "outubro",
  novembro: "novembro",
  dezembro: "dezembro",
};

function applyCasing(original: string, replacement: string): string {
  if (original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

// Detects and fixes UTF-8 text that was decoded as Latin-1 (mojibake).
// Examples: "DÃ³lar" → "Dólar", "TransferÃªncia" → "Transferência",
//           "cartÃ£o" → "cartão", "dÃ­vida" → "dívida".
function fixMojibake(input: string): string {
  if (!input) return input;
  // The signature pattern is "Ã" followed by another high-bit char.
  if (!/Ã[\x80-\xBF\u00A0-\u00FF]/.test(input)) return input;
  try {
    const bytes = new Uint8Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      // If a character is outside Latin-1 range, the string isn't pure mojibake.
      if (code > 0xff) return input;
      bytes[i] = code;
    }
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    // Only accept the fix if it actually removed the mojibake markers.
    if (decoded.includes("\uFFFD")) return input;
    return decoded;
  } catch {
    return input;
  }
}

export function restoreAccents(input: string): string {
  if (!input) return input;
  const fixed = fixMojibake(input);
  return fixed.replace(/\p{L}+/gu, (word) => {
    const key = word
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const replacement = ACCENT_MAP[key];
    if (!replacement) return word;
    return applyCasing(word, replacement);
  });
}

