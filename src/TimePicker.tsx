import { useEffect, useRef, useState } from "react";
import { Clock3, X } from "lucide-react";
import { deliveryHours, deliveryMinutes, isTimeAvailable } from "./schedule";

export default function TimePicker({
  value,
  date,
  manual = false,
  onChange,
}: {
  value: string;
  date: string;
  manual?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [hour = "", minute = ""] = value.split(":");
  const now = new Date();
  const available = (time: string) => isTimeAvailable(time, date, manual, now);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const selected = root.current?.querySelector<HTMLButtonElement>(
      '.time-hours [aria-pressed="true"]:not(:disabled)',
    );
    const currentHour = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    const target =
      selected ||
      root.current?.querySelector<HTMLButtonElement>(
        `.time-hours [aria-label="Hora ${currentHour}"]:not(:disabled)`,
      ) ||
      root.current?.querySelector<HTMLButtonElement>(
        ".time-hours button:not(:disabled)",
      );
    target?.scrollIntoView?.({ block: "center" });
    target?.focus();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="time-picker" ref={root}>
      <button
        type="button"
        className="time-trigger"
        ref={trigger}
        aria-label="Horário de entrega ou retirada"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={!date}
        onClick={() => setOpen(!open)}
      >
        <span>
          {value || (date ? "Escolha um horário" : "Escolha a data primeiro")}
        </span>
        <Clock3 size={18} />
      </button>
      {open && (
        <div
          className="time-popover"
          role="dialog"
          aria-label="Selecionar horário"
        >
          <div className="time-popover-head">
            <strong>Escolha o horário</strong>
            <button type="button" aria-label="Fechar horários" onClick={close}>
              <X size={17} />
            </button>
          </div>
          <div className="time-columns">
            <div>
              <strong>Horas</strong>
              <div className="time-hours" role="group" aria-label="Horas">
                {deliveryHours.map((h) => (
                  <button
                    type="button"
                    key={h}
                    aria-label={`Hora ${h}`}
                    aria-pressed={hour === h}
                    disabled={
                      !deliveryMinutes.some((m) => available(`${h}:${m}`))
                    }
                    onClick={() => {
                      const m =
                        deliveryMinutes.includes(minute) &&
                        available(`${h}:${minute}`)
                          ? minute
                          : deliveryMinutes.find((m) => available(`${h}:${m}`));
                      if (m) onChange(`${h}:${m}`);
                    }}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Minutos</strong>
              <div className="time-minutes" role="group" aria-label="Minutos">
                {deliveryMinutes.map((m) => (
                  <button
                    type="button"
                    key={m}
                    aria-label={`Minuto ${m}`}
                    aria-pressed={minute === m}
                    disabled={!hour || !available(`${hour}:${m}`)}
                    onClick={() => {
                      onChange(`${hour}:${m}`);
                      close();
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <small>Horários a cada 20 minutos.</small>
        </div>
      )}
    </div>
  );
}
