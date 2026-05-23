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

  // Durações base por coluna (colunas pares descem, ímpares sobem)
  const baseDurations = [22, 28, 18, 32];

  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex size-full items-center justify-center">
        {/* Grade 2000×2000 — 4 colunas de cards 380px, escala cobre viewport */}
        <div className="size-[2000px] shrink-0 scale-[50%] sm:scale-[65%] lg:scale-[82%] xl:scale-[95%]">
          <div
            style={{
              transform: "rotateX(55deg) rotateY(0deg) rotateZ(-45deg)",
            }}
            className="relative top-[380px] right-[50%] grid size-full origin-top-left grid-cols-4 gap-8 transform-3d"
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
                    // Card com fundo escuro para as logos respirarem
                    <div
                      key={imgIndex + image}
                      className="relative shrink-0 w-[520px] aspect-[4/3] rounded-2xl bg-zinc-900/90 ring-1 ring-white/8 flex items-center justify-center p-5"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        className="max-h-full max-w-full object-contain"
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
