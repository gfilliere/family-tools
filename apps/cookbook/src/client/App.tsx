import { useCallback, useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AppNav } from "./components/AppNav";
import { Notice, type Message } from "./components/Notice";
import type { Recipe, RecipeDraft } from "./domain/recipe";
import { CatalogPage } from "./features/catalog/CatalogPage";
import { RecipeDetailPage } from "./features/detail/RecipeDetailPage";
import { RecipeEditorPage } from "./features/editor/RecipeEditorPage";
import { ImportPage } from "./features/import/ImportPage";
import { isRoute, routeFromPath, routePath, type NonEditorRoute, type Route } from "./routing";

interface CookbookHistoryState {
  app: "cookbook";
  index: number;
  route: Route;
}

interface InitialState {
  entry: CookbookHistoryState;
  message: Message | null;
  url: string;
}

export function App() {
  const initial = useMemo(readInitialState, []);
  const [route, setRoute] = useState<Route>(initial.entry.route);
  const [message, setMessage] = useState<Message | null>(initial.message);
  const currentEntry = useRef(initial.entry);

  useEffect(() => {
    history.replaceState(initial.entry, "", initial.url);

    const handlePopState = (event: PopStateEvent) => {
      const entry = readHistoryState(event.state) ?? {
        app: "cookbook" as const,
        index: 0,
        route: routeFromPath(location.pathname),
      };
      currentEntry.current = entry;
      setRoute(entry.route);
    };

    addEventListener("popstate", handlePopState);
    return () => removeEventListener("popstate", handlePopState);
  }, [initial]);

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

  const navigate = useCallback((nextRoute: Route, replace = false) => {
    const entry: CookbookHistoryState = {
      app: "cookbook",
      index: replace ? currentEntry.current.index : currentEntry.current.index + 1,
      route: nextRoute,
    };
    history[replace ? "replaceState" : "pushState"](entry, "", routePath(nextRoute));
    currentEntry.current = entry;
    setRoute(nextRoute);
  }, []);

  const cancelEditor = useCallback((fallback: NonEditorRoute) => {
    if (currentEntry.current.index > 0) {
      history.back();
      return;
    }
    navigate(fallback, true);
  }, [navigate]);

  const showCatalog = useCallback(() => navigate({ name: "catalog" }), [navigate]);
  const showDetail = useCallback((recipeId: number) => {
    navigate({ name: "detail", recipeId });
  }, [navigate]);
  const showImport = useCallback(() => navigate({ name: "import" }), [navigate]);
  const showNewEditor = useCallback((draft: RecipeDraft) => {
    navigate({ name: "editor", draft, returnTo: { name: "catalog" } });
  }, [navigate]);
  const showImportedEditor = useCallback((draft: RecipeDraft) => {
    const returnTo = { name: "import" } as const;
    const importEntry: CookbookHistoryState = {
      ...currentEntry.current,
      route: returnTo,
    };
    history.replaceState(importEntry, "", routePath(returnTo));
    currentEntry.current = importEntry;
    navigate({ name: "editor", draft, returnTo });
  }, [navigate]);
  const showEdit = useCallback((draft: RecipeDraft) => {
    if (!draft.id) return;
    navigate({
      name: "editor",
      draft,
      returnTo: { name: "detail", recipeId: draft.id },
    });
  }, [navigate]);
  const handleSaved = useCallback((recipe: Recipe) => {
    navigate({ name: "detail", recipeId: recipe.id }, true);
  }, [navigate]);
  const handleDeleted = useCallback(() => {
    navigate({ name: "catalog" }, true);
  }, [navigate]);

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
          onDeleted={handleDeleted}
          onEdit={showEdit}
          onError={showError}
          onMessage={showMessage}
        />
      )}
      {route.name === "editor" && (
        <RecipeEditorPage
          initialDraft={route.draft}
          onCancel={() => cancelEditor(route.returnTo)}
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

  const stored = readHistoryState(history.state);
  const route = sharedUrl || emptyShare
    ? { name: "import" as const, initialUrl: sharedUrl }
    : stored && routePath(stored.route) === location.pathname
      ? stored.route
      : routeFromPath(location.pathname);
  const entry: CookbookHistoryState = {
    app: "cookbook",
    index: stored?.index ?? 0,
    route,
  };

  return {
    entry,
    message: emptyShare
      ? {
          kind: "notice",
          text: "Nothing was shared. Paste the recipe URL or text below.",
        }
      : null,
    url: routePath(route),
  };
}

function readHistoryState(value: unknown): CookbookHistoryState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const state = value as Record<string, unknown>;
  if (state.app !== "cookbook" || !Number.isInteger(state.index) || Number(state.index) < 0) {
    return null;
  }
  if (!isRoute(state.route)) return null;
  return {
    app: "cookbook",
    index: Number(state.index),
    route: state.route,
  };
}
