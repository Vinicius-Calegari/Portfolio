import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { Config, Pedido } from "./domain";
import { addressText, dateBR, money, statuses } from "./domain";
export type ReportKind = "producao" | "periodo" | "individual" | "receber";
export async function makeReport(
  kind: ReportKind,
  orders: Pedido[],
  config: Config,
  includePending = false,
  logoData?: string,
) {
  const doc = new jsPDF({ format: "a4", unit: "mm" });
  const created = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  let logo = logoData;
  if (!logo)
    try {
      const blob = await (await fetch("/logo.jpg")).blob();
      logo = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
    } catch {
      /* Text-only header remains printable. */
    }
  if (logo) {
    try {
      const image = doc.getImageProperties(logo);
      if (!image.width || !image.height) logo = undefined;
    } catch {
      logo = undefined;
    }
  }
  const title = {
    producao: "Lista de produção · checklist",
    periodo: "Pedidos por período",
    individual: "Pedido individual",
    receber: "Contas a receber",
  }[kind];
  function head() {
    if (logo) doc.addImage(logo, "JPEG", 14, 10, 22, 22);
    doc.setTextColor("#8B3524");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("Salgados Rosilene", logo ? 40 : 14, 18);
    doc.setTextColor("#333333");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(
      `WhatsApp: ${config.whatsapp.replace(/^55(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3")}`,
      logo ? 40 : 14,
      25,
    );
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(title, 14, 41);
    doc.setDrawColor("#C4974A");
    doc.line(14, 45, 196, 45);
  }
  const base = {
    margin: { top: 51, right: 14, bottom: 19, left: 14 },
    styles: {
      font: "helvetica",
      fontSize: 10,
      cellPadding: 3,
      textColor: "#292929",
    },
    headStyles: {
      fillColor: "#F1E6DB",
      textColor: "#5F291D",
      fontStyle: "bold" as const,
    },
    alternateRowStyles: { fillColor: "#FAF8F5" },
    rowPageBreak: "avoid" as const,
    didDrawPage: head,
  };
  if (kind === "producao") {
    const selected = orders
      .filter(
        (p) =>
          p.status === "confirmado" ||
          (includePending && p.status === "pendente"),
      )
      .sort(
        (a, b) =>
          a.data_entrega.localeCompare(b.data_entrega) ||
          a.horario.localeCompare(b.horario) ||
          a.numero - b.numero,
      );
    const daily = new Map<string, Map<string, number>>();
    for (const p of selected) {
      const day = daily.get(p.data_entrega) || new Map<string, number>();
      for (const g of p.grupos_pedido)
        for (const i of g.itens_pedido)
          day.set(
            i.nome_produto,
            (day.get(i.nome_produto) || 0) + i.quantidade,
          );
      daily.set(p.data_entrega, day);
    }
    const body = [...daily]
      .sort(([a], [b]) => a.localeCompare(b))
      .flatMap(([day, items]) =>
        [...items]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([name, qty]) => [dateBR(day), name, String(qty), "", ""]),
      );
    autoTable(doc, {
      ...base,
      startY: 51,
      head: [["Data", "Salgado", "Unidades", "Feito", "Separado"]],
      body: body.length
        ? body
        : [["—", "Nenhum pedido selecionado", "0", "", ""]],
      columnStyles: {
        0: { cellWidth: 24 },
        2: { cellWidth: 24, fontSize: 16, fontStyle: "bold", halign: "right" },
        3: { cellWidth: 23, halign: "center" },
        4: { cellWidth: 25, halign: "center" },
      },
      didDrawCell: ({ section, column, cell }) => {
        if (section === "body" && body.length && column.index >= 3) {
          const size = 4;
          doc.setDrawColor("#666666");
          doc.setLineWidth(0.25);
          doc.rect(
            cell.x + (cell.width - size) / 2,
            cell.y + (cell.height - size) / 2,
            size,
            size,
          );
        }
      },
    });
    if (selected.length) {
      let y =
        (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 12;
      if (y > 240) {
        doc.addPage();
        y = 54;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor("#5F291D");
      doc.text("Separação e entrega por pedido", 14, y);
      autoTable(doc, {
        ...base,
        startY: y + 5,
        head: [
          [
            "Data / hora",
            "Pedido / cliente",
            "Entrega / retirada",
            "Salgados",
            "Separado",
          ],
        ],
        body: selected.map((p) => {
          const name = p.nome_cliente.trim();
          const firstName =
            name === "Cliente removido"
              ? name
              : name.split(/\s+/)[0] || "Nome indisponível";
          const destination =
            p.tipo === "retirada"
              ? "Retirada no local"
              : `${addressText(p.endereco) || "Endereço indisponível"}${p.ponto_referencia ? `\nRef.: ${p.ponto_referencia}` : ""}`;
          return [
            `${dateBR(p.data_entrega)}\n${p.horario.slice(0, 5)}`,
            `#${p.numero}\n${firstName}`,
            destination,
            p.grupos_pedido
              .map(
                (g, n) =>
                  `Grupo ${n + 1}:\n${g.itens_pedido.map((i) => `${i.quantidade} ${i.nome_produto}`).join("\n")}`,
              )
              .join("\n"),
            "",
          ];
        }),
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 29 },
          2: { cellWidth: 60 },
          3: { cellWidth: 46 },
          4: { cellWidth: 22, halign: "center" },
        },
        didDrawCell: ({ section, column, cell }) => {
          if (section === "body" && column.index === 4) {
            const size = 4;
            doc.setDrawColor("#666666");
            doc.setLineWidth(0.25);
            doc.rect(
              cell.x + (cell.width - size) / 2,
              cell.y + (cell.height - size) / 2,
              size,
              size,
            );
          }
        },
      });
    }
  } else if (kind === "individual") {
    const selected = orders;
    selected.forEach((p, index) => {
      if (index) doc.addPage();
      head();
      doc.setTextColor("#222222");
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      const nameLines = doc.splitTextToSize(
        `#${p.numero} - ${p.nome_cliente}`,
        182,
      );
      doc.text(nameLines, 14, 53);
      doc.setFont("helvetica", "normal");
      const details = [
        `${dateBR(p.data_entrega)} às ${p.horario.slice(0, 5)} - ${p.tipo === "entrega" ? "Entrega" : "Retirada"} - ${statuses[p.status]}`,
        `WhatsApp: ${p.whatsapp}`,
        p.endereco ? addressText(p.endereco) : config.endereco_saida,
        p.ponto_referencia ? `Referência: ${p.ponto_referencia}` : "",
      ].filter(Boolean);
      const lines = doc.splitTextToSize(details.join("\n"), 182);
      const detailY = 56 + nameLines.length * 5;
      doc.text(lines, 14, detailY);
      let y = detailY + 2 + lines.length * 5;
      const body = p.grupos_pedido.flatMap((g, n) =>
        g.itens_pedido.map((i) => [
          `Grupo ${n + 1}`,
          i.nome_produto,
          String(i.quantidade),
          money(i.valor_linha),
        ]),
      );
      autoTable(doc, {
        ...base,
        startY: y,
        head: [["Grupo", "Salgado", "Unidades", "Valor"]],
        body,
        columnStyles: { 2: { halign: "right" }, 3: { halign: "right" } },
        foot: [
          ["", "Subtotal", "", money(p.subtotal)],
          [
            "",
            "Frete",
            "",
            p.frete_modo === "a_combinar" ? "A combinar" : money(p.frete_valor),
          ],
          [
            "",
            p.frete_modo === "a_combinar" ? "Total parcial" : "Total",
            "",
            money(p.total),
          ],
        ],
        footStyles: {
          fillColor: "#FFFFFF",
          textColor: "#222222",
          fontStyle: "bold",
        },
      });
      y =
        (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable
          .finalY + 8;
      const notes = [
        `Pagamento: ${p.forma_pagamento === "pix" ? "Pix" : "Dinheiro"} - ${p.pago ? "Pago" : "Não pago"}`,
        p.pagar_depois
          ? `Fiado: combinado para ${dateBR(p.data_prometida_pagamento)}`
          : "Pagamento na entrega/retirada",
        p.precisa_troco
          ? `Troco para ${money(p.troco_para || 0)} - devolver ${money((p.troco_para || 0) - p.total)}`
          : "Sem troco solicitado",
        p.observacoes ? `Observações: ${p.observacoes}` : "",
      ].filter(Boolean);
      const wrapped = doc.splitTextToSize(notes.join("\n"), 182);
      for (const line of wrapped) {
        if (y > 274) {
          doc.addPage();
          head();
          y = 54;
        }
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(line, 14, y);
        y += 5;
      }
    });
    if (!selected.length) {
      head();
      doc.text("Nenhum pedido selecionado.", 14, 55);
    }
  } else if (kind === "receber") {
    const rows = orders
      .filter((p) => !p.pago && p.status !== "cancelado")
      .sort((a, b) =>
        (a.data_prometida_pagamento || a.data_entrega).localeCompare(
          b.data_prometida_pagamento || b.data_entrega,
        ),
      );
    autoTable(doc, {
      ...base,
      startY: 51,
      head: [["Pedido / cliente", "WhatsApp", "Vencimento", "Valor"]],
      body: rows.map((p) => [
        `#${p.numero} ${p.nome_cliente}`,
        p.whatsapp,
        dateBR(p.data_prometida_pagamento || p.data_entrega),
        `${money(p.total)}${p.frete_modo === "a_combinar" ? " + frete" : ""}`,
      ]),
      foot: [
        [
          "Total a receber",
          "",
          "",
          money(rows.reduce((s, p) => s + p.total, 0)),
        ],
      ],
      footStyles: { fillColor: "#FFFFFF", textColor: "#222222" },
    });
  } else {
    const body = orders
      .filter((p) => p.status !== "cancelado")
      .map((p) => [
        `${dateBR(p.data_entrega)}\n${p.horario.slice(0, 5)}`,
        `#${p.numero} ${p.nome_cliente}\n${p.whatsapp}\n${p.tipo === "entrega" ? addressText(p.endereco) : "Retirada"}${p.ponto_referencia ? `\nRef.: ${p.ponto_referencia}` : ""}`,
        p.grupos_pedido
          .map(
            (g, n) =>
              `Grupo ${n + 1}: ${g.itens_pedido.map((i) => `${i.quantidade} ${i.nome_produto}`).join(", ")}`,
          )
          .join("\n"),
        `${p.forma_pagamento === "pix" ? "Pix" : "Dinheiro"}\n${p.pago ? "Pago" : "Não pago"}${p.pagar_depois ? `\nAté ${dateBR(p.data_prometida_pagamento)}` : ""}${p.precisa_troco ? `\nTroco p/ ${money(p.troco_para || 0)}\nDevolver ${money((p.troco_para || 0) - p.total)}` : ""}`,
        `Salgados ${money(p.subtotal)}\nFrete ${p.frete_modo === "a_combinar" ? "a combinar" : money(p.frete_valor)}\nTotal ${money(p.total)}`,
      ]);
    autoTable(doc, {
      ...base,
      startY: 51,
      head: [
        [
          "Data / hora",
          "Cliente / entrega",
          "Salgados",
          "Pagamento",
          "Valores",
        ],
      ],
      body,
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 40 },
        2: { cellWidth: 42 },
        3: { cellWidth: 36 },
        4: { cellWidth: 36 },
      },
    });
  }
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor("#555555");
    doc.text(`Gerado em ${created}`, 14, 287);
    doc.text(`Página ${i} de ${doc.getNumberOfPages()}`, 196, 287, {
      align: "right",
    });
  }
  return doc;
}
export async function downloadReport(
  kind: ReportKind,
  orders: Pedido[],
  config: Config,
  includePending = false,
) {
  const doc = await makeReport(kind, orders, config, includePending);
  doc.save(`rosilene-${kind}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
