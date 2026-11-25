/**
 * File: apps/api/src/services/background-tasks.ts
 * Purpose: Runs work after a response has been sent (such as re-extracting persona tags with Claude after a persona is
 * saved), so a slow outside call never holds up an admin's request. A failed task is logged and never crashes the
 * process. settle() lets tests and shutdown wait for everything still running.
 *
 * Functions:
 * - createBackgroundTasks(log): returns run(label, task), which starts a task without waiting for it, and settle(), which resolves once every started task has finished.
 */
import type { FastifyBaseLogger } from "fastify";

export type BackgroundTasks = {
  run(label: string, task: () => Promise<unknown>): void;
  settle(): Promise<void>;
};

export function createBackgroundTasks(log: FastifyBaseLogger): BackgroundTasks {
  const running = new Set<Promise<void>>();
  return {
    run(label, task) {
      const promise = Promise.resolve()
        .then(task)
        .then(
          () => undefined,
          (error: unknown) => log.error({ err: error, task: label }, "Background task failed"),
        )
        .finally(() => running.delete(promise));
      running.add(promise);
    },
    async settle() {
      while (running.size > 0) await Promise.all([...running]);
    },
  };
}
