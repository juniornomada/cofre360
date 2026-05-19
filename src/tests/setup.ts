 import "@testing-library/jest-dom";
 import { cleanup } from "@testing-library/react";
 import { afterEach, vi, expect } from "vitest";
 import * as axeMatchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
}
 
 expect.extend(axeMatchers);
 
 // Mocking matchMedia which is not available in jsdom
 Object.defineProperty(window, "matchMedia", {
   writable: true,
   value: vi.fn().mockImplementation((query) => ({
     matches: false,
     media: query,
     onchange: null,
     addListener: vi.fn(), // Deprecated
     removeListener: vi.fn(), // Deprecated
     addEventListener: vi.fn(),
     removeEventListener: vi.fn(),
     dispatchEvent: vi.fn(),
   })),
 });
 
 afterEach(() => {
   cleanup();
 });