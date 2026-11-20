export const nutritionGroups = [
  {
    label: "Moj dan",
    primary: { id: "nutrition-overview", label: "Pregled dana" },
    secondary: [
      { id: "nutrition-diary", label: "Dnevnik" },
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

export const nutritionSectionIds = nutritionGroups.flatMap(({ primary, secondary }) =>
  [primary.id, ...secondary.map(({ id }) => id)],
);

export function nutritionGroupFor(sectionId: string) {
  return nutritionGroups.find(({ primary, secondary }) =>
    primary.id === sectionId || secondary.some(({ id }) => id === sectionId),
  ) ?? nutritionGroups[0];
}
