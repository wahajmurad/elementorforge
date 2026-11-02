export class AuthError extends Error {}
export class UnauthorizedError extends Error {}
export class NotFoundError extends Error {}
export class ForbiddenError extends Error {}
export class ValidationError extends Error {}
export class RateLimitError extends Error {}
export class InsufficientCreditsError extends Error {
  constructor(public balance: number, public needed: number) {
    super(`Insufficient credits: have ${balance}, need ${needed}`);
  }
}
export class SiteNotConnectedError extends Error {}
export class PipelineError extends Error {
  constructor(message: string, public step?: string, public meta?: object) {
    super(message);
  }
}
