"use client";

/**
 * tour-overlay.tsx — LHG Product Tour
 * Componente visual do tour: spotlight + balão de quadrinho estilo comic book.
 *
 * Spotlight: 4 painéis semi-transparentes ao redor do elemento alvo.
 * Balão: borda grossa, sombra offset (efeito quadrinho), cauda apontando pro alvo.
 * Posicionamento: calculado via getBoundingClientRect() + reajustado ao mudar pathname.
 */
import { useEffect, useState, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTour } from "./tour-context";
import { TOUR_STEPS, type TourStep } from "./tour-steps";

// ── Constantes ────────────────────────────────────────────────────────────────
const SPOTLIGHT_PAD = 10;  // padding ao redor do alvo (px)
const BUBBLE_GAP    = 20;  // distância da borda do spotlight até o balão (px)
const BUBBLE_W      = 300; // largura do balão (px)

// ── Tipos internos ─────────────────────────────────────────────────────────────
interface Rect { top: number; left: number; right: number; bottom: number; width: number; height: number }

// ── Posição do balão baseado no alvo + position ────────────────────────────────
function computeBubbleStyle(rect: Rect, step: TourStep): React.CSSProperties {
  const pad = SPOTLIGHT_PAD;
  const gap = BUBBLE_GAP;

  switch (step.position) {
    case "right": return {
      top:  Math.max(8, rect.top + rect.height / 2 - 80),
      left: rect.right + pad + gap,
    };
    case "left": return {
      top:  Math.max(8, rect.top + rect.height / 2 - 80),
      right: window.innerWidth - (rect.left - pad - gap),
    };
    case "bottom": return {
      top:  rect.bottom + pad + gap,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 8)),
    };
    case "top": return {
      bottom: window.innerHeight - (rect.top - pad - gap),
      left:   Math.max(8, Math.min(rect.left + rect.width / 2 - BUBBLE_W / 2, window.innerWidth - BUBBLE_W - 8)),
    };
    default: return {};
  }
}

// ── Cauda do balão (triângulo) ─────────────────────────────────────────────────
function BubbleTail({ position }: { position: TourStep["position"] }) {
  const base: React.CSSProperties = {
    position: "absolute",
    width: 0,
    height: 0,
  };

  switch (position) {
    case "right":
      return (
        <>
          {/* borda da cauda */}
          <div style={{ ...base, left: -14, top: "50%", transform: "translateY(-50%)",
            borderTop: "12px solid transparent",
            borderBottom: "12px solid transparent",
            borderRight: "14px solid var(--tour-border)",
          }} />
          {/* fill da cauda */}
          <div style={{ ...base, left: -10, top: "50%", transform: "translateY(-50%)",
            borderTop: "10px solid transparent",
            borderBottom: "10px solid transparent",
            borderRight: "11px solid var(--tour-bg)",
          }} />
        </>
      );
    case "left":
      return (
        <>
          <div style={{ ...base, right: -14, top: "50%", transform: "translateY(-50%)",
            borderTop: "12px solid transparent",
            borderBottom: "12px solid transparent",
            borderLeft: "14px solid var(--tour-border)",
          }} />
          <div style={{ ...base, right: -10, top: "50%", transform: "translateY(-50%)",
            borderTop: "10px solid transparent",
            borderBottom: "10px solid transparent",
            borderLeft: "11px solid var(--tour-bg)",
          }} />
        </>
      );
    case "bottom":
      return (
        <>
          <div style={{ ...base, top: -14, left: 28,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderBottom: "14px solid var(--tour-border)",
          }} />
          <div style={{ ...base, top: -10, left: 30,
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderBottom: "11px solid var(--tour-bg)",
          }} />
        </>
      );
    case "top":
      return (
        <>
          <div style={{ ...base, bottom: -14, left: 28,
            borderLeft: "12px solid transparent",
            borderRight: "12px solid transparent",
            borderTop: "14px solid var(--tour-border)",
          }} />
          <div style={{ ...base, bottom: -10, left: 30,
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: "11px solid var(--tour-bg)",
          }} />
        </>
      );
    default: return null;
  }
}

// ── Balão de quadrinho ─────────────────────────────────────────────────────────
function ComicBubble({
  step,
  stepIndex,
  totalSteps,
  targetRect,
  onNext,
  onPrev,
  onSkip,
  isLast,
}: {
  step:       TourStep;
  stepIndex:  number;
  totalSteps: number;
  targetRect: Rect | null;
  onNext:     () => void;
  onPrev:     () => void;
  onSkip:     () => void;
  isLast:     boolean;
}) {
  const isCentered = step.position === "center" || !targetRect;
  const bubbleStyle = targetRect && !isCentered
    ? computeBubbleStyle(targetRect, step)
    : {};

  return (
    <div
      className={cn(
        "fixed z-[61]",
        isCentered && "inset-0 flex items-center justify-center pointer-events-none",
      )}
    >
      <div
        className="pointer-events-auto relative"
        style={{
          width:  BUBBLE_W,
          position: isCentered ? "relative" : "fixed",
          ...(!isCentered && bubbleStyle),
          // CSS vars para cauda
          ["--tour-border" as string]: "hsl(var(--foreground))",
          ["--tour-bg" as string]:     "hsl(var(--card))",
        }}
      >
        {/* Sombra offset estilo quadrinho */}
        <div
          className="absolute inset-0 rounded-2xl"
          style={{
            background: "hsl(var(--foreground))",
            transform: "translate(5px, 5px)",
            borderRadius: "1rem",
          }}
        />

        {/* Balão principal */}
        <div
          className="relative rounded-2xl bg-card border-[2.5px] border-foreground p-5 flex flex-col gap-3"
          style={{ borderRadius: "1rem" }}
        >
          {/* Cauda */}
          {!isCentered && targetRect && <BubbleTail position={step.position} />}

          {/* Emoji + fechar */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {step.emoji && (
                <span className="text-2xl leading-none select-none">{step.emoji}</span>
              )}
              <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase tracking-widest">
                {stepIndex + 1} / {totalSteps}
              </span>
            </div>
            <button
              onClick={onSkip}
              className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Fechar tour"
            >
              <X size={13} />
            </button>
          </div>

          {/* Texto */}
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-foreground leading-snug">
              {step.title}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {step.description}
            </p>
          </div>

          {/* Progressão */}
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1 rounded-full transition-all duration-300",
                  i === stepIndex
                    ? "bg-lhg-500 flex-[2]"
                    : i < stepIndex
                    ? "bg-lhg-500/40 flex-1"
                    : "bg-muted flex-1",
                )}
              />
            ))}
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-0.5">
            {stepIndex > 0 && (
              <button
                onClick={onPrev}
                className="flex items-center gap-1 h-8 px-3 rounded-lg border border-border text-muted-foreground hover:text-foreground text-xs font-medium transition-colors"
              >
                <ChevronLeft size={12} />
                Voltar
              </button>
            )}
            <button
              onClick={onNext}
              className="flex-1 flex items-center justify-center gap-1.5 h-8 px-4 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white text-xs font-bold transition-colors"
            >
              {isLast ? "Concluir" : "Próximo"}
              {!isLast && <ChevronRight size={12} />}
              {isLast && <ArrowRight size={12} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tour Overlay (root) ────────────────────────────────────────────────────────
export function TourOverlay() {
  const { isActive, currentStep, totalSteps, nextStep, prevStep, skipTour } = useTour();
  const pathname = usePathname();
  const router   = useRouter();

  const step        = TOUR_STEPS[currentStep];
  const isLast      = currentStep === totalSteps - 1;
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  // ── Navegação automática para a página do passo ─────────────────────────────
  useEffect(() => {
    if (!isActive || !step?.page) return;
    if (pathname !== step.page) {
      router.push(step.page);
    }
  }, [isActive, currentStep, step?.page, pathname, router]);

  // ── Mede o elemento alvo após navegação / mudança de step ───────────────────
  useEffect(() => {
    if (!isActive || !step?.target) {
      setTargetRect(null);
      return;
    }
    // Aguarda a navegação + renderização completar
    const measure = () => {
      const el = document.querySelector(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
        // Scroll para o elemento se necessário
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    };

    const t1 = setTimeout(measure, 150);
    const t2 = setTimeout(measure, 600); // segunda tentativa após animações de página
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [isActive, currentStep, pathname, step?.target]);

  // ── Remede ao redimensionar janela ──────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;
    const handle = () => {
      if (!step?.target) return;
      const el = document.querySelector(step.target!);
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height });
      }
    };
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, [isActive, step?.target]);

  if (!isActive) return null;

  const pad = SPOTLIGHT_PAD;
  const hasTarget = !!targetRect && step.position !== "center";

  return (
    <>
      {/* ── Spotlight: 4 painéis escuros ao redor do alvo ─────────────────── */}
      {hasTarget && targetRect ? (
        <>
          {/* Topo */}
          <div
            className="fixed inset-x-0 top-0 z-[60] pointer-events-auto"
            style={{ height: Math.max(0, targetRect.top - pad), background: "rgba(0,0,0,0.72)" }}
            onClick={skipTour}
          />
          {/* Esquerda */}
          <div
            className="fixed left-0 z-[60] pointer-events-auto"
            style={{
              top:    Math.max(0, targetRect.top - pad),
              width:  Math.max(0, targetRect.left - pad),
              height: targetRect.height + 2 * pad,
              background: "rgba(0,0,0,0.72)",
            }}
            onClick={skipTour}
          />
          {/* Direita */}
          <div
            className="fixed right-0 z-[60] pointer-events-auto"
            style={{
              top:  Math.max(0, targetRect.top - pad),
              left: targetRect.right + pad,
              height: targetRect.height + 2 * pad,
              background: "rgba(0,0,0,0.72)",
            }}
            onClick={skipTour}
          />
          {/* Rodapé */}
          <div
            className="fixed inset-x-0 bottom-0 z-[60] pointer-events-auto"
            style={{
              top: targetRect.bottom + pad,
              background: "rgba(0,0,0,0.72)",
            }}
            onClick={skipTour}
          />
          {/* Borda verde de destaque ao redor do alvo */}
          <div
            className="fixed z-[60] rounded-xl pointer-events-none"
            style={{
              top:    targetRect.top - pad,
              left:   targetRect.left - pad,
              width:  targetRect.width + 2 * pad,
              height: targetRect.height + 2 * pad,
              boxShadow: "0 0 0 2.5px hsl(var(--lhg-500)), 0 0 16px 4px hsl(var(--lhg-500) / 0.25)",
              borderRadius: 10,
            }}
          />
        </>
      ) : (
        // Overlay sólido para passos centralizados
        <div
          className="fixed inset-0 z-[60] pointer-events-auto"
          style={{ background: "rgba(0,0,0,0.72)" }}
          onClick={skipTour}
        />
      )}

      {/* ── Balão de quadrinho ─────────────────────────────────────────────── */}
      <ComicBubble
        step={step}
        stepIndex={currentStep}
        totalSteps={totalSteps}
        targetRect={hasTarget ? targetRect : null}
        onNext={nextStep}
        onPrev={prevStep}
        onSkip={skipTour}
        isLast={isLast}
      />
    </>
  );
}
