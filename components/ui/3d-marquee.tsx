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
  const chunkSize = Math.ceil(images.length / 5);
  const chunks = Array.from({ length: 5 }, (_, i) =>
    images.slice(i * chunkSize, i * chunkSize + chunkSize),
  );

  // Durações base por coluna — mais alto = mais devagar
  const baseDurations = [42, 58, 36, 66, 50];

  return (
    <div
      className={cn(
        "h-full w-full overflow-hidden",
        className,
      )}
    >
      <div className="flex size-full items-center justify-center">
        {/* Grade — 4 colunas de cards verticais */}
        <div className="size-[2400px] shrink-0 scale-[55%] sm:scale-[70%] lg:scale-[88%] xl:scale-[105%]">
          <div
            style={{
              transform: "rotateX(55deg) rotateY(0deg) rotateZ(-45deg)",
            }}
            className="relative top-[400px] right-[62%] grid size-full origin-top-left grid-cols-5 gap-10 transform-3d"
          >
            {chunks.map((col, colIndex) => {
              const isEven = colIndex % 2 === 0;
              const doubled = [...col, ...col];
              const duration = baseDurations[colIndex] / speed;

              return (
                <motion.div
                  key={colIndex + "col"}
                  className="flex flex-col items-stretch gap-10"
                  animate={{ y: isEven ? ["0%", "-50%"] : ["-50%", "0%"] }}
                  transition={{
                    duration,
                    repeat: Infinity,
                    repeatType: "loop",
                    ease: "linear",
                  }}
                >
                  {doubled.map((image, imgIndex) => (
                    // Card vertical com fundo escuro — logo centralizada e legível
                    <div
                      key={imgIndex + image}
                      className="relative shrink-0 w-full aspect-[3/4] rounded-2xl bg-zinc-900 ring-1 ring-white/10 flex items-center justify-center p-8"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image}
                        alt=""
                        className="w-full h-auto max-h-full object-contain drop-shadow-lg"
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
