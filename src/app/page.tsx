import Link from "next/link";
import Avatar from "@/components/Avatar";
import AiFab from "@/components/AiFab";
import { BellIcon, SearchIcon, StarIcon, PinIcon } from "@/components/icons";
import { currentUser, places, notifications } from "@/lib/mock-data";

const filters = ["Nearby", "Outdoor", "Tonight", "Budget", "Coffee", "Group"];

function priceLabel(level: number) {
  return "$".repeat(level); // $ / $$ / $$$
}

export default function Home() {
  const unread = notifications.filter((n) => !n.read).length;
  const [featured, ...rest] = places;

  return (
    <div className="pb-24">
      {/* Greeting header */}
      <header className="sticky top-0 z-20 bg-surface/80 px-5 py-4 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-on-surface-variant">Hi {currentUser.name} 👋</p>
            <h1 className="text-2xl font-bold">Where to next?</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/profile" aria-label="Notifications" className="relative text-on-surface">
              <BellIcon />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-error text-[10px] font-bold text-on-error">
                  {unread}
                </span>
              )}
            </Link>
            <Avatar initials={currentUser.initials} gradient={currentUser.gradient} size="sm" />
          </div>
        </div>

        {/* Smart / semantic search */}
        <div className="relative mt-4">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-outline" />
          <input
            className="input pl-11"
            placeholder="Try “rooftop dinner for 4 tonight”"
          />
        </div>
      </header>

      {/* Filter chips */}
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 py-3">
        {filters.map((f, i) => (
          <button key={f} className={`chip ${i === 0 ? "chip-active" : ""}`}>
            {f}
          </button>
        ))}
      </div>

      {/* AI picks for your crew */}
      <section className="pt-1">
        <div className="flex items-center justify-between px-5">
          <h2 className="text-lg font-bold">AI picks for your crew</h2>
          <Link href="/ai" className="text-sm font-semibold text-primary">
            Ask AI
          </Link>
        </div>

        <article className="mx-5 mt-3 overflow-hidden rounded-lg shadow-soft">
          <div className="relative h-48">
            <div className={`absolute inset-0 bg-gradient-to-br ${featured.imageGradient}`} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-1 text-[11px] font-bold text-primary backdrop-blur">
              ✨ Top match
            </span>
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <h3 className="text-xl font-bold">{featured.name}</h3>
              <p className="flex items-center gap-1 text-sm opacity-90">
                <PinIcon className="h-4 w-4" />
                {featured.category} · {featured.area}
              </p>
            </div>
          </div>
          <div className="bg-card p-4">
            <p className="text-sm text-on-surface-variant">
              <span className="font-semibold text-primary">Why this? </span>
              {featured.aiReason}
            </p>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1 font-semibold text-on-surface">
                <StarIcon className="h-4 w-4 text-amber-500" />
                {featured.rating}
              </span>
              <span className="font-semibold text-tertiary">{priceLabel(featured.priceLevel)}</span>
              <div className="ml-auto flex gap-1.5">
                {featured.tags.slice(0, 2).map((t) => (
                  <span key={t} className="rounded-full bg-surface-low px-2.5 py-1 text-[12px] font-semibold text-on-surface-variant">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </article>
      </section>

      {/* Discover grid */}
      <section className="px-5 pt-6">
        <h2 className="text-lg font-bold">Discover places</h2>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {rest.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-lg bg-card shadow-soft">
              <div className="relative h-28">
                <div className={`absolute inset-0 bg-gradient-to-br ${p.imageGradient}`} />
                <span className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-card/90 px-1.5 py-0.5 text-[11px] font-bold text-on-surface backdrop-blur">
                  <StarIcon className="h-3 w-3 text-amber-500" />
                  {p.rating}
                </span>
              </div>
              <div className="p-3">
                <h3 className="truncate text-sm font-bold">{p.name}</h3>
                <p className="truncate text-[12px] text-on-surface-variant">{p.area}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-tertiary">{priceLabel(p.priceLevel)}</span>
                  <span className="text-[12px] text-on-surface-variant">{p.category}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <AiFab />
    </div>
  );
}
