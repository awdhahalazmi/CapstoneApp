import Avatar from "@/components/Avatar";
import AiFab from "@/components/AiFab";
import FriendsRow from "@/components/FriendsRow";
import { MenuIcon, PinIcon, PingIcon } from "@/components/icons";
import { friends, feed, currentUser, onlineCount } from "@/lib/mock-data";

const friendById = Object.fromEntries(friends.map((f) => [f.id, f]));

export default function CommunityPage() {
  return (
    <div className="pb-24">
      {/* Top bar — glass on scroll */}
      <header className="sticky top-0 z-20 flex items-center justify-between bg-surface/80 px-5 py-4 backdrop-blur-md">
        <button aria-label="Menu" className="text-on-surface">
          <MenuIcon />
        </button>
        <h1 className="text-xl font-bold text-primary">Community</h1>
        <Avatar initials={currentUser.initials} gradient={currentUser.gradient} size="sm" />
      </header>

      {/* Friends Online */}
      <section className="px-5 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Friends Online</h2>
          <span className="rounded-full bg-primary-fixed px-3 py-1 text-[12px] font-semibold text-on-primary-fixed-variant">
            {onlineCount} Live
          </span>
        </div>

        <FriendsRow />
      </section>

      {/* Nearby & Check-ins */}
      <section className="px-5 pt-6">
        <h2 className="text-2xl font-bold">Nearby &amp; Check-ins</h2>

        <div className="mt-4 space-y-4">
          {feed.map((item) => {
            const friend = friendById[item.friendId];
            if (!friend) return null;

            if (item.kind === "check-in") {
              return (
                <article key={item.id} className="card overflow-hidden">
                  <div className="flex items-center gap-3 p-4">
                    <Avatar initials={friend.initials} gradient={friend.gradient} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{friend.name}</span>
                        <span className="rounded-full bg-secondary-container px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                          Check-in
                        </span>
                      </div>
                      <p className="text-sm text-on-surface-variant">
                        Just arrived at{" "}
                        <span className="font-semibold text-primary">{item.place}</span>
                      </p>
                    </div>
                  </div>
                  {/* Venue image placeholder with gradient overlay for legible text */}
                  <div className="relative mx-4 mb-4 h-44 overflow-hidden rounded-md">
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.imageGradient}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-white">
                      <PinIcon className="h-4 w-4" />
                      <span className="text-sm font-semibold">
                        {item.area}, {item.distance}
                      </span>
                    </div>
                  </div>
                </article>
              );
            }

            if (item.kind === "nearby") {
              return (
                <article
                  key={item.id}
                  className="card relative flex items-center gap-3 overflow-hidden p-4"
                >
                  <span className="absolute left-0 top-0 h-full w-1.5 bg-primary" />
                  <Avatar initials={friend.initials} gradient={friend.gradient} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {friend.name} <span className="font-normal text-on-surface-variant">is nearby</span>
                    </p>
                    <p className="text-sm text-on-surface-variant">
                      {item.distance} · {item.time}
                    </p>
                  </div>
                  <button className="btn-primary h-10 px-4 text-sm">
                    <PingIcon className="h-4 w-4" />
                    Ping
                  </button>
                </article>
              );
            }

            // planned
            return (
              <article key={item.id} className="card p-4">
                <div className="flex items-center gap-3">
                  <Avatar initials={friend.initials} gradient={friend.gradient} size="md" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{friend.name}</span>
                      <span className="rounded-full bg-tertiary-container/15 px-2 py-0.5 text-[11px] font-bold text-tertiary">
                        Planned
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant">
                      Is planning to hang out at{" "}
                      <span className="font-semibold text-tertiary">{item.place}</span>
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 rounded-md bg-surface-low p-3">
                  <div className={`h-12 w-12 shrink-0 rounded-md bg-gradient-to-br ${item.imageGradient}`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{item.when}</p>
                    <p className="text-[12px] text-on-surface-variant">
                      {item.attendees} friends going
                    </p>
                  </div>
                  <button className="text-sm font-semibold text-primary">Join</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <AiFab />
    </div>
  );
}
