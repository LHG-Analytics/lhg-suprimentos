import { redirect } from "next/navigation";

// Rota raiz redireciona para /dashboard (middleware cuida da auth)
export default function HomePage() {
  redirect("/dashboard");
}
