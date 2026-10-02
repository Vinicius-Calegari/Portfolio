export const deliveryHours = Array.from({ length: 24 }, (_, n) =>
  String(n).padStart(2, "0"),
);
export const deliveryMinutes = ["00", "20", "40"];
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function isDeliveryTime(value: string) {
  return /^(?:[01]\d|2[0-3]):(?:00|20|40)$/.test(value);
}

export function isTimeAvailable(
  value: string,
  date: string,
  manual = false,
  now = new Date(),
) {
  if (!date || !isDeliveryTime(value)) return false;
  const parts: Record<string, string> = {};
  for (const { type, value } of clock.formatToParts(now)) parts[type] = value;
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  if (date < today) return false;
  return manual || date > today || value > `${parts.hour}:${parts.minute}`;
}
