import { phone } from "./domain";

const field = (id: string, value: string) =>
  id + String(new TextEncoder().encode(value).length).padStart(2, "0") + value;
export function crc16(text: string) {
  let crc = 0xffff;
  for (const b of new TextEncoder().encode(text)) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++)
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}
const ascii = (s: string, n: number) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim()
    .slice(0, n);

function validCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (const length of [9, 10]) {
    const sum = [...value.slice(0, length)].reduce(
      (s, digit, i) => s + Number(digit) * (length + 1 - i),
      0,
    );
    const digit = (sum * 10) % 11;
    if (Number(value[length]) !== (digit === 10 ? 0 : digit)) return false;
  }
  return true;
}

export function normalizePixKey(raw: string, whatsapp = "") {
  const key = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) return key;
  if (/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(key))
    return key.toLowerCase();
  const compact = key.replace(/[\s().\/-]/g, "");
  if (/^[A-Z\d]{12}\d{2}$/i.test(compact)) return compact.toUpperCase();
  if (validCpf(compact)) return compact;
  if (/^\+?55\d{11}$/.test(compact) || /^\(\d{2}\)/.test(key))
    return `+${phone(key)}`;
  // A bare number can mean CPF or phone. Only infer phone from the known contact.
  if (/^\d{11}$/.test(key) && whatsapp) {
    try {
      const normalized = phone(key);
      if (normalized === phone(whatsapp)) return `+${normalized}`;
    } catch {
      // The configuration message below also covers invalid phone numbers.
    }
  }
  throw new Error(
    "Confira a chave Pix cadastrada. Para celular, informe +55, DDD e número; para CPF/CNPJ, confira os dígitos.",
  );
}

export function pixPayload(
  key: string,
  name: string,
  city: string,
  total: number,
  txid = "***",
) {
  if (!key || !name || !Number.isSafeInteger(total) || total <= 0)
    throw new Error("O Pix ainda não foi configurado.");
  const merchant =
    field("00", "br.gov.bcb.pix") + field("01", normalizePixKey(key));
  if (new TextEncoder().encode(merchant).length > 99)
    throw new Error("A chave Pix é muito longa.");
  const payload =
    field("00", "01") +
    field("26", merchant) +
    field("52", "0000") +
    field("53", "986") +
    field("54", (total / 100).toFixed(2)) +
    field("58", "BR") +
    field("59", ascii(name, 25)) +
    field("60", ascii(city, 15)) +
    field("62", field("05", txid.replace(/[^A-Za-z0-9*]/g, "").slice(0, 25))) +
    "6304";
  return payload + crc16(payload);
}
