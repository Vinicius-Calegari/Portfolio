// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import TimePicker from "../src/TimePicker";
import { isDeliveryTime, isTimeAvailable } from "../src/schedule";

let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-02T21:10:00Z"));
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});
function Field({ date = "2026-10-03" }) {
  const [value, setValue] = useState("");
  return <TimePicker value={value} date={date} onChange={setValue} />;
}
const button = (name: string) =>
  document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
async function click(name: string) {
  await act(async () => button(name).click());
}

it("escolhe hora e minutos em duas colunas, oferecendo apenas 00, 20 e 40", async () => {
  await act(async () => root.render(<Field />));
  await click("Horário de entrega ou retirada");
  expect(
    [...document.querySelectorAll(".time-minutes button")].map(
      (b) => b.textContent,
    ),
  ).toEqual(["00", "20", "40"]);
  await click("Hora 18");
  await click("Minuto 20");
  expect(button("Horário de entrega ou retirada").textContent).toContain(
    "18:20",
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button("Horário de entrega ou retirada"));
});
it("bloqueia os horários já passados no fuso de São Paulo", async () => {
  await act(async () => root.render(<Field date="2026-10-02" />));
  await click("Horário de entrega ou retirada");
  expect(button("Hora 17").disabled).toBe(true);
  await click("Hora 18");
  expect(button("Minuto 00").disabled).toBe(true);
  expect(button("Minuto 20").disabled).toBe(false);
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("valida a grade, o futuro e a virada do dia sem depender do fuso do navegador", () => {
  for (const time of ["00:00", "18:00", "18:20", "18:40", "23:40"])
    expect(isDeliveryTime(time)).toBe(true);
  for (const time of ["", "24:00", "18:10", "18:30", "18:20:01"])
    expect(isDeliveryTime(time)).toBe(false);
  const now = new Date("2026-10-03T03:10:00Z");
  expect(isTimeAvailable("00:00", "2026-10-03", false, now)).toBe(false);
  expect(isTimeAvailable("00:20", "2026-10-03", false, now)).toBe(true);
  expect(isTimeAvailable("23:40", "2026-10-02", false, now)).toBe(false);
  expect(isTimeAvailable("00:00", "2026-10-03", true, now)).toBe(true);
});
