"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { APIProvider, Map, Marker } from "@vis.gl/react-google-maps";
import { ArrowLeftIcon, PlusIcon, XIcon, TrashIcon, PinIcon } from "@/components/icons";
import { useGroups } from "@/lib/groups-store";
import {
  usePins,
  addPin,
  removePin,
  toggleReaction,
  categoryMeta,
  PIN_CATEGORIES,
  PIN_REACTIONS,
  type Pin,
} from "@/lib/pins-store";

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const KUWAIT = { lat: 29.3759, lng: 47.9774 };

const noopSubscribe = () => () => {};
function useIsHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

// Colored teardrop marker as an inline SVG data-URI (no Map ID required).
function pinIcon(color: string) {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='34' height='44' viewBox='0 0 34 44'><path d='M17 0C7.6 0 0 7.6 0 17c0 12 17 27 17 27s17-15 17-27C34 7.6 26.4 0 17 0z' fill='${color}'/><circle cx='17' cy='17' r='6.5' fill='white'/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

type Draft = { lat: number; lng: number } | null;

export default function GroupMapPage() {
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { groups } = useGroups();
  const hydrated = useIsHydrated();
  const pins = usePins(groupId);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(null);
  const [form, setForm] = useState({ title: "", category: "cafe", description: "" });
  const [selected, setSelected] = useState<Pin | null>(null);

  const group = groups.find((g) => g.id === groupId);

  function startAdding() {
    setSelected(null);
    setDraft(null);
    setForm({ title: "", category: "cafe", description: "" });
    setAdding(true);
  }
  function cancelAdding() {
    setAdding(false);
    setDraft(null);
  }
  function savePin() {
    if (!draft || !form.title.trim()) return;
    addPin(groupId, { ...form, lat: draft.lat, lng: draft.lng });
    cancelAdding();
  }

  const header = (
    <header className="flex items-center gap-3 border-b border-outline-variant/40 bg-surface/90 px-4 py-3.5 backdrop-blur-md">
      <Link
        href={`/groups/${groupId}`}
        aria-label="Back"
        className="grid h-10 w-10 place-items-center text-primary"
      >
        <ArrowLeftIcon />
      </Link>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold leading-tight">Group Map</h1>
        <p className="truncate text-[12px] text-on-surface-variant">
          {hydrated && group ? group.name : "Shared places"} · {pins.length}{" "}
          {pins.length === 1 ? "pin" : "pins"}
        </p>
      </div>
    </header>
  );

  // Missing key → friendly setup prompt (keeps the app working).
  if (!MAPS_KEY) {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <span className="fab h-14 w-14">
            <PinIcon className="h-7 w-7" />
          </span>
          <p className="mt-4 font-semibold">Add your Google Maps key</p>
          <p className="mt-1 text-sm text-on-surface-variant">
            Set <code className="rounded bg-surface-low px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            in <code className="rounded bg-surface-low px-1">.env.local</code> and restart the dev
            server to load the map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {header}

      <div className="relative flex-1">
        <APIProvider apiKey={MAPS_KEY}>
          <Map
            defaultCenter={KUWAIT}
            defaultZoom={11}
            gestureHandling="greedy"
            disableDefaultUI
            clickableIcons={false}
            style={{ width: "100%", height: "100%" }}
            onClick={(e) => {
              if (adding && e.detail.latLng) {
                setDraft({ lat: e.detail.latLng.lat, lng: e.detail.latLng.lng });
              }
            }}
          >
            {pins.map((p) => (
              <Marker
                key={p.id}
                position={{ lat: p.lat, lng: p.lng }}
                icon={pinIcon(categoryMeta(p.category).color)}
                onClick={() => {
                  setSelected(p);
                  setAdding(false);
                }}
              />
            ))}
            {draft && <Marker position={draft} icon={pinIcon("#630ed4")} />}
          </Map>
        </APIProvider>

        {/* Add-mode hint */}
        {adding && !draft && (
          <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full bg-inverse-surface/90 px-4 py-2 text-sm font-semibold text-inverse-on-surface backdrop-blur">
            Tap the map to drop a pin
            <button onClick={cancelAdding} aria-label="Cancel" className="opacity-80">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* FAB */}
        {!adding && !selected && (
          <button
            onClick={startAdding}
            aria-label="Add a place"
            className="fab absolute bottom-5 right-5 z-20"
          >
            <PlusIcon className="h-7 w-7" />
          </button>
        )}

        {/* Add pin form */}
        {adding && draft && (
          <Sheet onClose={cancelAdding}>
            <h2 className="text-lg font-bold">Add a place</h2>
            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="input mt-3"
              placeholder="Place name (e.g. Skyline Social)"
            />
            <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-on-surface-variant">
              Category
            </p>
            <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-1">
              {PIN_CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setForm((f) => ({ ...f, category: c.key }))}
                  className={`chip shrink-0 ${form.category === c.key ? "chip-active" : ""}`}
                >
                  <span aria-hidden>{c.emoji}</span>
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="input mt-4 resize-none"
              rows={2}
              placeholder="Add a short note (optional)"
            />
            <div className="mt-4 flex gap-3">
              <button onClick={cancelAdding} className="btn-secondary h-12 flex-1">
                Cancel
              </button>
              <button
                onClick={savePin}
                disabled={!form.title.trim()}
                className="btn-primary h-12 flex-1 disabled:opacity-50"
              >
                Save pin
              </button>
            </div>
          </Sheet>
        )}

        {/* Pin details */}
        {selected && (
          <Sheet onClose={() => setSelected(null)}>
            <div className="flex items-start gap-3">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-xl"
                style={{ backgroundColor: `${categoryMeta(selected.category).color}22` }}
              >
                {categoryMeta(selected.category).emoji}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold">{selected.title}</h2>
                <p className="text-[13px] text-on-surface-variant">
                  {categoryMeta(selected.category).label}
                </p>
              </div>
              <button
                onClick={() => {
                  removePin(groupId, selected.id);
                  setSelected(null);
                }}
                aria-label="Delete pin"
                className="grid h-9 w-9 place-items-center rounded-full bg-error-container text-on-error-container"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>

            {selected.description && (
              <p className="mt-3 text-sm text-on-surface-variant">{selected.description}</p>
            )}

            {/* Reactions */}
            <div className="mt-4 flex flex-wrap gap-2">
              {PIN_REACTIONS.map((r) => {
                const active = selected.reactions.includes(r.key);
                return (
                  <button
                    key={r.key}
                    onClick={() => {
                      toggleReaction(groupId, selected.id, r.key);
                      setSelected((s) =>
                        s
                          ? {
                              ...s,
                              reactions: s.reactions.includes(r.key)
                                ? s.reactions.filter((x) => x !== r.key)
                                : [...s.reactions, r.key],
                            }
                          : s,
                      );
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition ${
                      active
                        ? "bg-primary text-on-primary"
                        : "bg-surface-low text-on-surface-variant"
                    }`}
                  >
                    <span aria-hidden>{r.emoji}</span>
                    {r.label}
                  </button>
                );
              })}
            </div>

            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${selected.lat},${selected.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4 flex h-12 w-full text-base"
            >
              <PinIcon className="h-5 w-5" />
              Directions
            </a>
          </Sheet>
        )}
      </div>
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 z-20 bg-black/20"
      />
      <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-xl bg-card p-5 pb-7 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
        {children}
      </div>
    </>
  );
}
