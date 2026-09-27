// A refusal with the HTTP status the route should report (400 bad input, 404 missing,
// 409 conflict, 501 needs a newer TREK).

export class OpError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function fail(message: string, status?: number): never {
  throw new OpError(message, status);
}
