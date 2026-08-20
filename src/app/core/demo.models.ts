export type DemoEventType = 'start' | 'complete' | 'cancel' | 'error' | 'emit' | 'retry' | 'info';
export type Side = 'promise' | 'observable';
export type DemoVerdict = 'observable' | 'promise' | 'tie' | 'different-shape';
export type DemoCategory = 'core' | 'reactive' | 'promise';
export type PresentationSpeed = 'fast' | 'normal' | 'slow';
export type RequestStatus = 'running' | 'completed' | 'cancelled' | 'error' | 'stale';

export interface DemoEvent {
  timestamp: number;
  type: DemoEventType;
  message: string;
  requestId?: number;
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
  rowsScanned: 0, rowsAvoided: 0, latestLatency: 0
});

export const emptyState = (): DemoState => ({
  loading: false, result: '', progress: 0, events: [], metrics: emptyMetrics(), requests: [], codeOpen: false
});
