import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { importRecipe, type ImportInput } from "../../api/recipes";
import type { Message } from "../../components/Notice";
import type { RecipeDraft } from "../../domain/recipe";

interface RecipeImport {
  url: string;
  text: string;
  busy: boolean;
  setUrl: (url: string) => void;
  setText: (text: string) => void;
  run: (input: ImportInput) => Promise<void>;
}

export function useRecipeImport(
  initialUrl: string | undefined,
  onImported: (draft: RecipeDraft) => void,
  onMessage: (message: Message) => void,
): RecipeImport {
  const [url, setUrl] = useState(initialUrl ?? "");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const automaticallyImported = useRef(false);

  const run = useCallback(async (input: ImportInput) => {
    setBusy(true);
    onMessage({ kind: "notice", text: "Finding the recipe…" });
    try {
      const draft = await importRecipe(input);
      onMessage({
        kind: "notice",
        text: `Draft imported via ${draft.importTier ?? "import"}. Review it before saving.`,
      });
      onImported(draft);
    } catch (reason) {
      const errorText = reason instanceof Error
        ? reason.message
        : "Could not import recipe.";
      onMessage({ kind: "error", text: errorText });
    } finally {
      setBusy(false);
    }
  }, [onImported, onMessage]);

  useEffect(() => {
    if (!initialUrl || automaticallyImported.current) return;
    automaticallyImported.current = true;
    void run({ url: initialUrl });
  }, [initialUrl, run]);

  return { url, text, busy, setUrl, setText, run };
}
