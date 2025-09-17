export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string = "Something went wrong", statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}