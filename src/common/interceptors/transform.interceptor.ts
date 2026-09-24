import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  data: T;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, StandardResponse<T> | any> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response.statusCode || 200;

    return next.handle().pipe(
      map((data) => {
        // If data already has success defined or is null/empty
        if (data && typeof data === 'object' && 'success' in data) {
          return {
            statusCode,
            timestamp: new Date().toISOString(),
            ...data,
          };
        }

        return {
          success: true,
          statusCode,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
