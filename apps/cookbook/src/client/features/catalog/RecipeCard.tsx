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
      <div class="recipe-thumb-container">
        {recipe.imageUrl ? (
          <img
            class="recipe-thumb"
            src={recipe.imageUrl}
            alt=""
            loading="lazy"
          />
        ) : (
          <div class="recipe-thumb-fallback" aria-hidden="true">
            <svg
              class="recipe-fallback-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 11h18" />
              <path d="M19 11v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-6" />
              <path d="M8 7a4 4 0 0 1 8 0" />
              <circle cx="12" cy="4" r="1" />
            </svg>
          </div>
        )}
      </div>

      <div class="recipe-card-content">
        <div class="recipe-card-header">
          <h2 class="recipe-card-title">{recipe.title}</h2>
          <span class={`recipe-cooked-status ${recipe.lastCookedAt ? "cooked" : "never"}`}>
            {recipe.lastCookedAt ? relativeCooked(recipe.lastCookedAt) : "Not cooked yet"}
          </span>
        </div>

        <div class="recipe-meta">
          {recipe.cookMinutes && <span>{recipe.cookMinutes} min</span>}
          <span>{recipe.ingredientCount} {recipe.ingredientCount === 1 ? "ingredient" : "ingredients"}</span>
          {recipe.rating && <Stars value={recipe.rating} />}
        </div>

        {recipe.tags.length > 0 && (
          <div class="tags">
            {recipe.tags.map((tag) => (
              <span key={tag} class="tag-pill">{tag}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
