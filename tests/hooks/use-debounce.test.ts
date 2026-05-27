import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { useDebounce } from "@/hooks/use-debounce";

describe("useDebounce", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(()  => { vi.useRealTimers(); });

  it("retorna valor inicial imediatamente", () => {
    const { result } = renderHook(() => useDebounce("inicial", 300));
    expect(result.current).toBe("inicial");
  });

  it("não atualiza antes do delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    vi.advanceTimersByTime(200);
    expect(result.current).toBe("a");
  });

  it("atualiza após o delay", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("b");
  });

  it("cancela atualizações intermediárias (only last wins)", () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: "a" } },
    );
    rerender({ value: "b" });
    vi.advanceTimersByTime(100);
    rerender({ value: "c" });
    vi.advanceTimersByTime(100);
    rerender({ value: "d" });
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe("d");
  });
});
