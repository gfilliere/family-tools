import type { Message } from "../../components/Notice";
import type { RecipeDraft } from "../../domain/recipe";
import { useRecipeImport } from "./useRecipeImport";

interface ImportPageProps {
  initialUrl?: string;
  onBack: () => void;
  onImported: (draft: RecipeDraft) => void;
  onMessage: (message: Message) => void;
}

export function ImportPage({
  initialUrl,
  onBack,
  onImported,
  onMessage,
}: ImportPageProps) {
  const importer = useRecipeImport(initialUrl, onImported, onMessage);

  return (
    <section class="panel import-panel">
      <button class="back" onClick={onBack}>← Cookbook</button>
      <div>
        <p class="eyebrow">Bring a recipe home</p>
        <h1>Import recipe</h1>
        <p class="lede">Paste a link. Nothing is saved until you review the draft.</p>
      </div>
      <label>
        Recipe URL
        <input
          type="url"
          value={importer.url}
          onInput={(event) => importer.setUrl(event.currentTarget.value)}
          placeholder="https://…"
        />
      </label>
      <button
        class="primary"
        disabled={importer.busy || !importer.url.trim()}
        onClick={() => void importer.run({ url: importer.url })}
      >
        {importer.busy ? "Importing…" : "Import URL"}
      </button>
      <div class="or"><span>or paste the recipe text</span></div>
      <label>
        Recipe text
        <textarea
          rows={12}
          value={importer.text}
          onInput={(event) => importer.setText(event.currentTarget.value)}
          placeholder="Ingredients and instructions…"
        />
      </label>
      <button
        disabled={importer.busy || !importer.text.trim()}
        onClick={() => void importer.run({ text: importer.text })}
      >
        Extract pasted recipe
      </button>
    </section>
  );
}
