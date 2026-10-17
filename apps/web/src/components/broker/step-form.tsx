/**
 * File: apps/web/src/components/broker/step-form.tsx
 * Purpose: The interactive part of a step page (screen 1c). Upload steps get the drop zone, "Choose a file",
 * "Take a photo", the uploaded-file cards and "Send to Shelly for approval"; other steps get the matching answer
 * (bio text, a choice, a confirmation or a checklist). Submitting returns the broker to their checklist.
 *
 * Functions:
 * - StepForm({ step, supportName }): renders the right form for the step kind and sends it.
 * - UploadArea({ step, files, setFiles }): the drop zone and file cards; uploads each picked file straight away.
 * - AnswerFields({ step, answer, setAnswer }): the text, choice, confirm or checklist inputs.
 * - initialAnswer(step): the starting answer, pre-filled from a previous submission.
 * - buildFormData(step, answer): the form_data object the API expects for the step kind.
 */
"use client";

import { formatFileSize, type StepDetailResponse, type UploadTargetResponse } from "@bp/shared";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { FormMessage } from "@/components/auth/form-message";
import { Button } from "@/components/ui/button";
import { CheckIcon, UploadIcon } from "@/components/ui/icons";
import { apiRequest, ApiError, uploadToTarget } from "@/lib/api-client";
import { checkFileBeforeUpload, describeAcceptedTypes } from "@/lib/steps";

type PickedFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  state: "uploading" | "uploaded" | "failed";
  storageKey?: string;
  error?: string;
};

type Answer = { text: string; choice: string; confirmed: boolean; checked: string[] };

const MAX_FILES = 5;

function initialAnswer(step: StepDetailResponse): Answer {
  const data = step.formData ?? {};
  return {
    text: typeof data.text === "string" ? data.text : "",
    choice: typeof data.choice === "string" ? data.choice : "",
    confirmed: false,
    checked: Array.isArray(data.checked) ? (data.checked as string[]) : [],
  };
}

function buildFormData(step: StepDetailResponse, answer: Answer): Record<string, unknown> {
  if (step.kind === "text") return { text: answer.text };
  if (step.kind === "choice") return { choice: answer.choice };
  if (step.kind === "confirm") return { confirmed: answer.confirmed };
  if (step.kind === "checklist") return { checked: answer.checked };
  return {};
}

export function StepForm({ step, supportName }: { step: StepDetailResponse; supportName: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [answer, setAnswer] = useState<Answer>(() => initialAnswer(step));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const uploaded = files.filter((file) => file.state === "uploaded");
  const uploading = files.some((file) => file.state === "uploading");
  const ready =
    step.kind === "upload"
      ? uploaded.length > 0 && !uploading
      : step.kind === "text"
        ? answer.text.trim().length >= (step.config.minLength ?? 1)
        : step.kind === "choice"
          ? Boolean(answer.choice)
          : step.kind === "confirm"
            ? answer.confirmed
            : (step.config.items ?? []).every((item) => answer.checked.includes(item.value));

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/v1/me/steps/${step.key}/submit`, {
        method: "POST",
        body:
          step.kind === "upload"
            ? { files: uploaded.map((file) => ({ storageKey: file.storageKey!, fileName: file.name })) }
            : { formData: buildFormData(step, answer) },
      });
      router.push("/app");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  const label = step.needsApproval ? `Send to ${supportName} for approval` : "Mark this step done";

  return (
    <div className="space-y-6">
      {step.kind === "upload" ? (
        <UploadArea step={step} files={files} setFiles={setFiles} />
      ) : (
        <AnswerFields step={step} answer={answer} setAnswer={setAnswer} />
      )}
      {error ? <FormMessage tone="error">{error}</FormMessage> : null}
      <Button size="xl" className="w-full" disabled={!ready || busy} onClick={send}>
        {busy ? "Sending…" : label}
      </Button>
    </div>
  );
}

function UploadArea({
  step,
  files,
  setFiles,
}: {
  step: StepDetailResponse;
  files: PickedFile[];
  setFiles: (update: (current: PickedFile[]) => PickedFile[]) => void;
}) {
  const chooseRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const acceptsImages = step.acceptedTypes.some((type) => type.startsWith("image/"));

  async function uploadOne(file: File, id: string) {
    try {
      const target = await apiRequest<UploadTargetResponse>(`/v1/me/steps/${step.key}/upload-url`, {
        method: "POST",
        body: { fileName: file.name, contentType: file.type, sizeBytes: file.size },
      });
      await uploadToTarget(target.upload, file);
      setFiles((current) => current.map((item) => (item.id === id ? { ...item, state: "uploaded", storageKey: target.storageKey } : item)));
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "The upload didn't finish. Try again.";
      setFiles((current) => current.map((item) => (item.id === id ? { ...item, state: "failed", error: message } : item)));
    }
  }

  function addFiles(list: FileList | null) {
    setPickError(null);
    if (!list) return;
    const picked = Array.from(list);
    const room = MAX_FILES - files.length;
    if (picked.length > room) setPickError(`You can send up to ${MAX_FILES} files for this step.`);
    const accepted: { file: File; entry: PickedFile }[] = [];
    for (const file of picked.slice(0, Math.max(room, 0))) {
      const problem = checkFileBeforeUpload(file, step);
      if (problem) {
        setPickError(problem);
        continue;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      accepted.push({ file, entry: { id, name: file.name, size: file.size, type: file.type, state: "uploading" } });
    }
    setFiles((current) => [...current, ...accepted.map((item) => item.entry)]);
    for (const item of accepted) void uploadOne(item.file, item.entry.id);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  return (
    <div className="space-y-5">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-brand bg-brand-soft" : "border-[#a9b8cf] bg-white"
        }`}
      >
        <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand">
          <UploadIcon className="size-7" />
        </span>
        <p className="mt-4 text-xl font-bold">Drop your file here</p>
        <p className="mt-1 text-base text-muted">
          {describeAcceptedTypes(step.acceptedTypes)} · up to {formatFileSize(step.maxSizeBytes)}
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
          <Button variant="navy" size="lg" className="min-w-[180px]" onClick={() => chooseRef.current?.click()}>
            Choose a file
          </Button>
          {acceptsImages ? (
            <Button variant="outline" size="lg" className="min-w-[180px]" onClick={() => photoRef.current?.click()}>
              Take a photo
            </Button>
          ) : null}
        </div>
        <input
          ref={chooseRef}
          type="file"
          multiple
          accept={step.acceptedTypes.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose files to upload"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label="Take a photo to upload"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
      {pickError ? <FormMessage tone="error">{pickError}</FormMessage> : null}
      {files.length > 0 ? (
        <ul className="space-y-3" aria-live="polite">
          {files.map((file) => (
            <li key={file.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-white px-5 py-4 sm:flex-row sm:items-center">
              <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-brand-soft text-sm font-bold text-brand">
                {file.type === "application/pdf" ? "PDF" : file.type === "image/png" ? "PNG" : "JPG"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-lg font-bold">{file.name}</span>
                <span className={`block text-base ${file.state === "failed" ? "text-danger" : file.state === "uploaded" ? "text-success" : "text-muted"}`}>
                  {file.state === "uploading" ? "Uploading…" : file.state === "failed" ? file.error : `Uploaded · ${formatFileSize(file.size)}`}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((item) => item.id !== file.id))}
                className="min-h-11 self-start rounded-lg px-2 text-lg font-semibold text-danger hover:bg-danger-soft sm:self-center"
              >
                Remove<span className="sr-only"> {file.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AnswerFields({ step, answer, setAnswer }: { step: StepDetailResponse; answer: Answer; setAnswer: (answer: Answer) => void }) {
  if (step.kind === "text") {
    const min = step.config.minLength ?? 1;
    const count = answer.text.trim().length;
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <label htmlFor="answer-text" className="block text-xl font-bold">
          Your bio
        </label>
        <textarea
          id="answer-text"
          value={answer.text}
          onChange={(event) => setAnswer({ ...answer, text: event.target.value })}
          rows={9}
          maxLength={step.config.maxLength}
          placeholder={step.config.placeholder}
          aria-describedby="answer-count"
          className="mt-3 block w-full rounded-xl border border-[#cdd5e1] px-4 py-3 text-lg leading-relaxed focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/25"
        />
        <p id="answer-count" className={`mt-2 text-base ${count >= min ? "text-success" : "text-muted"}`}>
          {count} characters{count < min ? ` · at least ${min}` : " · looks good"}
        </p>
      </div>
    );
  }
  if (step.kind === "choice") {
    return (
      <fieldset className="space-y-3">
        <legend className="mb-3 text-xl font-bold">Which describes you?</legend>
        {(step.config.choices ?? []).map((choice) => (
          <label
            key={choice.value}
            className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 text-lg font-semibold ${
              answer.choice === choice.value ? "border-brand bg-brand-soft" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="choice"
              value={choice.value}
              checked={answer.choice === choice.value}
              onChange={() => setAnswer({ ...answer, choice: choice.value })}
              className="size-5 accent-brand"
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
    );
  }
  const items =
    step.kind === "confirm"
      ? [{ value: "confirmed", label: step.config.confirmLabel ?? "I've done this" }]
      : (step.config.items ?? []);
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 text-xl font-bold">{step.kind === "confirm" ? "Confirm when it's done" : "Tick each one when it's done"}</legend>
      {items.map((item) => {
        const checked = step.kind === "confirm" ? answer.confirmed : answer.checked.includes(item.value);
        return (
          <label
            key={item.value}
            className={`flex min-h-14 cursor-pointer items-center gap-4 rounded-2xl border-2 bg-white px-5 py-4 text-lg font-semibold ${checked ? "border-success bg-success-soft" : "border-line"}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) =>
                step.kind === "confirm"
                  ? setAnswer({ ...answer, confirmed: event.target.checked })
                  : setAnswer({
                      ...answer,
                      checked: event.target.checked ? [...answer.checked, item.value] : answer.checked.filter((value) => value !== item.value),
                    })
              }
              className="size-5 accent-success"
            />
            <span className="flex-1">{item.label}</span>
            {checked ? <CheckIcon className="size-5 text-success" /> : null}
          </label>
        );
      })}
    </fieldset>
  );
}
