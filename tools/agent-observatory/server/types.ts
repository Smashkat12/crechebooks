export interface AgentEvent {
  id?: number;
  timestamp: number;
  session: string;
  type: string;
  agent?: string;
  tool?: string;
  action?: string;
  data?: Record<string, unknown>;
  file?: string;
  command?: string;
  success?: boolean;
  reason?: string;
  message?: string;
  level?: string;
}

export interface EventQuery {
  session?: string;
  agent?: string;
  type?: string;
  from?: number;
  to?: number;
  limit?: number;
}
