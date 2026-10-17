/**
 * File: apps/web/src/components/brand/logo.tsx
 * Purpose: The 365 Yachts mark (a rounded "365" tile) and the wordmark lockup, in the light and dark versions the
 * mockups use, optionally with a sub-label such as "Admin".
 *
 * Functions:
 * - BrandLockup({ tone, sublabel, size }): the tile plus "365 YACHTS" in three sizes, for light or navy backgrounds.
 */
export function BrandLockup({
  tone = "dark",
  sublabel,
  size = "md",
}: {
  tone?: "dark" | "light";
  sublabel?: string;
  size?: "sm" | "md" | "lg";
}) {
  const tile = tone === "light" ? "bg-white text-navy" : "bg-navy text-white";
  const word = tone === "light" ? "text-white" : "text-navy";
  const tileSize = size === "lg" ? "size-15 text-xl rounded-xl" : size === "sm" ? "size-10 text-sm rounded-[10px]" : "size-11 text-[15px] rounded-[10px]";
  const wordSize = size === "lg" ? "text-2xl tracking-[0.18em]" : size === "sm" ? "text-base tracking-[0.14em]" : "text-lg tracking-[0.18em]";
  return (
    <span className="inline-flex items-center gap-3.5" translate="no">
      <span className={`grid place-items-center font-extrabold ${tile} ${tileSize}`}>365</span>
      <span className="flex flex-col leading-tight">
        <span className={`whitespace-nowrap font-extrabold ${word} ${wordSize}`}>365 YACHTS</span>
        {sublabel ? <span className="text-[15px] font-medium text-[#c9d3e3]">{sublabel}</span> : null}
      </span>
    </span>
  );
}
