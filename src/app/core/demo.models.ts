export type DemoEventType =
  | 'start'
  | 'queue'
  | 'execute'
  | 'complete'
  | 'cancel'
  | 'emit'
  | 'ignore'
  | 'destroy'
  | 'teardown'
  | 'error'
  | 'info';
export type Side = 'promise' | 'observable';
export type DemoVerdict = 'observable' | 'promise' | 'tie' | 'different-shape';
export type PresentationSpeed = 'fast' | 'normal' | 'slow';
export type RequestStatus = 'queued' | 'running' | 'completed' | 'cancelled' | 'error' | 'stale';

export interface DemoEvent {
  timestampMs: number;
  type: DemoEventType;
  message: string;
  requestId?: number;
  workflowId?: number;
}

export interface DemoMetrics {
  started: number;
  completed: number;
  cancelled: number;
  active: number;
  emitted: number;
  errors: number;
  retries: number;
  stale: number;
  rowsScanned: number;
  rowsAvoided: number;
  latestLatency: number;
  latestIntentAt: number;
  latestResultAt: number;
  ownerDestroyedAt: number;
  underlyingStoppedAt: number;
  workAfterOwnerDestroyed: number;
}

export interface ActiveRequest {
  id: number;
  label: string;
  status: RequestStatus;
}

export interface DemoState {
  loading: boolean;
  result: string;
  progress: number;
  events: DemoEvent[];
  metrics: DemoMetrics;
  requests: ActiveRequest[];
  codeOpen: boolean;
}

export interface UserResult {
  name: string;
  role: string;
  avatar: string;
}

export const emptyMetrics = (): DemoMetrics => ({
  started: 0, completed: 0, cancelled: 0, active: 0,
  emitted: 0, errors: 0, retries: 0, stale: 0,
  rowsScanned: 0, rowsAvoided: 0, latestLatency: 0,
  latestIntentAt: 0, latestResultAt: 0,
  ownerDestroyedAt: 0, underlyingStoppedAt: 0, workAfterOwnerDestroyed: 0
});

export const emptyState = (): DemoState => ({
  loading: false, result: '', progress: 0, events: [], metrics: emptyMetrics(), requests: [], codeOpen: false
});
