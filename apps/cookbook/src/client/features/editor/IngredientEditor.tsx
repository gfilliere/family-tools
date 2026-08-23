import type { Ingredient } from "../../domain/recipe";
import type { DraftAction } from "./draftReducer";
import { IngredientRow } from "./IngredientRow";

interface IngredientEditorProps {
  ingredients: Ingredient[];
  dispatch: (action: DraftAction) => void;
}

export function IngredientEditor({ ingredients, dispatch }: IngredientEditorProps) {
  return (
    <fieldset>
      <legend>Ingredients</legend>
      {ingredients.map((ingredient, index) => (
        <IngredientRow
          key={ingredient.id ?? index}
          ingredient={ingredient}
          index={index}
          onChange={(position, patch) => dispatch({
            type: "ingredientChanged",
            index: position,
            patch,
          })}
          onRemove={(position) => dispatch({
            type: "ingredientRemoved",
            index: position,
          })}
        />
      ))}
      <button type="button" onClick={() => dispatch({ type: "ingredientAdded" })}>
        + Ingredient
      </button>
    </fieldset>
  );
}
