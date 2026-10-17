/**
 * File: apps/web/src/app/admin/reviews/[brokerStepId]/page.tsx
 * Purpose: Screen 3d, reviewing one submission: its place in the queue with previous/next, a preview of the uploaded
 * file (image or PDF) or the written answer, the step details, and the approve / send-back controls. Files are opened
 * through the API's permission-checked, 5-minute links, which also log the view.
 *
 * Functions:
 * - ReviewPage({ params }): loads the submission and file links and renders the screen.
 * - FilePreview({ file, url }): an inline image or PDF frame for one file.
 * - AnswerPreview({ kind, formData }): the bio text, chosen option or confirmations, shown like a document.
 */
import type { DownloadUrlResponse, FileView, ReviewDetailResponse } from "@bp/shared";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReviewActions } from "@/components/admin/review-actions";
import { buttonClasses } from "@/components/ui/button";
import { FileLinkButton } from "@/components/ui/file-link";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Pill } from "@/components/ui/pill";
import { formatSentAt, ordinal } from "@/lib/format";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Review · 365 Yachts admin" };

function FilePreview({ file, url }: { file: FileView; url: string | null }) {
  if (!url) return <p className="py-16 text-center text-lg text-muted">This file can&apos;t be previewed. Use Download.</p>;
  if (file.mimeType.startsWith("image/")) {
    return (
      <Image unoptimized src={url} alt={`${file.fileName}, uploaded file`} width={720} height={900} className="mx-auto h-auto max-h-[640px] w-auto max-w-full rounded-lg bg-white object-contain shadow-sm" />
    );
  }
  return <iframe src={url} title={`Preview of ${file.fileName}`} className="h-[640px] w-full rounded-lg border-0 bg-white" />;
}

function AnswerPreview({ kind, formData }: { kind: string; formData: Record<string, unknown> | null }) {
  const data = formData ?? {};
  const body =
    kind === "text" && typeof data.text === "string"
      ? data.text
      : kind === "choice"
        ? `Chose: ${String(data.choice ?? "—")}`
        : kind === "checklist" && Array.isArray(data.checked)
          ? `Ticked: ${(data.checked as string[]).join(", ")}`
          : kind === "confirm"
            ? "Confirmed it's done."
            : "No answer recorded.";
  return (
    <article className="mx-auto max-w-[620px] rounded-lg bg-white px-10 py-10 shadow-sm">
      <p className="text-lg leading-relaxed whitespace-pre-wrap">{body}</p>
    </article>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ brokerStepId: string }> }) {
  const { brokerStepId } = await params;
  const { data } = await serverGet<ReviewDetailResponse>(`/v1/admin/broker-steps/${encodeURIComponent(brokerStepId)}`);
  if (!data) notFound();
  const now = new Date();
  const previews = await Promise.all(
    data.files.map(async (file) => ({
      file,
      url: (await serverGet<DownloadUrlResponse>(`/v1/files/${file.id}/download-url?inline=true`)).data?.url ?? null,
    })),
  );
  const waiting = data.status === "submitted";
  const arrow = "grid size-12 place-items-center rounded-xl border border-line bg-white text-navy hover:bg-page";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[17px] font-semibold text-muted">
            {waiting && data.queue.index > 0 ? `Review ${data.queue.index} of ${data.queue.total}` : "Submission"}
          </p>
          <h1 className="mt-1 text-[32px] leading-tight font-extrabold tracking-tight">
            {data.step.shortTitle} · {data.broker.name}
          </h1>
        </div>
        <nav aria-label="Review queue" className="flex gap-2">
          {data.queue.previousId ? (
            <Link href={`/admin/reviews/${data.queue.previousId}`} className={arrow} aria-label="Previous submission">
              <ChevronLeftIcon />
            </Link>
          ) : (
            <span className={`${arrow} opacity-40`} aria-hidden="true">
              <ChevronLeftIcon />
            </span>
          )}
          {data.queue.nextId ? (
            <Link href={`/admin/reviews/${data.queue.nextId}`} className={arrow} aria-label="Next submission">
              <ChevronRightIcon />
            </Link>
          ) : (
            <span className={`${arrow} opacity-40`} aria-hidden="true">
              <ChevronRightIcon />
            </span>
          )}
        </nav>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_376px]">
        <section aria-label="Submission preview" className="rounded-2xl border border-line bg-[#e9eef6] p-6 sm:p-8">
          {previews.length > 0 ? (
            <div className="space-y-6">
              {previews.map(({ file, url }) => (
                <div key={file.id}>
                  {previews.length > 1 ? <p className="mb-2 text-base font-semibold text-muted">{file.fileName}</p> : null}
                  <FilePreview file={file} url={url} />
                  <div className="mt-4 flex justify-center gap-3">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className={buttonClasses("white")}>
                        Open full size<span className="sr-only"> {file.fileName} (new tab)</span>
                      </a>
                    ) : null}
                    <FileLinkButton fileId={file.id} className={buttonClasses("white")}>
                      Download<span className="sr-only"> {file.fileName}</span>
                    </FileLinkButton>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <AnswerPreview kind={data.step.kind} formData={data.formData} />
          )}
        </section>

        <aside className="space-y-5" aria-label="Decision">
          <dl className="space-y-3 rounded-2xl border border-line bg-white px-6 py-5 text-[17px]">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Step</dt>
              <dd className="text-right font-semibold">
                {data.position} of {data.totalSteps} · {data.stageTitle}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Sent</dt>
              <dd className="text-right font-semibold">{data.submittedAt ? formatSentAt(data.submittedAt, now) : "—"}</dd>
            </div>
            {data.files[0] ? (
              <div className="flex justify-between gap-4">
                <dt className="text-muted">File</dt>
                <dd className="min-w-0 truncate text-right font-semibold">{data.files.length > 1 ? `${data.files.length} files` : data.files[0].fileName}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Attempt</dt>
              <dd className="text-right font-semibold">{data.attempts > 0 ? ordinal(data.attempts) : "—"}</dd>
            </div>
          </dl>

          {waiting ? (
            <ReviewActions brokerStepId={data.brokerStepId} brokerFirstName={data.broker.firstName} checklist={data.reviewChecklist} nextId={data.queue.nextId} />
          ) : (
            <div className="rounded-2xl border border-line bg-white px-6 py-5">
              <p className="text-lg">
                This step is{" "}
                <Pill tone={data.status === "approved" ? "success" : data.status === "changes_requested" ? "danger" : "neutral"}>
                  {data.status === "approved" ? "approved" : data.status === "changes_requested" ? "sent back" : "not sent yet"}
                </Pill>
              </p>
              <Link href={`/admin/brokers/${data.broker.id}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2">
                Open {data.broker.firstName}&apos;s profile
              </Link>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
