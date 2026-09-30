import { createClient } from "@supabase/supabase-js";
import { quote, geocode } from "./maps.ts";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const digest = async (text: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return reply({ error: "Método não permitido." }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 50000)
      return reply({ error: "Pedido muito grande." }, 413);
    const { action, data } = JSON.parse(raw);
    if (!data || typeof data !== "object") throw new Error("Dados inválidos.");
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
    const key = await digest(
      `${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}:${ip}`,
    );
    const limit = await service.rpc("limitar_envio", {
      p_chave: `ip:${key}`,
      p_max: 90,
    });
    if (limit.error) throw new Error("Não foi possível validar o envio.");
    if (!limit.data)
      return reply(
        {
          error:
            "Muitas tentativas. Aguarde um pouco antes de tentar novamente.",
        },
        429,
      );
    let admin = false;
    if (action === "manual" || action === "geocode-origin") {
      const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
        auth: { persistSession: false },
      });
      const user = await client.auth.getUser();
      const check = await client.rpc("sou_admin");
      if (user.error || !user.data.user || check.error || !check.data)
        return reply({ error: "Acesso restrito." }, 403);
      admin = true;
    }
    if (action === "fiado") {
      const r = await service.rpc("consultar_fiado", {
        p_whatsapp: String(data.whatsapp || ""),
      });
      if (r.error) throw new Error("Informe um WhatsApp válido.");
      return reply({ liberado: r.data });
    }
    const { data: row, error } = await service
      .from("configuracoes")
      .select("dados")
      .eq("id", true)
      .single();
    if (error) throw new Error("Configurações indisponíveis.");
    const config = row.dados;
    if (action === "geocode-origin") {
      const mapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
      if (!mapsKey)
        throw new Error(
          "A chave do Google Maps ainda não foi configurada no servidor.",
        );
      return reply(await geocode(String(data.endereco), mapsKey));
    }
    if (!["frete", "criar", "manual"].includes(action))
      throw new Error("Operação inválida.");
    if (
      data.tipo === "entrega" &&
      (!data.endereco?.rua ||
        !data.endereco?.numero ||
        !data.endereco?.bairro ||
        !data.endereco?.cidade)
    )
      throw new Error("Complete o endereço para calcular a entrega.");
    if (data.tipo !== "entrega" && data.tipo !== "retirada")
      throw new Error("Escolha retirada ou entrega.");
    const cacheKey = await digest(
      JSON.stringify([config.versao, data.tipo, data.endereco]),
    );
    let frete;
    if (config.frete_gratis || data.tipo === "retirada") {
      frete = await quote(config, data.tipo, data.endereco, undefined);
    } else {
      const cache = await service.rpc("cache_frete_ler", { p_chave: cacheKey });
      frete = cache.data;
      if (!frete) {
        frete = await quote(
          config,
          data.tipo,
          data.endereco,
          Deno.env.get("GOOGLE_MAPS_API_KEY"),
        );
        if (frete.modo === "calculado")
          await service.rpc("cache_frete_salvar", {
            p_chave: cacheKey,
            p_valor: frete,
          });
      }
    }
    if (action === "frete") return reply(frete);
    if (data.website) throw new Error("Envio não permitido.");
    if (!admin) {
      const telKey = await digest(
        String(data.whatsapp || "").replace(/\D/g, ""),
      );
      const l = await service.rpc("limitar_envio", {
        p_chave: `pedidos:${telKey}`,
        p_max: 8,
      });
      if (l.error || !l.data)
        return reply(
          { error: "Você enviou vários pedidos. Fale conosco pelo WhatsApp." },
          429,
        );
    }
    const r = await service.rpc("registrar_pedido", {
      p_dados: data,
      p_frete: frete,
      p_admin: admin,
    });
    if (r.error) {
      if (r.error.code === "23505")
        throw new Error("Há um sabor repetido no mesmo grupo.");
      if (r.error.code === "P0001") throw new Error(r.error.message);
      throw new Error("Confira os dados do pedido e tente novamente.");
    }
    return reply(r.data);
  } catch (e) {
    return reply(
      {
        error:
          e instanceof Error
            ? e.message
            : "Não foi possível concluir o pedido.",
      },
      400,
    );
  }
});
