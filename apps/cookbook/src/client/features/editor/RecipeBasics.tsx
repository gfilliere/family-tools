import type { RecipeDraft } from "../../domain/recipe";
import type { DraftAction } from "./draftReducer";

interface RecipeBasicsProps {
  draft: RecipeDraft;
  dispatch: (action: DraftAction) => void;
}

export function RecipeBasics({ draft, dispatch }: RecipeBasicsProps) {
  return (
    <>
      <label>
        Title
        <input
          required
          maxLength={200}
          value={draft.title}
          onInput={(event) => dispatch({
            type: "fieldChanged",
            field: "title",
            value: event.currentTarget.value,
          })}
        />
      </label>
      <div class="field-grid">
        <label>
          Minutes
          <input
            type="number"
            min="0"
            value={draft.cookMinutes ?? ""}
            onInput={(event) => dispatch({
              type: "fieldChanged",
              field: "cookMinutes",
              value: optionalNumber(event.currentTarget.value),
            })}
          />
        </label>
        <label>
          Servings
          <input
            type="number"
            min="1"
            value={draft.servings ?? ""}
            onInput={(event) => dispatch({
              type: "fieldChanged",
              field: "servings",
              value: optionalNumber(event.currentTarget.value),
            })}
          />
        </label>
        <label>
          Rating
          <select
            value={draft.rating ?? ""}
            onChange={(event) => dispatch({
              type: "fieldChanged",
              field: "rating",
              value: optionalNumber(event.currentTarget.value),
            })}
          >
            <option value="">Unrated</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
    </>
  );
}

function optionalNumber(value: string): number | null {
  return value ? Number(value) : null;
}
