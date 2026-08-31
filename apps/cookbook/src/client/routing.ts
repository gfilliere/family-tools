import { emptyRecipeDraft, type RecipeDraft } from "./domain/recipe";

export type NonEditorRoute =
  | { name: "catalog" }
  | { name: "detail"; recipeId: number }
  | { name: "import"; initialUrl?: string };

export type Route =
  | NonEditorRoute
  | { name: "editor"; draft: RecipeDraft; returnTo: NonEditorRoute };

export function routePath(route: Route): string {
  switch (route.name) {
    case "catalog":
      return "/cookbook/";
    case "detail":
      return `/cookbook/recipes/${route.recipeId}`;
    case "import":
      return "/cookbook/import";
    case "editor":
      if (route.draft.id) return `/cookbook/recipes/${route.draft.id}/edit`;
      return route.returnTo.name === "import"
        ? "/cookbook/import/review"
        : "/cookbook/new";
  }
}

export function routeFromPath(pathname: string): Route {
  if (/^\/cookbook\/import\/?$/.test(pathname)) return { name: "import" };
  if (/^\/cookbook\/new\/?$/.test(pathname)) {
    return {
      name: "editor",
      draft: emptyRecipeDraft(),
      returnTo: { name: "catalog" },
    };
  }

  const recipeMatch = /^\/cookbook\/recipes\/([1-9]\d*)\/?$/.exec(pathname);
  if (recipeMatch) {
    return { name: "detail", recipeId: Number(recipeMatch[1]) };
  }

  // Drafts are held in history.state. A directly opened review URL cannot
  // reconstruct an unsaved import, so return to the import screen instead.
  if (/^\/cookbook\/import\/review\/?$/.test(pathname)) {
    return { name: "import" };
  }

  // A directly opened edit URL has no recipe draft yet. The detail screen can
  // load it safely and lets the user enter the editor again.
  const editMatch = /^\/cookbook\/recipes\/([1-9]\d*)\/edit\/?$/.exec(pathname);
  if (editMatch) {
    return { name: "detail", recipeId: Number(editMatch[1]) };
  }

  return { name: "catalog" };
}

export function isRoute(value: unknown): value is Route {
  if (!isRecord(value) || typeof value.name !== "string") return false;
  switch (value.name) {
    case "catalog":
      return true;
    case "detail":
      return Number.isInteger(value.recipeId) && Number(value.recipeId) > 0;
    case "import":
      return value.initialUrl === undefined || typeof value.initialUrl === "string";
    case "editor":
      return isRecipeDraft(value.draft) && isNonEditorRoute(value.returnTo);
    default:
      return false;
  }
}

function isNonEditorRoute(value: unknown): value is NonEditorRoute {
  return isRoute(value) && value.name !== "editor";
}

function isRecipeDraft(value: unknown): value is RecipeDraft {
  return isRecord(value)
    && typeof value.title === "string"
    && Array.isArray(value.ingredients)
    && Array.isArray(value.tags);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
