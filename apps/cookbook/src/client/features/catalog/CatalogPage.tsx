import { emptyRecipeDraft, type RecipeDraft } from "../../domain/recipe";
import { CatalogToolbar } from "./CatalogToolbar";
import { RecipeCard } from "./RecipeCard";
import { useRecipeCatalog } from "./useRecipeCatalog";

interface CatalogPageProps {
  onCreate: (draft: RecipeDraft) => void;
  onError: (reason: unknown) => void;
  onImport: () => void;
  onOpen: (id: number) => void;
}

export function CatalogPage({
  onCreate,
  onError,
  onImport,
  onOpen,
}: CatalogPageProps) {
  const catalog = useRecipeCatalog(onError);

  return (
    <>
      <header class="title-row">
        <div>
          <p class="eyebrow">Your kitchen archive</p>
          <h1>Cookbook</h1>
        </div>
        <button class="primary compact" onClick={onImport}>Import</button>
      </header>

      <CatalogToolbar
        count={catalog.recipes.length}
        query={catalog.query}
        sort={catalog.sort}
        onQueryChange={catalog.setQuery}
        onSearch={catalog.search}
        onSortChange={catalog.setSort}
      />

      <section class="catalog" aria-busy={catalog.loading}>
        {catalog.recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} onOpen={onOpen} />
        ))}
        {!catalog.loading && catalog.recipes.length === 0 && (
          <div class="empty">
            <span>♨</span>
            <h2>No recipes yet</h2>
            <p>Import a URL or paste your favourite recipe.</p>
          </div>
        )}
      </section>

      <button class="new-button" onClick={() => onCreate(emptyRecipeDraft())}>
        Write a recipe
      </button>
    </>
  );
}
