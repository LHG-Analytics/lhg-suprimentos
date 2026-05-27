import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadCsv } from "@/lib/csv";

describe("downloadCsv", () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => "blob:test-url");
    global.URL.revokeObjectURL = vi.fn();
    const mockAnchor = {
      href: "", download: "",
      click: vi.fn(), setAttribute: vi.fn(),
    };
    vi.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, "appendChild").mockImplementation(n => n);
    vi.spyOn(document.body, "removeChild").mockImplementation(n => n);
  });

  it("cria objectURL e dispara download", () => {
    downloadCsv("test", ["A", "B"], [["1", "2"]]);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
  });

  it("inclui BOM UTF-8 (0xFEFF)", () => {
    let captured = "";
    global.Blob = class {
      constructor(parts: BlobPart[]) { captured = (parts as string[]).join(""); }
    } as unknown as typeof Blob;
    downloadCsv("test", ["A"], [["1"]]);
    expect(captured.charCodeAt(0)).toBe(0xFEFF);
  });

  it("escapa células com vírgula em aspas duplas", () => {
    let captured = "";
    global.Blob = class {
      constructor(parts: BlobPart[]) { captured = (parts as string[]).join(""); }
    } as unknown as typeof Blob;
    downloadCsv("test", ["Nome"], [["Empresa, Ltda"]]);
    expect(captured).toContain('"Empresa, Ltda"');
  });
});
