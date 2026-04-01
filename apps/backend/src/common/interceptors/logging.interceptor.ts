import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const { method, url } = request;
    const controller = context.getClass().name;
    const handler = context.getHandler().name;
    const now = Date.now();

    this.logger.log(`→ ${method} ${url}  [${controller}.${handler}]`);

    return next.handle().pipe(
      tap({
        next: () => {
          const response = ctx.getResponse<Response>();
          const ms = Date.now() - now;
          this.logger.log(
            `← ${method} ${url}  ${response.statusCode}  ${ms}ms`,
          );
        },
        error: () => {
          const ms = Date.now() - now;
          this.logger.warn(`← ${method} ${url}  ERROR  ${ms}ms`);
        },
      }),
    );
  }
}
