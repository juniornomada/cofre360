 import { useRouter } from "@tanstack/react-router";
 import { useEffect, useRef } from "react";
 
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
 
 const METRICS_KEY = "cofre360_nav_metrics";
 
 export function saveMetric(metric: NavMetric) {
   try {
     const existing = JSON.parse(localStorage.getItem(METRICS_KEY) || "[]");
     existing.push(metric);
     // Keep only last 100 metrics
     localStorage.setItem(METRICS_KEY, JSON.stringify(existing.slice(-100)));
     console.log("[Metrics] Navigation tracked:", metric);
   } catch (e) {
     console.error("[Metrics] Failed to save metric", e);
   }
 }
 
 export function getMetrics(): NavMetric[] {
   try {
     return JSON.parse(localStorage.getItem(METRICS_KEY) || "[]");
   } catch {
     return [];
   }
 }
 
 export function useNavigationTracking() {
   const router = useRouter();
 
   useEffect(() => {
     let navStart: number | null = null;
     let fromPath: string = "";
 
     // Capture the original prefetch error handler if it exists
     const originalOnError = (router as any).options?.onError;
     
     // Intercept errors at the router options level for failure tracking
     (router as any).options.onError = (err: any) => {
       // @ts-ignore
       if (err.preload) {
         const toPath = err.toLocation?.pathname;
         if (toPath) {
           const trigger = (window as any)._lastPrefetchTrigger?.[toPath] || "unknown";
           saveMetric({
             from: window.location.pathname,
             to: toPath,
             duration: 0,
             timestamp: Date.now(),
             preloaded: true,
             trigger,
             success: false,
             prefetchFailed: true,
           });
         }
       }
       return originalOnError?.(err);
     };

     const unsubLoad = router.subscribe("onLoad", (event) => {
       // @ts-ignore
       if (event.preload && !event.toLocation.state?.isNavigating) {
         // Preload successful
       }
     });
 
     // Workaround to track failures: 
     // We'll hook into the global window error to catch unhandled promise rejections 
     // from prefetches, or we can use a timeout-based approach if a preload 
     // doesn't resolve. For now, we'll keep it simple and just record 
     // successes and navigation results.

   // 2. Track navigation start
   const unsubBeforeNavigate = router.subscribe("onBeforeNavigate", (event) => {
     navStart = performance.now();
     fromPath = window.location.pathname;
   });
 
     // 3. Complete navigation tracking
     const unsubResolved = router.subscribe("onResolved", (event) => {
       if (navStart !== null) {
         const duration = performance.now() - navStart;
         const toPath = window.location.pathname;
 
         const path = toPath;
         // Check if this path was preloaded and what was the trigger
         // In a real app, we'd use TanStack's match cache to check status
         const trigger = (window as any)._lastPrefetchTrigger?.[path] || "unknown";
         const wasPreloaded = (window as any)._preloadedPaths?.has(path);

         saveMetric({
           from: fromPath,
           to: toPath,
           duration,
           timestamp: Date.now(),
           preloaded: wasPreloaded,
           trigger: wasPreloaded ? trigger : undefined,
           success: true,
         });
 
         navStart = null;
       }
     });
 
      return () => {
        unsubLoad();
        unsubBeforeNavigate();
        unsubResolved();
      };
   }, [router]);
 }