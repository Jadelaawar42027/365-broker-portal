/**
 * File: apps/web/src/app/app/(main)/training/page.tsx
 * Purpose: Screen 2a, the training home: chapters passed and average score, the "pick up where you left off" banner,
 * the Volume One chapter list with each chapter's state, and the Volume Two "coming soon" cards. Until the broker is
 * active it shows the locked page instead (SPEC D6).
 *
 * Functions:
 * - TrainingPage(): loads the training home and renders the open or locked view.
 * - LockedTraining({ chapters }): the banner saying training opens after onboarding, over the greyed-out chapters.
 * - StatCard({ label, value }): one of the two numbers top right.
 * - ContinueBanner({ next }): the navy "pick up where you left off" banner with its progress bar.
 * - ChapterRow({ chapter, showUnlockHint }): one Volume One row: icon, title, summary and its state on the right.
 * - chapterStatus(chapter, showUnlockHint): the right-hand text and colour; only the next locked chapter says what unlocks it.
 */
import { VOLUME_ONE_CHAPTERS, type TrainingChapterRow, type TrainingHomeResponse } from "@bp/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { LinkButton } from "@/components/ui/button";
import { ArrowRightIcon, CheckIcon, LockIcon } from "@/components/ui/icons";
import { serverGet } from "@/lib/server-api";

export const metadata: Metadata = { title: "Training · 365 Yachts" };

function LockedTraining({ chapters }: { chapters: { key: string; label: string }[] }) {
  return (
    <div className="mx-auto max-w-[760px] space-y-8">
      <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[38px]">Training</h1>
      <div role="status" className="flex gap-4 rounded-2xl bg-navy px-6 py-6 text-white">
        <LockIcon className="mt-1 size-6 shrink-0" />
        <p className="text-lg leading-relaxed">
          <strong className="font-bold">Training opens soon.</strong> You&apos;ll get access once your onboarding is approved.
        </p>
      </div>
      <section aria-labelledby="chapters">
        <h2 id="chapters" className="mb-4 text-[22px] font-extrabold">
          Volume One
        </h2>
        <ol className="overflow-hidden rounded-2xl border border-line bg-white">
          {chapters.map((chapter) => (
            <li key={chapter.key} className="flex items-center gap-4 border-b border-line px-5 py-5 last:border-b-0">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-soft text-muted">
                <LockIcon className="size-[18px]" />
              </span>
              <span className="flex-1 text-lg font-semibold text-muted">{chapter.label}</span>
              <span className="text-base text-muted">Locked</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-2xl border border-line bg-white px-5 py-4 sm:w-[188px] sm:flex-none">
      <p className="text-[15px] text-muted">{label}</p>
      <p className="mt-1 text-[28px] leading-tight font-extrabold">{value}</p>
    </div>
  );
}

function ContinueBanner({ next }: { next: NonNullable<TrainingHomeResponse["continue"]> }) {
  const href = next.nextLessonId ? `/app/training/lessons/${next.nextLessonId}` : `/app/training/chapters/${next.chapterId}`;
  const detail = next.quizNext
    ? "Lessons done · the chapter quiz is next"
    : `Lesson ${Math.min(next.lessonsCompleted + 1, next.lessonsTotal)} of ${next.lessonsTotal} · about ${next.minutesLeft} minute${next.minutesLeft === 1 ? "" : "s"} left`;
  return (
    <section aria-labelledby="continue-title" className="flex flex-col gap-6 rounded-[20px] bg-navy px-6 py-7 text-white sm:px-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="text-[15px] font-bold tracking-[0.08em] text-[#a9c3ea] uppercase">Pick up where you left off</p>
        <h2 id="continue-title" className="mt-2 text-[26px] leading-tight font-extrabold sm:text-[28px]">
          {next.label}
        </h2>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-navy-soft sm:w-[216px]" role="progressbar" aria-label="Lessons finished" aria-valuemin={0} aria-valuemax={next.lessonsTotal} aria-valuenow={next.lessonsCompleted}>
            <div className="h-full rounded-full bg-white" style={{ width: `${next.lessonsTotal ? Math.round((next.lessonsCompleted / next.lessonsTotal) * 100) : 0}%` }} />
          </div>
          <p className="text-[17px] text-[#d5e1f3]">{detail}</p>
        </div>
      </div>
      <LinkButton href={href} variant="white" size="xl" className="shrink-0 self-start lg:self-center">
        {next.quizNext ? "Take the quiz" : "Continue"}
        <ArrowRightIcon />
      </LinkButton>
    </section>
  );
}

function chapterStatus(chapter: TrainingChapterRow, showUnlockHint: boolean): { text: string; className: string } {
  if (chapter.state === "passed") return { text: `Passed${chapter.bestScore !== null ? ` · ${chapter.bestScore}%` : ""}`, className: "font-bold text-success" };
  if (chapter.state === "in_progress") {
    const lessonsDone = chapter.lessonsCompleted === chapter.lessonsTotal;
    return { text: lessonsDone ? "In progress · quiz next" : `In progress · ${chapter.lessonsCompleted} of ${chapter.lessonsTotal} lessons`, className: "font-bold text-brand" };
  }
  if (chapter.state === "available") return { text: "Ready to start", className: "font-bold text-brand" };
  return { text: showUnlockHint && chapter.unlocksAfterCode ? `Unlocks after ${chapter.unlocksAfterCode}` : "Locked", className: "text-muted" };
}

function ChapterRow({ chapter, showUnlockHint }: { chapter: TrainingChapterRow; showUnlockHint: boolean }) {
  const status = chapterStatus(chapter, showUnlockHint);
  const locked = chapter.state === "locked";
  const current = chapter.state === "in_progress" || chapter.state === "available";
  const icon =
    chapter.state === "passed" ? (
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success-soft text-success">
        <CheckIcon className="size-5" />
      </span>
    ) : current ? (
      <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-brand text-[15px] font-bold text-brand">{chapter.code}</span>
    ) : (
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-soft text-muted">
        <LockIcon className="size-[18px]" />
      </span>
    );
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block text-lg font-bold ${locked ? "text-muted" : ""}`}>{chapter.label}</span>
        {chapter.summary ? <span className="mt-0.5 block text-[17px] text-muted">{chapter.summary}</span> : null}
        <span className={`mt-1 block text-[16px] sm:hidden ${status.className}`}>{status.text}</span>
      </span>
      <span className={`hidden shrink-0 text-[17px] sm:block ${status.className}`}>{status.text}</span>
    </>
  );
  const rowClasses = `flex items-center gap-4 px-5 py-5 sm:px-7 ${current ? "bg-brand-soft/70" : ""}`;
  return (
    <li className="border-b border-line last:border-b-0">
      {locked ? (
        <div className={rowClasses}>{body}</div>
      ) : (
        <Link href={`/app/training/chapters/${chapter.id}`} aria-current={current ? "step" : undefined} className={`${rowClasses} transition-colors hover:bg-page`}>
          {body}
        </Link>
      )}
    </li>
  );
}

export default async function TrainingPage() {
  const { data } = await serverGet<TrainingHomeResponse>("/v1/me/training");
  if (!data || !data.open) {
    const chapters = data?.volumeOne.length
      ? data.volumeOne.map((chapter) => ({ key: chapter.id, label: chapter.label }))
      : VOLUME_ONE_CHAPTERS.map((chapter) => ({ key: chapter.code, label: chapter.label }));
    return <LockedTraining chapters={chapters} />;
  }
  const firstLockedId = data.volumeOne.find((chapter) => chapter.state === "locked")?.id ?? null;
  return (
    <div className="space-y-9">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-[34px] leading-tight font-extrabold tracking-tight sm:text-[40px]">Training</h1>
          <p className="mt-2 text-xl leading-relaxed text-muted">Short chapters. A quick quiz after each one. Pass to unlock the next.</p>
        </div>
        <div className="flex gap-3">
          <StatCard label="Chapters passed" value={`${data.stats.chaptersPassed} of ${data.stats.chaptersTotal}`} />
          <StatCard label="Your average score" value={data.stats.averageScore === null ? "—" : `${data.stats.averageScore}%`} />
        </div>
      </div>

      {data.continue ? <ContinueBanner next={data.continue} /> : null}

      <section aria-labelledby="volume-one">
        <h2 id="volume-one" className="mb-4 text-[22px] font-extrabold">
          Volume One · Your first month
        </h2>
        {data.volumeOne.length ? (
          <ol className="overflow-hidden rounded-2xl border border-line bg-white">
            {data.volumeOne.map((chapter) => (
              <ChapterRow key={chapter.id} chapter={chapter} showUnlockHint={chapter.id === firstLockedId} />
            ))}
          </ol>
        ) : (
          <p className="rounded-2xl border border-line bg-white px-6 py-6 text-lg text-muted">The first chapters are being written. We&apos;ll email you when Part 0 is ready.</p>
        )}
      </section>

      {data.volumeTwo.length ? (
        <section aria-labelledby="volume-two">
          <h2 id="volume-two" className="mb-4 text-[22px] font-extrabold">
            Volume Two · The Master Reference
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.volumeTwo.map((chapter) => (
              <li key={chapter.id} className="rounded-2xl border border-line bg-white px-5 py-4">
                <p className="text-[14px] font-bold tracking-[0.04em] text-muted uppercase">{chapter.scheduleLabel ?? "Coming soon"}</p>
                <p className="mt-1.5 text-lg font-bold">{chapter.label}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
