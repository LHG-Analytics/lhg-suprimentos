import { useState, useEffect } from "react";

/**
 * useDebounce — atrasa a atualização de um valor por `delay` ms.
 * Evita cálculos/re-renders desnecessários durante digitação.
 *
 * @example
 *   const buscaDebounced = useDebounce(busca, 300);
 *   const filtrado = useMemo(() => items.filter(...buscaDebounced...), [buscaDebounced]);
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
