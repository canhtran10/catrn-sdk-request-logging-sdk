/**
 * Filters for activity UI list API (all optional except project + time window).
 */
export interface ActivityListFilters {
  projectId: string;
  /** Inclusive lower bound (ISO 8601) */
  fromIso: string;
  /** Inclusive upper bound (ISO 8601) */
  toIso: string;
  userId?: string;
  customerId?: string;
  method?: string;
  statusCode?: number;
  eventType?: string;
  channel?: string;
  provider?: string;
  dbSystem?: string;
  sort: 'asc' | 'desc';
  limit: number;
  offset: number;
}
