"use client";

export function FavoriteStarButton({
  active,
  onToggle,
  size = "md",
}: {
  active: boolean;
  onToggle: () => void;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      className={`fav-star ${active ? "is-on" : ""} fav-star-${size}`}
      aria-label={active ? "Remover dos favoritos" : "Favoritar jogo"}
      aria-pressed={active}
      title={
        active
          ? "Favorito · topo da lista · notificações de gol"
          : "Favoritar · fixar no topo e avisar gols"
      }
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onToggle();
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="fav-star-svg">
        <path
          d="M12 3.2l2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 15.9l-4.7 2.47.9-5.23-3.8-3.7 5.25-.76L12 3.2z"
          fill={active ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
