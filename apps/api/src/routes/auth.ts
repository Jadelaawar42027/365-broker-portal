/**
 * File: apps/api/src/routes/auth.ts
 * Purpose: Mounts Better Auth at /api/auth/* (sign in, sign out, get session). Fastify requests are converted to
 * web-standard Requests and Better Auth's Responses, including every Set-Cookie header, are copied back.
 *
 * Functions:
 * - registerAuthRoutes(app): mounts the Better Auth handler with a raw-body parser in its own plugin scope.
 * - sendWebResponse(reply, response): copies status, headers, cookies and body of a web Response onto a Fastify reply.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

export async function sendWebResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie" && key.toLowerCase() !== "content-length") reply.header(key, value);
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  const body = await response.text();
  return reply.send(body.length > 0 ? body : null);
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body));
    scope.route({
      method: ["GET", "POST"],
      url: "/api/auth/*",
      schema: { hide: true },
      handler: async (request, reply) => {
        const url = new URL(request.url, app.deps.env.WEB_ORIGIN);
        const hasBody = request.method !== "GET" && typeof request.body === "string" && request.body.length > 0;
        const webRequest = new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          body: hasBody ? (request.body as string) : undefined,
        });
        return sendWebResponse(reply, await app.deps.auth.handler(webRequest));
      },
    });
  });
}
