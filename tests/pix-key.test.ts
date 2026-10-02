import { describe, expect, it } from "vitest";
import { normalizePixKey, pixPayload, crc16 } from "../src/pix";

function fields(payload: string) {
  const result: Record<string, string> = {};
  for (let i = 0; i < payload.length;) {
    const id = payload.slice(i, i + 2);
    const size = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + size);
    if (value.length !== size) throw new Error("Campo Pix truncado");
    result[id] = value;
    i += 4 + size;
  }
  return result;
}

describe("formatação da chave no BR Code Pix", () => {
  it.each([
    "+5531987654321",
    "5531987654321",
    "+55 (31) 98765-4321",
    "(31) 98765-4321",
  ])("codifica o celular %s no formato internacional", (key) => {
    const payload = pixPayload(key, "ROSILENE", "FERROS", 7000, "ROS17");
    const root = fields(payload);
    expect(fields(root["26"])["01"]).toBe("+5531987654321");
    expect(root["54"]).toBe("70.00");
    expect(fields(root["62"])["05"]).toBe("ROS17");
    expect(root["63"]).toBe(crc16(payload.slice(0, -4)));
  });
  it("reconhece o celular sem DDI quando corresponde ao contato cadastrado", () => {
    expect(normalizePixKey("31987654321", "5531987654321")).toBe(
      "+5531987654321",
    );
  });
  it("preserva CPF válido e retira apenas a máscara do documento", () => {
    expect(normalizePixKey("52998224725")).toBe("52998224725");
    expect(normalizePixKey("529.982.247-25")).toBe("52998224725");
    expect(
      fields(
        fields(pixPayload("529.982.247-25", "TESTE", "FERROS", 100))["26"],
      )["01"],
    ).toBe("52998224725");
  });
  it("preserva CNPJ, email e chave aleatória", () => {
    expect(normalizePixKey("00.038.166/0001-05")).toBe("00038166000105");
    expect(normalizePixKey(" teste@example.com ")).toBe("teste@example.com");
    expect(normalizePixKey("123e4567-e12b-12d1-a456-426655440000")).toBe(
      "123e4567-e12b-12d1-a456-426655440000",
    );
  });
  it("recusa número ambíguo sem trocar o tipo de chave ou destinatário", () => {
    expect(() => normalizePixKey("31987654321")).toThrow("+55");
    expect(() => normalizePixKey("31987654321", "5531987654322")).toThrow(
      "+55",
    );
    expect(() => normalizePixKey("529.982.247-24")).toThrow("Confira a chave");
    expect(() => normalizePixKey("+5531123456789")).toThrow();
  });
});
