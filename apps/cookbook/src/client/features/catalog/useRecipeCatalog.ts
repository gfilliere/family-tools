import { useCallback, useEffect, useState } from "preact/hooks";
import {
  listRecipes,
  type CatalogSort,
} from "../../api/recipes";
import type { RecipeSummary } from "../../domain/recipe";

interface RecipeCatalog {
  recipes: RecipeSummary[];
  query: string;
  sort: CatalogSort;
  loading: boolean;
  setQuery: (query: string) => void;
  setSort: (sort: CatalogSort) => void;
  search: () => void;
}

export function useRecipeCatalog(onError: (reason: unknown) => void): RecipeCatalog {
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("stale");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (searchQuery: string, order: CatalogSort) => {
    setLoading(true);
    try {
      setRecipes(await listRecipes({ query: searchQuery, sort: order }));
    } catch (reason) {
      onError(reason);
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void load(appliedQuery, sort);
  }, [appliedQuery, load, sort]);

  const search = useCallback(() => {
    const nextQuery = query.trim();
    if (nextQuery === appliedQuery) {
      void load(nextQuery, sort);
      return;
    }
    setAppliedQuery(nextQuery);
  }, [appliedQuery, load, query, sort]);

  return {
    recipes,
    query,
    sort,
    loading,
    setQuery,
    setSort,
    search,
  };
}
