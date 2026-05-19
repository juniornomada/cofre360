import { getCategoryValue } from "@/lib/categories";

type CategoryMatch = {
  group: string;
  sub: string;
  icon: string;
  keywords: string[];
};

// Order matters — first match wins. More specific rules come first.
const CATEGORY_RULES: CategoryMatch[] = [
  // Receita (income patterns)
  { group: "Receita", sub: "Salário", icon: "💼", keywords: [
    "salário", "salario", "holerite", "folha", "pro-labore", "prolabore",
    "remuneração", "remuneracao",
  ]},
  { group: "Receita", sub: "Freelance", icon: "💻", keywords: [
    "freelance", "honorário", "honorario", "comissão", "comissao",
  ]},
  { group: "Receita", sub: "Reembolso", icon: "↩️", keywords: [
    "reembolso", "estorno", "devolução", "devolucao",
  ]},
  { group: "Receita", sub: "Rendimentos", icon: "📈", keywords: [
    "rendimento", "rendimentos", "juros", "dividendo", "dividendos",
    "resgate", "lucro", "aplicação", "aplicacao", "cdb", "tesouro",
    "poupança", "poupanca", "fundo", "corretora", "investimento",
  ]},
  { group: "Receita", sub: "Outros", icon: "💰", keywords: [
    "pix recebido", "transferência recebida", "transferencia recebida",
    "pagamento recebido", "depósito recebido", "deposito recebido",
    "crédito em conta", "credito em conta",
    "ted recebida", "doc recebida",
  ]},

  // Dívidas / Parcelas
  { group: "Dívidas/Parcelas", sub: "Financiamento", icon: "🏦", keywords: [
    "financiamento", "credito financiamento e investimento",
  ]},
  { group: "Dívidas/Parcelas", sub: "Empréstimo", icon: "💸", keywords: [
    "empréstimo", "emprestimo",
  ]},
  { group: "Dívidas/Parcelas", sub: "Consórcio", icon: "📋", keywords: [
    "consórcio", "consorcio",
  ]},
  { group: "Dívidas/Parcelas", sub: "Outros", icon: "📋", keywords: [
    "parcela", "prestação", "prestacao", "portoseg", "refinanciamento",
  ]},

  // Compras > Compras Online
  { group: "Compras", sub: "Compras Online", icon: "🛒", keywords: [
    "shpp brasil", "shopee", "shein", "aliexpress",
    "mercado livre", "mercadolivre", "meli",
    "amazon", "americanas", "magazine", "magalu",
    "compra online", "e-commerce",
    "pagaleve", "picpay", "pagseguro", "pagarme",
    "instituicao de pagamento", "instituição de pagamento",
    "servicos de pagamento", "serviços de pagamento",
  ]},

  // Transferências
  { group: "Transferências", sub: "PIX", icon: "⚡", keywords: [
    "pix enviado", "pix",
  ]},
  { group: "Transferências", sub: "TED/DOC", icon: "🔄", keywords: [
    "ted", "doc",
  ]},
  { group: "Transferências", sub: "Outros", icon: "🔄", keywords: [
    "transferência enviada", "transferencia enviada",
    "transferência", "transferencia",
    "depósito", "deposito",
  ]},

  // Saúde
  { group: "Saúde", sub: "Farmácia", icon: "💊", keywords: [
    "pague menos", "empreendimentos pague menos",
    "farmácia", "farmacia", "drogaria", "droga raia", "drogasil", "pacheco",
  ]},
  { group: "Saúde", sub: "Plano de Saúde", icon: "🏥", keywords: [
    "plano de saúde", "plano de saude", "unimed", "amil", "hapvida", "notredame",
  ]},
  { group: "Saúde", sub: "Consulta Médica", icon: "🩺", keywords: [
    "hospital", "clínica", "clinica", "médico", "medico", "consulta",
  ]},
  { group: "Saúde", sub: "Dentista", icon: "🦷", keywords: [
    "dentista",
  ]},
  { group: "Saúde", sub: "Exames", icon: "🔬", keywords: [
    "laboratório", "laboratorio", "exame",
  ]},
  { group: "Saúde", sub: "Ótica", icon: "👓", keywords: [
    "ótica", "otica",
  ]},

  // Transporte
  { group: "Transporte", sub: "Uber/99", icon: "🚕", keywords: [
    "uber", "99 tecnologia", "99pop", "99taxi", "cabify",
  ]},
  { group: "Transporte", sub: "Combustível", icon: "⛽", keywords: [
    "combustível", "combustivel", "gasolina", "etanol",
    "posto", "shell", "ipiranga", "br distribuidora", "auto posto",
  ]},
  { group: "Transporte", sub: "Estacionamento", icon: "🅿️", keywords: [
    "estacionamento",
  ]},
  { group: "Transporte", sub: "Pedágio", icon: "🛣️", keywords: [
    "pedágio", "pedagio",
  ]},
  { group: "Transporte", sub: "Ônibus/Metrô", icon: "🚌", keywords: [
    "onibus", "ônibus", "metro", "metrô", "trem", "bilhete", "passagem",
  ]},
  { group: "Transporte", sub: "Manutenção", icon: "🔧", keywords: [
    "lavagem", "oficina", "mecânico", "mecanico", "pneu",
  ]},
  { group: "Transporte", sub: "IPVA/Licenciamento", icon: "📋", keywords: [
    "ipva", "licenciamento",
  ]},
  { group: "Transporte", sub: "Outros", icon: "🚗", keywords: [
    "transporte",
  ]},

  // Alimentação
  { group: "Alimentação", sub: "Supermercado", icon: "🛒", keywords: [
    "supermercado", "mercado", "atacadão", "atacadao", "assai", "carrefour", "extra", "big", "dia", "oba hortifruti",
  ]},
  { group: "Alimentação", sub: "Restaurante", icon: "🍽️", keywords: [
    "restaurante", "lanchonete", "mcdonald", "burger", "pizza", "sushi",
    "hamburguer", "refeicao", "refeição", "almoço", "almoco", "jantar",
    "cantina",
  ]},
  { group: "Alimentação", sub: "Delivery", icon: "🛵", keywords: [
    "ifood", "rappi", "uber eats", "ubereats", "delivery", "food",
  ]},
  { group: "Alimentação", sub: "Padaria/Café", icon: "☕", keywords: [
    "padaria", "café", "cafe", "lanche",
  ]},
  { group: "Alimentação", sub: "Açougue/Hortifruti", icon: "🥩", keywords: [
    "açougue", "hortifruti", "feira",
  ]},
  { group: "Alimentação", sub: "Outros", icon: "🍔", keywords: [
    "alimenta",
  ]},

  // Moradia
  { group: "Moradia", sub: "Aluguel", icon: "🏠", keywords: [
    "aluguel",
  ]},
  { group: "Moradia", sub: "Condomínio", icon: "🏢", keywords: [
    "condomínio", "condominio",
  ]},
  { group: "Moradia", sub: "IPTU", icon: "🏛️", keywords: [
    "iptu",
  ]},
  { group: "Moradia", sub: "Energia", icon: "⚡", keywords: [
    "luz", "energia", "enel", "cemig", "cpfl",
  ]},
  { group: "Moradia", sub: "Água", icon: "💧", keywords: [
    "água", "agua", "saneamento", "sabesp", "copasa",
  ]},
  { group: "Moradia", sub: "Internet/Telefone", icon: "📶", keywords: [
    "internet", "wifi", "telefone", "celular", "claro", "vivo", "tim", "oi", "net",
  ]},
  { group: "Moradia", sub: "Outros", icon: "🏠", keywords: [
    "gás", "gas", "seguro residencial",
  ]},

  // Educação
  { group: "Educação", sub: "Mensalidade", icon: "🎓", keywords: [
    "escola", "faculdade", "universidade", "mensalidade",
  ]},
  { group: "Educação", sub: "Cursos Online", icon: "💻", keywords: [
    "udemy", "coursera", "alura", "curso", "treinamento", "aula",
  ]},
  { group: "Educação", sub: "Livros", icon: "📖", keywords: [
    "livro", "livraria",
  ]},
  { group: "Educação", sub: "Outros", icon: "📚", keywords: [
    "educação", "educacao", "material escolar",
  ]},

  // Lazer
  { group: "Lazer", sub: "Cinema/Teatro", icon: "🎬", keywords: [
    "cinema", "teatro", "show", "ingresso",
  ]},
  { group: "Lazer", sub: "Viagem", icon: "✈️", keywords: [
    "viagem", "hotel", "hospedagem", "airbnb", "booking",
  ]},
  { group: "Lazer", sub: "Jogos", icon: "🎮", keywords: [
    "game", "jogo", "playstation", "xbox", "steam",
  ]},
  { group: "Lazer", sub: "Outros", icon: "🎮", keywords: [
    "entretenimento", "parque", "lazer",
  ]},

  // Assinaturas
  { group: "Assinaturas", sub: "Streaming", icon: "📺", keywords: [
    "netflix", "spotify", "disney", "hbo", "amazon prime", "prime video",
    "youtube", "streaming",
  ]},
  { group: "Assinaturas", sub: "Apps/Serviços", icon: "📱", keywords: [
    "assinatura", "anuidade", "subscription",
    "apple", "google", "microsoft", "icloud", "dropbox", "adobe",
  ]},

  // Compras
  { group: "Compras", sub: "Roupas/Calçados", icon: "👕", keywords: [
    "renner", "riachuelo", "c&a", "zara",
    "roupa", "calçado", "calcado", "sapato", "tênis", "tenis",
  ]},
  { group: "Compras", sub: "Eletrônicos", icon: "📱", keywords: [
    "eletronico", "eletrônico",
  ]},
  { group: "Compras", sub: "Outros", icon: "🛍️", keywords: [
    "shopping", "loja", "casas bahia",
  ]},

  // Serviços
  { group: "Serviços", sub: "Manutenção", icon: "🔧", keywords: [
    "serviço", "servico", "manutenção", "manutencao", "reparo",
  ]},
  { group: "Serviços", sub: "Limpeza", icon: "🧹", keywords: [
    "limpeza", "diarista", "empregada",
  ]},
  { group: "Serviços", sub: "Profissionais", icon: "👷", keywords: [
    "jardineiro", "pintor", "eletricista", "encanador",
  ]},

  // Pets
  { group: "Pets", sub: "Veterinário", icon: "🏥", keywords: [
    "veterinário", "veterinario",
  ]},
  { group: "Pets", sub: "Petshop", icon: "🐾", keywords: [
    "petshop", "pet shop", "cobasi", "petz",
  ]},
  { group: "Pets", sub: "Ração/Petiscos", icon: "🦴", keywords: [
    "pet", "ração", "racao",
  ]},

  // Impostos
  { group: "Impostos/Taxas", sub: "IR", icon: "📊", keywords: [
    "irpf",
  ]},
  { group: "Impostos/Taxas", sub: "INSS/FGTS", icon: "🏛️", keywords: [
    "inss", "fgts",
  ]},
  { group: "Impostos/Taxas", sub: "Outros", icon: "🏛️", keywords: [
    "imposto", "taxa", "tributo", "darf", "guia", "contribuição", "contribuicao",
  ]},
];

export function categorizeTransaction(description: string): { category: string; icon: string } {
  const lower = description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.keywords) {
      const normalizedKeyword = keyword.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes(normalizedKeyword)) {
        return { category: getCategoryValue(rule.group, rule.sub), icon: rule.icon };
      }
    }
  }

  return { category: getCategoryValue("Outros", "Outros"), icon: "📄" };
}
