export const nutritionGroups = [
  {
    label: "Moj dan",
    primary: { id: "nutrition-overview", label: "Moj dan" },
    secondary: [
      { id: "nutrition-trends", label: "Trendovi" },
    ],
  },
  {
    label: "Planer",
    primary: { id: "nutrition-planner", label: "Planer" },
    secondary: [],
  },
  {
    label: "Kuhinja",
    primary: { id: "nutrition-recipes", label: "Recepti" },
    secondary: [
      { id: "nutrition-prep", label: "Priprema" },
      { id: "nutrition-portions", label: "Gotove porcije" },
      { id: "nutrition-ai-recipes", label: "AI recepti" },
    ],
  },
  {
    label: "Zalihe",
    primary: { id: "nutrition-inventory", label: "Stanje zaliha" },
    secondary: [
      { id: "nutrition-shopping", label: "Kupovina" },
      { id: "nutrition-catalog", label: "Katalog" },
      { id: "nutrition-inventory-history", label: "Povijest" },
    ],
  },
];

const sectionAliases: Record<string, string> = {
  "nutrition-diary": "nutrition-overview",
};

export const nutritionSectionIds = [
  ...nutritionGroups.flatMap(({ primary, secondary }) => [primary.id, ...secondary.map(({ id }) => id)]),
  ...Object.keys(sectionAliases),
];

export function nutritionViewForHash(hash: string) {
  const id = hash.slice(1);
  const section = nutritionSectionIds.includes(id) ? sectionAliases[id] ?? id : "nutrition-overview";
  return section.slice("nutrition-".length);
}

export function nutritionGroupFor(sectionId: string) {
  const section = sectionAliases[sectionId] ?? sectionId;
  return nutritionGroups.find(({ primary, secondary }) =>
    primary.id === section || secondary.some(({ id }) => id === section),
  ) ?? nutritionGroups[0];
}
