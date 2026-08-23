import { useCallback, useEffect, useState } from "preact/hooks";
import {
  addRecipeToList,
  deleteRecipe,
  getRecipe,
  markRecipeCooked,
} from "../../api/recipes";
import type { Recipe } from "../../domain/recipe";

type DetailAction = "cooked" | "list" | "delete" | null;

interface RecipeDetails {
  recipe: Recipe | null;
  loading: boolean;
  action: DetailAction;
  markCooked: () => Promise<void>;
  addToList: () => Promise<number | null>;
  remove: () => Promise<boolean>;
}

export function useRecipeDetails(
  recipeId: number,
  onError: (reason: unknown) => void,
): RecipeDetails {
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<DetailAction>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getRecipe(recipeId)
      .then((loaded) => {
        if (active) setRecipe(loaded);
      })
      .catch(onError)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onError, recipeId]);

  const markCooked = useCallback(async () => {
    setAction("cooked");
    try {
      const cookedAt = await markRecipeCooked(recipeId);
      setRecipe((current) => current ? { ...current, lastCookedAt: cookedAt } : null);
    } catch (reason) {
      onError(reason);
      throw reason;
    } finally {
      setAction(null);
    }
  }, [onError, recipeId]);

  const addToList = useCallback(async () => {
    setAction("list");
    try {
      return await addRecipeToList(recipeId);
    } catch (reason) {
      onError(reason);
      return null;
    } finally {
      setAction(null);
    }
  }, [onError, recipeId]);

  const remove = useCallback(async () => {
    setAction("delete");
    try {
      await deleteRecipe(recipeId);
      return true;
    } catch (reason) {
      onError(reason);
      return false;
    } finally {
      setAction(null);
    }
  }, [onError, recipeId]);

  return { recipe, loading, action, markCooked, addToList, remove };
}
