import { useCallback, useReducer, useState } from "preact/hooks";
import { saveRecipe } from "../../api/recipes";
import type { Recipe, RecipeDraft } from "../../domain/recipe";
import { draftReducer, type DraftAction } from "./draftReducer";
import { normaliseDraft } from "./normaliseDraft";

interface RecipeEditor {
  draft: RecipeDraft;
  busy: boolean;
  preview: boolean;
  dispatch: (action: DraftAction) => void;
  setPreview: (preview: boolean) => void;
  save: () => Promise<Recipe | null>;
}

export function useRecipeEditor(
  initialDraft: RecipeDraft,
  onError: (reason: unknown) => void,
): RecipeEditor {
  const [draft, dispatch] = useReducer(draftReducer, initialDraft);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      return await saveRecipe(draft.id, normaliseDraft(draft));
    } catch (reason) {
      onError(reason);
      return null;
    } finally {
      setBusy(false);
    }
  }, [draft, onError]);

  return { draft, busy, preview, dispatch, setPreview, save };
}
