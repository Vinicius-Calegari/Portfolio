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
    .slice(0, n);
export function pixPayload(
  key: string,
  name: string,
  city: string,
  total: number,
  txid = "***",
) {
  if (!key || !name || !Number.isSafeInteger(total) || total <= 0)
    throw new Error("O Pix ainda não foi configurado.");
  const merchant = field("00", "br.gov.bcb.pix") + field("01", key.trim());
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
