/* Deterministic gradient + initials for a profile (no stored avatar yet). */

const GRADIENTS = [
  "from-indigo-500 to-violet-600",
  "from-rose-400 to-pink-600",
  "from-amber-400 to-orange-600",
  "from-emerald-400 to-teal-600",
  "from-sky-400 to-blue-600",
  "from-fuchsia-400 to-purple-600",
  "from-cyan-400 to-sky-600",
];

export function avatarFor(p: { id?: string; name?: string | null; username?: string | null }) {
  const seed = p.username || p.name || p.id || "?";
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const base = (p.name || p.username || "?").trim();
  const initials = base.includes(" ")
    ? base.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : base.slice(0, 2).toUpperCase();
  return { gradient: GRADIENTS[h % GRADIENTS.length], initials };
}
