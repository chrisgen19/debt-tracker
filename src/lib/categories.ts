export type CategoryOption = {
  name: string;
  ideas: string[];
};

export const DEFAULT_CATEGORIES: CategoryOption[] = [
  { name: "Food", ideas: ["Dinner", "Lunch", "Coffee", "Merienda"] },
  { name: "Groceries", ideas: ["Groceries", "Market run", "Water gallon"] },
  { name: "Bills", ideas: ["Electricity", "Water", "Internet", "Rent"] },
  { name: "Shopping", ideas: ["Clothes", "Shoes", "Gadget"] },
  { name: "Travel", ideas: ["Grab", "Gas", "Fare", "Hotel"] },
  { name: "Health", ideas: ["Medicine", "Check-up", "Vitamins"] },
  { name: "Home", ideas: ["Repairs", "Furniture", "Cleaning"] },
  { name: "Other", ideas: ["Gift", "Loan", "Misc"] },
];

export function normalizeCategories(value: unknown): CategoryOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_CATEGORIES.map((category) => ({ ...category, ideas: [...category.ideas] }));
  }

  const categories = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as { name?: unknown; ideas?: unknown };
    if (typeof candidate.name !== "string" || !Array.isArray(candidate.ideas)) return [];
    const name = candidate.name.trim();
    if (!name) return [];
    const ideas = candidate.ideas
      .filter((idea): idea is string => typeof idea === "string")
      .map((idea) => idea.trim())
      .filter(Boolean);
    return [{ name, ideas }];
  });

  return categories.length > 0
    ? categories
    : DEFAULT_CATEGORIES.map((category) => ({ ...category, ideas: [...category.ideas] }));
}

/**
 * The household's categories, plus `current` when it is no longer among them.
 *
 * An entry filed under a category that was later removed from the settings still has
 * to show as selected when it is edited, and saving it unchanged must not be rejected
 * just because its category has since gone. It carries no quick picks: there is
 * nothing to suggest for a category the household stopped offering.
 */
export function categoriesIncluding(categories: CategoryOption[], current?: string): CategoryOption[] {
  if (!current || categories.some((category) => category.name === current)) return categories;
  return [...categories, { name: current, ideas: [] }];
}
