import type { CatalogSort } from "../../api/recipes";

interface CatalogToolbarProps {
  count: number;
  query: string;
  sort: CatalogSort;
  onQueryChange: (query: string) => void;
  onSearch: () => void;
  onSortChange: (sort: CatalogSort) => void;
}

export function CatalogToolbar({
  count,
  query,
  sort,
  onQueryChange,
  onSearch,
  onSortChange,
}: CatalogToolbarProps) {
  return (
    <>
      <form
        class="catalog-tools"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <input
          value={query}
          onInput={(event) => onQueryChange(event.currentTarget.value)}
          placeholder="Search recipes…"
          aria-label="Search recipes"
        />
        <button>Search</button>
      </form>
      <div class="sort-row">
        <span>{count} recipes</span>
        <label>
          Sort
          <select
            value={sort}
            onChange={(event) => onSortChange(event.currentTarget.value as CatalogSort)}
          >
            <option value="stale">Stalest first</option>
            <option value="newest">Newest</option>
            <option value="title">Title</option>
          </select>
        </label>
      </div>
    </>
  );
}
