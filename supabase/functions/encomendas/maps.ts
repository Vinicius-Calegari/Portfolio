type Address = {
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep?: string;
  complemento?: string;
};
type Config = {
  frete_gratis: boolean;
  endereco_saida: string;
  saida_lat: number | null;
  saida_lng: number | null;
  frete_tipo: string;
  faixas: { ate: number; valor: number }[];
  frete_base: number;
  frete_por_km: number;
  frete_minimo: number;
  distancia_max: number;
  versao: number;
};
export const addressText = (a: Address) =>
  `${a.rua}, ${a.numero}, ${a.bairro}, ${a.cidade}, ${a.uf}, ${a.cep || ""}, Brasil`;
export async function geocode(address: string, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", key);
  url.searchParams.set("region", "br");
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("Mapa indisponível");
  const data = await response.json();
  if (
    data.status !== "OK" ||
    !data.results?.[0] ||
    data.results[0].partial_match
  )
    throw new Error("Endereço não localizado com precisão");
  return data.results[0].geometry.location as { lat: number; lng: number };
}
export async function drivingKm(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  key: string,
) {
  const point = (p: { lat: number; lng: number }) => ({
    location: { latLng: { latitude: p.lat, longitude: p.lng } },
  });
  const response = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: point(origin),
        destination: point(destination),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        computeAlternativeRoutes: false,
        languageCode: "pt-BR",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(8000),
    },
  );
  const data = await response.json();
  if (!response.ok || !Number.isFinite(data.routes?.[0]?.distanceMeters))
    throw new Error("Rota não localizada");
  return data.routes[0].distanceMeters / 1000;
}
export async function quote(
  c: Config,
  tipo: string,
  a: Address,
  key: string | undefined,
) {
  if (tipo === "retirada" || c.frete_gratis)
    return { valor: 0, km: null, modo: "nenhum", config_versao: c.versao };
  if (!key || c.saida_lat === null || c.saida_lng === null)
    return { valor: 0, km: null, modo: "a_combinar", config_versao: c.versao };
  let km: number;
  try {
    const to = await geocode(addressText(a), key);
    km = await drivingKm({ lat: c.saida_lat, lng: c.saida_lng }, to, key);
  } catch {
    return { valor: 0, km: null, modo: "a_combinar", config_versao: c.versao };
  }
  if (km > c.distancia_max)
    throw new Error(
      "Esse endereço fica fora da nossa área de entrega. Fale conosco pelo WhatsApp.",
    );
  const amount =
    c.frete_tipo === "faixas"
      ? c.faixas.find((f) => km <= f.ate)?.valor
      : c.frete_base + Math.round(km * c.frete_por_km);
  if (amount === undefined)
    return { valor: 0, km, modo: "a_combinar", config_versao: c.versao };
  return {
    valor: Math.max(c.frete_minimo, amount),
    km: Math.round(km * 100) / 100,
    modo: "calculado",
    config_versao: c.versao,
  };
}
