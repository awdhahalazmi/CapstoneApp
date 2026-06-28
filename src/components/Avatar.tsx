/*
  Avatar — gradient circle with initials (DESIGN.md fallback: "initials placeholder
  if no avatar is set"). Self-contained, no external image requests.
*/

const sizeMap = {
  sm: "h-9 w-9 text-[12px]",
  md: "h-12 w-12 text-sm",
  lg: "h-16 w-16 text-lg",
} as const;

const dotMap = {
  sm: "h-2.5 w-2.5",
  md: "h-3 w-3",
  lg: "h-3.5 w-3.5",
} as const;

type Props = {
  initials: string;
  gradient: string;
  size?: keyof typeof sizeMap;
  online?: boolean;
  ring?: boolean;
};

export default function Avatar({
  initials,
  gradient,
  size = "md",
  online,
  ring,
}: Props) {
  return (
    <div className="relative inline-block shrink-0">
      <div
        className={`${sizeMap[size]} grid place-items-center rounded-full bg-gradient-to-br ${gradient} font-semibold text-white ${
          ring ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""
        }`}
      >
        {initials}
      </div>
      {online !== undefined && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${dotMap[size]} rounded-full border-2 border-card ${
            online ? "bg-tertiary-container" : "bg-surface-dim"
          }`}
        />
      )}
    </div>
  );
}
