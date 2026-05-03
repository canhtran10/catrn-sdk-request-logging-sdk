import { AsyncLocalStorage } from 'async_hooks';

export interface RequestActionContext {
  requestActionId: string;
}

const requestActionStorage = new AsyncLocalStorage<RequestActionContext>();

export function runWithRequestActionContext<T>(
  ctx: RequestActionContext,
  fn: () => T,
): T {
  return requestActionStorage.run(ctx, fn);
}

export function getRequestActionContext(): RequestActionContext | undefined {
  return requestActionStorage.getStore();
}
