import { Markdown } from "../../components/Markdown";
import type { Message } from "../../components/Notice";
import { Stars } from "../../components/Stars";
import { recipeToDraft, type RecipeDraft } from "../../domain/recipe";
import { IngredientList } from "./IngredientList";
import { useRecipeDetails } from "./useRecipeDetails";

interface RecipeDetailPageProps {
  recipeId: number;
  onBack: () => void;
  onDeleted: () => void;
  onEdit: (draft: RecipeDraft) => void;
  onError: (reason: unknown) => void;
  onMessage: (message: Message) => void;
}

export function RecipeDetailPage({
  recipeId,
  onBack,
  onDeleted,
  onEdit,
  onError,
  onMessage,
}: RecipeDetailPageProps) {
  const details = useRecipeDetails(recipeId, onError);
  const { recipe } = details;

  if (details.loading && !recipe) return <p class="empty">Loading recipe…</p>;
  if (!recipe) return <p class="empty">Recipe not found.</p>;
  const recipeTitle = recipe.title;

  async function handleCooked() {
    try {
      await details.markCooked();
      onMessage({ kind: "notice", text: "Marked as cooked today." });
    } catch {
      // The hook has already reported the request error.
    }
  }

  async function handleAddToList() {
    const added = await details.addToList();
    if (added !== null) {
      onMessage({
        kind: "notice",
        text: `${added} ingredients added to the shopping list.`,
      });
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete “${recipeTitle}”?`)) return;
    if (await details.remove()) onDeleted();
  }

  return (
    <article class="detail">
      <button class="back" onClick={onBack}>← Cookbook</button>
      {recipe.imageUrl && <img class="recipe-image" src={recipe.imageUrl} alt="" />}
      <header>
        <p class="eyebrow">{recipe.tags.join(" · ") || "Recipe"}</p>
        <h1>{recipe.title}</h1>
        <div class="recipe-meta">
          <Stars value={recipe.rating} />
          {recipe.cookMinutes && <span>{recipe.cookMinutes} min</span>}
          {recipe.servings && <span>serves {recipe.servings}</span>}
        </div>
      </header>
      <div class="wet-actions">
        <button
          class="primary"
          disabled={details.action !== null}
          onClick={() => void handleCooked()}
        >
          ✓ Cooked today
        </button>
        <button
          class="rust"
          disabled={details.action !== null}
          onClick={() => void handleAddToList()}
        >
          + Add to list
        </button>
      </div>
      <IngredientList ingredients={recipe.ingredients} />
      {recipe.instructionsMd && (
        <section>
          <h2 class="section-label">Method</h2>
          <Markdown content={recipe.instructionsMd} />
        </section>
      )}
      {recipe.notes && (
        <section class="notes">
          <h2 class="section-label">Notes</h2>
          <p>{recipe.notes}</p>
        </section>
      )}
      {recipe.sourceUrl && (
        <a
          class="source"
          href={recipe.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          View original recipe ↗
        </a>
      )}
      <div class="minor-actions">
        <button onClick={() => onEdit(recipeToDraft(recipe))}>Edit</button>
        <button
          class="danger"
          disabled={details.action !== null}
          onClick={() => void handleDelete()}
        >
          Delete
        </button>
      </div>
    </article>
  );
}
