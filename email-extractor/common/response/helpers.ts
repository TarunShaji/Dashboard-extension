import type { Context } from "hono";
import type { ApiErrorResponse, ApiSuccessResponse } from "./types";

export function successResponse<T>(c: Context, data: T, status = 200) {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return c.json(body, status as 200);
}

export function errResponse<E>(c: Context, data: E, status = 500) {
  const body: ApiErrorResponse<E> = { success: false, data };
  return c.json(body, status as 500);
}
