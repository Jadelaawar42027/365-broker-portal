/**
 * File: apps/web/src/components/brand/logo.tsx
 * Purpose: The 365 Yachts mark (a rounded "365" tile) and the wordmark lockup, in the light and dark versions the
 * mockups use, optionally with a sub-label such as "Admin".
 *
 * Functions:
 * - BrandLockup({ tone, sublabel, size }): the tile plus "365 YACHTS", for light or navy backgrounds.
 */
export function BrandLockup({
  tone = "dark",
  sublabel,
  size = "md",
}: {
  tone?: "dark" | "light";
  sublabel?: string;
  size?: "md" | "lg";
}) {
  const tile = tone === "light" ? "bg-white text-navy" : "bg-navy text-white";
  const word = tone === "light" ? "text-white" : "text-navy";
  const tileSize = size === "lg" ? "size-15 text-xl rounded-xl" : "size-11 text-[15px] rounded-[10px]";
  return (
    <span className="inline-flex items-center gap-3.5" translate="no">
      <span className={`grid place-items-center font-extrabold ${tile} ${tileSize}`}>365</span>
      <span className="flex flex-col leading-tight">
        <span className={`font-extrabold tracking-[0.18em] ${word} ${size === "lg" ? "text-2xl" : "text-lg"}`}>365 YACHTS</span>
        {sublabel ? <span className="text-[15px] font-medium text-[#c9d3e3]">{sublabel}</span> : null}
      </span>
    </span>
  );
}
