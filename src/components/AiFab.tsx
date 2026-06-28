import Link from "next/link";
import { AiIcon } from "./icons";

/*
  Floating AI assistant button (DESIGN.md > AI Assistant Button):
  circular FAB, bottom-right, violet gradient "glow". Positioned within the
  phone frame, sitting just above the bottom navigation.
*/

export default function AiFab() {
  return (
    <Link
      href="/ai"
      aria-label="Open AI assistant"
      className="fab fixed bottom-20 right-5 z-30 sm:absolute"
    >
      <AiIcon className="h-7 w-7" />
    </Link>
  );
}
