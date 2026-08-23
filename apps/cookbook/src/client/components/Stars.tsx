interface StarsProps {
  value: number | null;
}

export function Stars({ value }: StarsProps) {
  const label = value ? `${value} out of 5 stars` : "Unrated";
  const content = value ? "★".repeat(value) + "☆".repeat(5 - value) : "Unrated";

  return (
    <span class="stars" aria-label={label}>
      {content}
    </span>
  );
}
