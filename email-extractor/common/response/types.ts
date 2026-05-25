export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorResponse<E> = {
  success: false;
  data: E;
};
