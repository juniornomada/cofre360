 import { Link, LinkProps, useRouter } from "@tanstack/react-router";
 import { useEffect, useRef, useCallback } from "react";
 import { PrefetchTrigger } from "../lib/metrics";
 
 interface SmartLinkProps extends LinkProps {
   children: React.ReactNode;
   className?: string;
   style?: React.CSSProperties;
 }
 
 /**
  * A wrapper around TanStack Link that triggers prefetch on:
  * 1. Intent (hover/touch) - via preload="intent"
  * 2. Keyboard Focus
  * 3. Visibility (IntersectionObserver)
  */
 export function SmartLink({ children, ...props }: SmartLinkProps) {
   const ref = useRef<HTMLAnchorElement>(null);
   const router = useRouter();

   const trackTrigger = useCallback((trigger: PrefetchTrigger) => {
     const path = props.to as string;
     if (!path) return;
     
     if (!(window as any)._lastPrefetchTrigger) (window as any)._lastPrefetchTrigger = {};
     if (!(window as any)._preloadedPaths) (window as any)._preloadedPaths = new Set();
     
     (window as any)._lastPrefetchTrigger[path] = trigger;
     (window as any)._preloadedPaths.add(path);
     
     // Manually trigger prefetch to ensure we catch it
     router.preloadRoute({ to: props.to as any });
   }, [props.to, router]);
 
   useEffect(() => {
     const element = ref.current;
     if (!element) return;
 
     // 1. Prefetch on visibility
     const observer = new IntersectionObserver(
       (entries) => {
         entries.forEach((entry) => {
           if (entry.isIntersecting) {
             trackTrigger("viewport");
             observer.unobserve(element);
           }
         });
       },
       { threshold: 0.1 }
     );
 
     observer.observe(element);
 
     const handleFocus = () => trackTrigger("focus");
     const handleMouseEnter = () => trackTrigger("hover");

     element.addEventListener("focus", handleFocus);
     element.addEventListener("mouseenter", handleMouseEnter);

     return () => {
       observer.disconnect();
       element.removeEventListener("focus", handleFocus);
       element.removeEventListener("mouseenter", handleMouseEnter);
     };
   }, [props.to, trackTrigger]);
 
   return (
     <Link 
       ref={ref} 
       preload="viewport" // Prefetch when entering viewport
       {...props}
     >
       {children}
     </Link>
   );
 }