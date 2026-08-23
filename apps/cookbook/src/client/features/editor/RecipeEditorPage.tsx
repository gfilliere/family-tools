import type { Message } from "../../components/Notice";
import type { Recipe, RecipeDraft } from "../../domain/recipe";
import { IngredientEditor } from "./IngredientEditor";
import { InstructionsEditor } from "./InstructionsEditor";
import { RecipeBasics } from "./RecipeBasics";
import { useRecipeEditor } from "./useRecipeEditor";

interface RecipeEditorPageProps {
  initialDraft: RecipeDraft;
  onCancel: () => void;
  onError: (reason: unknown) => void;
  onMessage: (message: Message) => void;
  onSaved: (recipe: Recipe) => void;
}

export function RecipeEditorPage({
  initialDraft,
  onCancel,
  onError,
  onMessage,
  onSaved,
}: RecipeEditorPageProps) {
  const editor = useRecipeEditor(initialDraft, onError);
  const { draft, dispatch } = editor;

  async function handleSubmit(event: Event) {
    event.preventDefault();
    const recipe = await editor.save();
    if (!recipe) return;
    onMessage({ kind: "notice", text: "Recipe saved." });
    onSaved(recipe);
  }

  return (
    <form class="recipe-form" onSubmit={(event) => void handleSubmit(event)}>
      <button type="button" class="back" onClick={onCancel}>← Cancel</button>
      <header>
        <p class="eyebrow">Review every detail</p>
        <h1>{draft.id ? "Edit recipe" : "New recipe"}</h1>
      </header>

      <RecipeBasics draft={draft} dispatch={dispatch} />
      <IngredientEditor ingredients={draft.ingredients} dispatch={dispatch} />

      <label>
        Tags
        <input
          value={draft.tags.join(", ")}
          onInput={(event) => dispatch({
            type: "tagsChanged",
            value: event.currentTarget.value,
          })}
          placeholder="weeknight, baking"
        />
      </label>

      <InstructionsEditor
        instructions={draft.instructionsMd}
        preview={editor.preview}
        dispatch={dispatch}
        onPreviewChange={editor.setPreview}
      />

      <label>
        Notes
        <textarea
          rows={4}
          value={draft.notes ?? ""}
          onInput={(event) => dispatch({
            type: "fieldChanged",
            field: "notes",
            value: event.currentTarget.value,
          })}
        />
      </label>
      <label>
        Source URL
        <input
          type="url"
          value={draft.sourceUrl ?? ""}
          onInput={(event) => dispatch({
            type: "fieldChanged",
            field: "sourceUrl",
            value: event.currentTarget.value || null,
          })}
        />
      </label>
      <label>
        Image URL
        <input
          type="url"
          value={draft.imageUrl ?? ""}
          onInput={(event) => dispatch({
            type: "fieldChanged",
            field: "imageUrl",
            value: event.currentTarget.value || null,
          })}
        />
      </label>
      <button class="primary save" disabled={editor.busy}>
        {editor.busy ? "Saving…" : "Save recipe"}
      </button>
    </form>
  );
}
