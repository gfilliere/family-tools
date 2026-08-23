import type { Ingredient } from "../domain/recipe";

export function relativeCooked(value?: string | null): string {
  if (!value) return "never cooked";

  const timestamp = /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}Z`;
  const elapsed = Date.now() - new Date(timestamp).getTime();
  const days = Math.max(0, Math.floor(elapsed / 86_400_000));

  if (days === 0) return "cooked today";
  if (days < 7) return `cooked ${days}d ago`;
  return `cooked ${Math.floor(days / 7)}w ago`;
}

export function ingredientAmount(ingredient: Ingredient): string {
  if (ingredient.qty === null) return ingredient.name;

  const qty = Number.isInteger(ingredient.qty)
    ? ingredient.qty
    : Math.round(ingredient.qty * 100) / 100;
  const unit = ingredient.unit ? ` ${ingredient.unit}` : "";
  return `${qty}${unit} ${ingredient.name}`;
}
