import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node.js standalone em .next/standalone/
  // Necessário para deploy em Railway, Render, VPS, Docker etc.
  // Na Vercel, essa opção é ignorada (a Vercel usa o output padrão).
  output: "standalone",
};

export default nextConfig;
