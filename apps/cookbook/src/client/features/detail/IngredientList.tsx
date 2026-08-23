import type { Ingredient } from "../../domain/recipe";
import { ingredientAmount } from "../../lib/format";

interface IngredientListProps {
  ingredients: Ingredient[];
}

export function IngredientList({ ingredients }: IngredientListProps) {
  return (
    <section>
      <h2 class="section-label">Ingredients</h2>
      <ul class="ingredients">
        {ingredients.map((ingredient, index) => (
          <li key={ingredient.id ?? index}>
            <strong>{ingredientAmount(ingredient)}</strong>
            <small>
              {ingredient.original}
              {ingredient.conversionNote ? ` · ${ingredient.conversionNote}` : ""}
            </small>
          </li>
        ))}
      </ul>
    </section>
  );
}
