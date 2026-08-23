import { Stars } from "../../components/Stars";
import type { RecipeSummary } from "../../domain/recipe";
import { relativeCooked } from "../../lib/format";

interface RecipeCardProps {
  recipe: RecipeSummary;
  onOpen: (id: number) => void;
}

export function RecipeCard({ recipe, onOpen }: RecipeCardProps) {
  return (
    <button class="recipe-card" onClick={() => onOpen(recipe.id)}>
      <div class="card-top">
        <h2>{recipe.title}</h2>
        <span class={`cooked-badge ${recipe.lastCookedAt ? "" : "never"}`}>
          {relativeCooked(recipe.lastCookedAt)}
        </span>
      </div>
      <div class="recipe-meta">
        <Stars value={recipe.rating} />
        <span>{recipe.cookMinutes ? `${recipe.cookMinutes} min` : "No time"}</span>
        <span>{recipe.ingredientCount} ingredients</span>
      </div>
      {recipe.tags.length > 0 && (
        <div class="tags">
          {recipe.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
    </button>
  );
}
