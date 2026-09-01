/**
 * loading.tsx — skeleton do cadastro de itens controlados.
 *
 * Esta rota é a que mais precisava: além do catálogo da unidade, ela lê o banco
 * do Automo por internet pública para sugerir mapeamento. Com o Automo lento ou
 * caído, a espera chegava aos 30s de timeout (10s conexão + 20s statement) sem
 * nenhum sinal na tela.
 */
import {
  SkeletonHeader,
  SkeletonKpiGrid,
  SkeletonTabela,
} from "@/components/lhg/skeletons";

export default function Loading() {
  return (
    <div className="max-w-[1400px] mx-auto space-y-5 pb-10 animate-pulse">
      <SkeletonHeader tituloW={28} subW={64} acoes={1} />
      <SkeletonKpiGrid count={2} cols={2} />
      <SkeletonTabela linhas={8} colunas={[52, 16, 20, 20, 12]} />
    </div>
  );
}
