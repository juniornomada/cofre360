export type PrefetchTrigger = "hover" | "focus" | "viewport" | "unknown" | "intent";

export interface NavMetric {
  from: string;
  to: string;
  duration: number;
  timestamp: number;
  preloaded: boolean;
  trigger?: PrefetchTrigger;
  success: boolean;
  prefetchFailed?: boolean;
}
