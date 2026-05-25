"use client";

/**
 * tour-context.tsx — LHG Product Tour
 * Contexto global que controla o estado do tour.
 * O TourProvider fica no shell-client.tsx (layout persistente),
 * então o estado sobrevive a navegações client-side.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { TOUR_STEPS } from "./tour-steps";

// ── Tipos ──────────────────────────────────────────────────────────────────────
interface TourContextValue {
  isActive:     boolean;
  currentStep:  number;
  totalSteps:   number;
  startTour:    () => void;
  nextStep:     () => void;
  prevStep:     () => void;
  skipTour:     () => void;
}

// ── Context ────────────────────────────────────────────────────────────────────
const TourContext = createContext<TourContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────
export function TourProvider({ children }: { children: ReactNode }) {
  const [isActive,    setIsActive]    = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => {
      const next = s + 1;
      if (next >= TOUR_STEPS.length) {
        setIsActive(false);
        return 0;
      }
      return next;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
  }, []);

  return (
    <TourContext.Provider
      value={{ isActive, currentStep, totalSteps: TOUR_STEPS.length, startTour, nextStep, prevStep, skipTour }}
    >
      {children}
    </TourContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────────────────────────
export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour precisa estar dentro de <TourProvider>");
  return ctx;
}
