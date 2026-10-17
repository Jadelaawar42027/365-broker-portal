/**
 * File: apps/web/src/app/admin/reviews/page.tsx
 * Purpose: Every submission waiting for review, oldest first (the "Reviews" sidebar item and "See all" on 3a). Each row
 * opens the review screen.
 *
 * Functions:
 * - ReviewsPage(): loads the queue and renders it, or an empty state.
 */
import type { ReviewListItem } from "@bp/shared";
import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Reviews · 365 Yachts admin" };

export default async function ReviewsPage() {
  const { data } = await serverGet<{ reviews: ReviewListItem[] }>("/v1/admin/reviews");
  const reviews = data?.reviews ?? [];
  const now = new Date();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[35px] leading-tight font-extrabold tracking-tight">Reviews</h1>
        <p className="mt-1 text-[17px] text-muted">
          {reviews.length === 0 ? "Nothing waiting for review." : `${reviews.length} waiting, oldest first.`}
        </p>
      </div>
      <section aria-label="Waiting for review" className="overflow-hidden rounded-2xl border border-line bg-white">
        {reviews.length === 0 ? (
          <p className="px-6 py-10 text-lg text-muted">All caught up. New submissions appear here as brokers send them.</p>
        ) : (
          <ul>
            {reviews.map((item, index) => (
              <li key={item.brokerStepId} className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 last:border-b-0">
                <div className="min-w-0">
                  <p className="text-lg font-bold">
                    {item.stepShortTitle}
                    <span className="font-normal text-muted"> · step {item.position}</span>
                  </p>
                  <p className="text-base text-muted">
                    {item.brokerName}
                    {item.submittedAt ? ` · ${relativeTime(item.submittedAt, now)}` : ""}
                    {item.attempts > 1 ? ` · attempt ${item.attempts}` : ""}
                  </p>
                </div>
                <LinkButton href={`/admin/reviews/${item.brokerStepId}`} variant={index === 0 ? "primary" : "soft"} className="shrink-0">
                  Review<span className="sr-only"> {item.stepShortTitle} from {item.brokerName}</span>
                </LinkButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
