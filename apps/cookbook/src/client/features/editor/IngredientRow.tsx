import type { Ingredient } from "../../domain/recipe";

interface IngredientRowProps {
  ingredient: Ingredient;
  index: number;
  onChange: (index: number, patch: Partial<Ingredient>) => void;
  onRemove: (index: number) => void;
}

export function IngredientRow({
  ingredient,
  index,
  onChange,
  onRemove,
}: IngredientRowProps) {
  return (
    <div class="ingredient-row">
      <div class="ingredient-fields">
        <input
          class="qty"
          type="number"
          step="any"
          min="0"
          placeholder="Qty"
          value={ingredient.qty ?? ""}
          onInput={(event) => onChange(index, {
            qty: event.currentTarget.value ? Number(event.currentTarget.value) : null,
          })}
        />
        <select
          value={ingredient.unit ?? ""}
          onChange={(event) => onChange(index, {
            unit: (event.currentTarget.value || null) as Ingredient["unit"],
          })}
        >
          <option value="">count</option>
          <option>g</option>
          <option>ml</option>
          <option>tsp</option>
          <option>tbsp</option>
        </select>
        <input
          required
          placeholder="Ingredient"
          value={ingredient.name}
          onInput={(event) => onChange(index, {
            name: event.currentTarget.value,
            canonicalName: null,
          })}
        />
        <button
          type="button"
          aria-label="Remove ingredient"
          onClick={() => onRemove(index)}
        >
          ×
        </button>
      </div>
      <input
        class="canonical-name"
        placeholder="Shopping name in English (used to merge items)"
        value={ingredient.canonicalName ?? ""}
        onInput={(event) => onChange(index, {
          canonicalName: event.currentTarget.value || null,
        })}
      />
      <input
        class="original"
        required
        placeholder="Original source line"
        value={ingredient.original}
        onInput={(event) => onChange(index, { original: event.currentTarget.value })}
      />
    </div>
  );
}
