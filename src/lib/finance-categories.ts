// Categorias e subcategorias do módulo Financeiro Pro
// Estruturadas conforme padrão empresarial profissional.

export type FinanceCategoryGroup = {
  group: string;
  direction: "RECEITA" | "DESPESA";
  entryType: "FIXO" | "VARIAVEL" | "CONSUMO";
  items: string[];
};

// Subcategorias (itens da despesa) por categoria principal.
// Quando a categoria estiver presente aqui, o formulário exibe um segundo
// seletor "Item da despesa". Selecionar "Outros" abre campo livre.
export const CATEGORY_SUBITEMS: Record<string, string[]> = {
  "Copa / Cozinha": [
    "Pó de café",
    "Açúcar",
    "Adoçante",
    "Chá",
    "Água mineral",
    "Copos descartáveis",
    "Guardanapo",
    "Papel toalha",
    "Pão",
    "Manteiga",
    "Leite",
    "Biscoitos",
    "Gás de cozinha",
    "Utensílios de cozinha",
    "Outros",
  ],
  "Produtos de limpeza": [
    "Água sanitária",
    "Desinfetante",
    "Detergente",
    "Sabão",
    "Álcool",
    "Papel higiênico",
    "Saco de lixo",
    "Esponja",
    "Pano de limpeza",
    "Luvas",
    "Produto multiuso",
    "Outros",
  ],
};

export function getSubitems(category: string | null | undefined): string[] {
  if (!category) return [];
  return CATEGORY_SUBITEMS[category] || [];
}

export const FINANCE_CATEGORIES: FinanceCategoryGroup[] = [
  {
    group: "Receitas",
    direction: "RECEITA",
    entryType: "VARIAVEL",
    items: [
      "Matrículas",
      "Mensalidades",
      "Taxa de material",
      "Taxa de certificado",
      "Receita recorrente",
      "Receita extra",
      "Juros",
      "Multas",
      "Outros recebimentos",
    ],
  },
  {
    group: "Despesas Fixas",
    direction: "DESPESA",
    entryType: "FIXO",
    items: [
      "Aluguel",
      "Condomínio",
      "Energia elétrica",
      "Água",
      "Internet",
      "Telefone",
      "Sistema/Software",
      "Hospedagem",
      "Domínio",
      "APIs",
      "Contabilidade",
      "Jurídico",
      "Honorários",
      "Certificado digital",
      "Taxas bancárias",
    ],
  },
  {
    group: "Folha de Pagamento",
    direction: "DESPESA",
    entryType: "FIXO",
    items: [
      "Salários",
      "Adiantamento salarial",
      "Décimo terceiro",
      "Férias",
      "Vale transporte",
      "Vale alimentação",
      "Comissão",
      "Prestação de serviço extra",
      "Freelancer",
      "Horas extras",
      "Professores",
      "Pró-labore",
    ],
  },
  {
    group: "Marketing",
    direction: "DESPESA",
    entryType: "VARIAVEL",
    items: [
      "Meta Ads",
      "Google Ads",
      "Designer",
      "Social Media",
      "Impressões",
      "Brindes",
      "Panfletos",
    ],
  },
  {
    group: "Operacional",
    direction: "DESPESA",
    entryType: "CONSUMO",
    items: [
      "Material didático",
      "Material escritório",
      "Limpeza",
      "Equipamentos",
      "Manutenção",
      "Impressora",
      "Computadores",
    ],
  },
  {
    group: "Impostos",
    direction: "DESPESA",
    entryType: "FIXO",
    items: ["DAS", "ISS", "Nota fiscal", "Impostos diversos"],
  },
  {
    group: "Consumo da Empresa",
    direction: "DESPESA",
    entryType: "CONSUMO",
    items: ["Copa / Cozinha", "Produtos de limpeza"],
  },
];

export const ALL_CATEGORIES: string[] = FINANCE_CATEGORIES.flatMap((g) => g.items);

export function findCategoryGroup(category: string | null | undefined) {
  if (!category) return null;
  return FINANCE_CATEGORIES.find((g) => g.items.includes(category)) || null;
}
