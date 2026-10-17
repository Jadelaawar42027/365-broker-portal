/**
 * File: apps/api/src/errors.ts
 * Purpose: The API's error type and the helpers routes use to fail with the right HTTP status and a
 * machine-readable code. The error handler plugin turns these into { error, message } responses.
 *
 * Functions:
 * - HttpError.constructor(statusCode, code, message): an error that carries its HTTP status and code.
 * - badRequest(message, code): 400.
 * - unauthorized(message): 401.
 * - forbidden(message): 403.
 * - notFound(message): 404.
 * - conflict(message, code): 409.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string, code = "bad_request") => new HttpError(400, code, message);
export const unauthorized = (message = "Please sign in.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You don't have access to this.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);
