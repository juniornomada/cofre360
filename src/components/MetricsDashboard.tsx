 import { useState, useEffect } from "react";
 import { getMetrics, NavMetric, PrefetchTrigger } from "@/lib/metrics";
 import { Activity, Zap, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
 import { Card } from "@/components/ui/card";
 
 export function MetricsDashboard() {
   const [metrics, setMetrics] = useState<NavMetric[]>([]);
   const [show, setShow] = useState(false);
 
   useEffect(() => {
     const update = () => setMetrics(getMetrics());
     update();
     // Check for updates every 2 seconds if shown
     const interval = setInterval(update, 2000);
     return () => clearInterval(interval);
   }, []);
 
   if (!show) {
     return (
       <button 
         onClick={() => setShow(true)}
         className="fixed bottom-24 right-4 z-[60] h-8 w-8 rounded-full bg-primary/20 backdrop-blur-sm flex items-center justify-center text-[10px] hover:bg-primary/40 transition-colors"
         title="Ver métricas de performance"
       >
         <Activity className="h-4 w-4 text-primary" />
       </button>
     );
   }
 
   const prefetched = metrics.filter(m => m.preloaded);
   const normal = metrics.filter(m => !m.preloaded);
 
   const avgPrefetched = prefetched.length > 0 
     ? prefetched.reduce((s, m) => s + m.duration, 0) / prefetched.length 
     : 0;
   
   const avgNormal = normal.length > 0 
     ? normal.reduce((s, m) => s + m.duration, 0) / normal.length 
     : 0;
 
   const successRate = metrics.length > 0
     ? (metrics.filter(m => m.success && !m.prefetchFailed).length / metrics.filter(m => !m.prefetchFailed).length) * 100
     : 100;

   const failedPrefetches = metrics.filter(m => m.prefetchFailed).length;
 
   const getTriggerStats = (trigger: PrefetchTrigger) => {
     const allForTrigger = metrics.filter(m => m.trigger === trigger);
     const successful = allForTrigger.filter(m => m.success && !m.prefetchFailed);
     const failed = allForTrigger.filter(m => m.prefetchFailed).length;
     
     const avg = successful.length > 0 
       ? successful.reduce((s, m) => s + m.duration, 0) / successful.length 
       : 0;

     const rate = allForTrigger.length > 0
       ? ((allForTrigger.length - failed) / allForTrigger.length) * 100
       : 100;

     return { avg, count: allForTrigger.length, failed, rate };
   };

   const hoverStats = getTriggerStats("hover");
   const focusStats = getTriggerStats("focus");
   const viewportStats = getTriggerStats("viewport");

   return (
     <div className="fixed inset-x-4 bottom-24 z-[60] animate-in slide-in-from-bottom-4 duration-300">
       <Card className="bg-card/95 backdrop-blur-xl border-primary/20 shadow-2xl p-4 overflow-hidden">
         <div className="flex items-center justify-between mb-4">
           <div className="flex items-center gap-2">
             <Activity className="h-4 w-4 text-primary" />
             <h3 className="text-sm font-bold">Métricas de Navegação</h3>
           </div>
           <button onClick={() => setShow(false)} className="text-xs text-muted-foreground hover:text-foreground underline">Fechar</button>
         </div>
 
         <div className="grid grid-cols-2 gap-3 mb-4">
           <div className="space-y-1">
             <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
               <Zap className="h-3 w-3 text-amber-400" /> Prefetch (Médio)
             </p>
             <p className="text-lg font-bold text-amber-400 tabular-nums">{avgPrefetched.toFixed(1)}ms</p>
             <p className="text-[9px] text-muted-foreground">{prefetched.length} amostras</p>
           </div>
           <div className="space-y-1">
             <p className="text-[10px] text-muted-foreground uppercase flex items-center gap-1">
               <Clock className="h-3 w-3 text-muted-foreground" /> Normal (Médio)
             </p>
             <p className="text-lg font-bold tabular-nums">{avgNormal.toFixed(1)}ms</p>
             <p className="text-[9px] text-muted-foreground">{normal.length} amostras</p>
           </div>
         </div>
 
         <div className="grid grid-cols-1 gap-2 mb-4 border-t border-border/30 pt-3">
           <div className="flex items-center justify-between text-[10px]">
             <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Hover:</span>
             <div className="flex gap-2">
               <span className="font-bold text-amber-400">{hoverStats.avg.toFixed(0)}ms</span>
               <span className="text-primary">{hoverStats.rate.toFixed(0)}% ok</span>
               {hoverStats.failed > 0 && <span className="text-destructive">({hoverStats.failed} falhas)</span>}
             </div>
           </div>
           <div className="flex items-center justify-between text-[10px]">
             <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Foco:</span>
             <div className="flex gap-2">
               <span className="font-bold text-amber-400">{focusStats.avg.toFixed(0)}ms</span>
               <span className="text-primary">{focusStats.rate.toFixed(0)}% ok</span>
               {focusStats.failed > 0 && <span className="text-destructive">({focusStats.failed} falhas)</span>}
             </div>
           </div>
           <div className="flex items-center justify-between text-[10px]">
             <span className="text-muted-foreground flex items-center gap-1"><Zap className="h-2.5 w-2.5" /> Vista:</span>
             <div className="flex gap-2">
               <span className="font-bold text-amber-400">{viewportStats.avg.toFixed(0)}ms</span>
               <span className="text-primary">{viewportStats.rate.toFixed(0)}% ok</span>
               {viewportStats.failed > 0 && <span className="text-destructive">({viewportStats.failed} falhas)</span>}
             </div>
           </div>
         </div>

         <div className="flex items-center justify-between pt-3 border-t border-border/50">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Sucesso: {successRate.toFixed(0)}%</span>
              </div>
              {failedPrefetches > 0 && (
                <div className="flex items-center gap-1.5 text-[9px] text-destructive">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  <span>{failedPrefetches} falhas de prefetch</span>
                </div>
              )}
            </div>
           {avgNormal > 0 && avgPrefetched > 0 && (
             <div className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
               {((avgNormal - avgPrefetched) / avgNormal * 100).toFixed(0)}% mais rápido
             </div>
           )}
         </div>
       </Card>
     </div>
   );
 }