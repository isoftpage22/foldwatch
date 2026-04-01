export interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
  };
}

export function ok<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
   
  return { data, ...(meta ? { meta } : {}) };
}

export function paginated<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): ApiResponse<T[]> {
  return {
    data,
    meta: { page, limit, total },
  };
}
