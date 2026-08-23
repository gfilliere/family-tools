import { useCallback, useEffect, useMemo, useState } from "preact/hooks";
import { AppNav } from "./components/AppNav";
import { Notice, type Message } from "./components/Notice";
import type { Recipe, RecipeDraft } from "./domain/recipe";
import { CatalogPage } from "./features/catalog/CatalogPage";
import { RecipeDetailPage } from "./features/detail/RecipeDetailPage";
import { RecipeEditorPage } from "./features/editor/RecipeEditorPage";
import { ImportPage } from "./features/import/ImportPage";

type Route =
  | { name: "catalog" }
  | { name: "detail"; recipeId: number }
  | { name: "import"; initialUrl?: string }
  | { name: "editor"; draft: RecipeDraft; returnTo: Exclude<Route, { name: "editor" }> };

interface InitialState {
  route: Route;
  message: Message | null;
  hasQuery: boolean;
}

export function App() {
  const initial = useMemo(readInitialState, []);
  const [route, setRoute] = useState<Route>(initial.route);
  const [message, setMessage] = useState<Message | null>(initial.message);

  useEffect(() => {
    if (initial.hasQuery) history.replaceState(null, "", "/cookbook/");
  }, [initial.hasQuery]);

  useEffect(() => {
    scrollTo(0, 0);
  }, [route]);

  const showMessage = useCallback((next: Message) => setMessage(next), []);
  const showError = useCallback((reason: unknown) => {
    setMessage({
      kind: "error",
      text: reason instanceof Error ? reason.message : "Something went wrong.",
    });
  }, []);
  const showCatalog = useCallback(() => setRoute({ name: "catalog" }), []);
  const showDetail = useCallback((recipeId: number) => {
    setRoute({ name: "detail", recipeId });
  }, []);
  const showImport = useCallback(() => setRoute({ name: "import" }), []);
  const showNewEditor = useCallback((draft: RecipeDraft) => {
    setRoute({ name: "editor", draft, returnTo: { name: "catalog" } });
  }, []);
  const showImportedEditor = useCallback((draft: RecipeDraft) => {
    setRoute({ name: "editor", draft, returnTo: { name: "import" } });
  }, []);
  const showEdit = useCallback((draft: RecipeDraft) => {
    if (!draft.id) return;
    setRoute({
      name: "editor",
      draft,
      returnTo: { name: "detail", recipeId: draft.id },
    });
  }, []);
  const handleSaved = useCallback((recipe: Recipe) => {
    setRoute({ name: "detail", recipeId: recipe.id });
  }, []);

  return (
    <main class="cookbook-app">
      <AppNav />
      {message && <Notice message={message} onDismiss={() => setMessage(null)} />}

      {route.name === "catalog" && (
        <CatalogPage
          onCreate={showNewEditor}
          onError={showError}
          onImport={showImport}
          onOpen={showDetail}
        />
      )}
      {route.name === "import" && (
        <ImportPage
          initialUrl={route.initialUrl}
          onBack={showCatalog}
          onImported={showImportedEditor}
          onMessage={showMessage}
        />
      )}
      {route.name === "detail" && (
        <RecipeDetailPage
          recipeId={route.recipeId}
          onBack={showCatalog}
          onDeleted={showCatalog}
          onEdit={showEdit}
          onError={showError}
          onMessage={showMessage}
        />
      )}
      {route.name === "editor" && (
        <RecipeEditorPage
          initialDraft={route.draft}
          onCancel={() => setRoute(route.returnTo)}
          onError={showError}
          onMessage={showMessage}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}

function readInitialState(): InitialState {
  const params = new URLSearchParams(location.search);
  const sharedUrl = params.get("import") ?? undefined;
  const emptyShare = params.get("share") === "empty";

  return {
    route: sharedUrl || emptyShare
      ? { name: "import", initialUrl: sharedUrl }
      : { name: "catalog" },
    message: emptyShare
      ? {
          kind: "notice",
          text: "Nothing was shared. Paste the recipe URL or text below.",
        }
      : null,
    hasQuery: params.size > 0,
  };
}
