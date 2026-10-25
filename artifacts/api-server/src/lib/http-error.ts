/** An error that carries the HTTP status and message to send back. Thrown by routes and turned into a response by the global error handler. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}
