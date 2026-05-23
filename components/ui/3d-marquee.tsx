"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export const ThreeDMarquee = ({
  images,
  className,
  speed = 1,
}: {
  images: string[];
  className?: string;
  /** Multiplicador de velocidade — padrão 1 (mais alto = mais rápido). */
  speed?: number;
}) => {
  const chunkSize = Math.ceil(images.length / 4);
  const chunks = Array.from({ length: 4 }, (_, i) =>
    images.slice(i * chunkSize, i * chunkSize + chunkSize),
  );

  // Durações base por coluna — mais alto = mais devagar
  const baseDurations = [42, 58, 36, 66];

  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex size-full items-center justify-center">
        {/* Grade 2000×2000 — escala maior para cobrir todos os cantos */}
        <div className="size-[2000px] shrink-0 scale-[65%] sm:scale-[82%] lg:scale-[105%] xl:scale-[122%]">
          <div
            style={{
              transform: "rotateX(55deg) rotateY(0deg) rotateZ(-45deg)",
            }}
            className="relative top-[220px] right-[50%] grid size-full origin-top-left grid-cols-4 gap-8 transform-3d"
          >
            {chunks.map((col, colIndex) => {
              const isEven = colIndex % 2 === 0;
              // Duplica os itens para loop contínuo sem salto
              const doubled = [...col, ...col];
              const duration = baseDurations[colIndex] / speed;

              return (
                <motion.div
                  key={colIndex + "col"}
                  className="flex flex-col items-start gap-10"
                  // y: ["0%", "-50%"] percorre exatamente 1× o conjunto original
                  // e a cópia começa onde o original terminou — loop perfeito
                  animate={{ y: isEven ? ["0%", "-50%"] : ["-50%", "0%"] }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "linear",
                  }}
                >
                  {doubled.map((image, imgIndex) => (
                    // Card full-bleed — foto cobre o card inteiro
                    <div
                      key={imgIndex + image}
                      className="relative shrink-0 w-[520px] aspect-[4/3] rounded-2xl overflow-hidden ring-1 ring-white/10"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="eager"
                      />
                    </div>
                  ))}
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
