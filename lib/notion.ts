const NOTION_VERSION = "2025-09-03";
const NOTION_API = "https://api.notion.com/v1";

const DS = {
  transacciones: process.env.NOTION_TRANSACCIONES_DS_ID!,
  cuentas: process.env.NOTION_CUENTAS_DS_ID!,
  tarjetas: process.env.NOTION_TARJETAS_DS_ID!,
  balanceMensual: process.env.NOTION_BALANCE_MENSUAL_DS_ID!,
  categorias: process.env.NOTION_CATEGORIAS_DS_ID!,
};

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

async function notionFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${NOTION_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Notion API ${res.status}: ${body}`);
  }
  return res.json();
}

export type NamedOption = { id: string; nombre: string };

function titleText(prop: any): string {
  const arr = prop?.title ?? [];
  return arr.map((t: any) => t.plain_text).join("").trim();
}

async function queryAll(dataSourceId: string, body: Record<string, unknown> = {}) {
  const results: any[] = [];
  let cursor: string | undefined;
  do {
    const page = await notionFetch(`/data_sources/${dataSourceId}/query`, {
      method: "POST",
      body: JSON.stringify({ ...body, start_cursor: cursor }),
    });
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

let cache: {
  categorias?: NamedOption[];
  cuentas?: NamedOption[];
  tarjetas?: NamedOption[];
  meses?: NamedOption[];
  fetchedAt?: number;
} = {};

const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getCategorias(): Promise<NamedOption[]> {
  if (cache.categorias && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.categorias;
  }
  const results = await queryAll(DS.categorias);
  cache.categorias = results.map((r) => ({
    id: r.id,
    nombre: titleText(r.properties["Nombre Categoría"]),
  }));
  cache.fetchedAt = Date.now();
  return cache.categorias;
}

export async function getCuentas(): Promise<NamedOption[]> {
  if (cache.cuentas && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.cuentas;
  }
  const results = await queryAll(DS.cuentas, {
    filter: { property: "Archivado", checkbox: { equals: false } },
  });
  cache.cuentas = results.map((r) => ({
    id: r.id,
    nombre: titleText(r.properties["Nombre Cuenta"]),
  }));
  return cache.cuentas;
}

export async function getTarjetas(): Promise<NamedOption[]> {
  if (cache.tarjetas && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.tarjetas;
  }
  const results = await queryAll(DS.tarjetas, {
    filter: { property: "Estado Tarjeta", select: { equals: "Activa" } },
  });
  cache.tarjetas = results.map((r) => ({
    id: r.id,
    nombre: titleText(r.properties["Nombre Tarjeta"]),
  }));
  return cache.tarjetas;
}

export async function getMeses(): Promise<NamedOption[]> {
  if (cache.meses && cache.fetchedAt && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.meses;
  }
  const results = await queryAll(DS.balanceMensual);
  cache.meses = results.map((r) => ({
    id: r.id,
    nombre: titleText(r.properties["Nombre"]),
  }));
  return cache.meses;
}

export async function findMesPage(fechaISO: string): Promise<string | null> {
  const d = new Date(fechaISO);
  const nombreMes = `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const meses = await getMeses();
  const target = norm(nombreMes);
  return meses.find((m) => norm(m.nombre) === target)?.id ?? null;
}

function matchByName(options: NamedOption[], name?: string | null): NamedOption | null {
  if (!name) return null;
  const target = norm(name);
  return (
    options.find((o) => norm(o.nombre) === target) ??
    options.find((o) => norm(o.nombre).includes(target) || target.includes(norm(o.nombre))) ??
    null
  );
}

export type CreateTransaccionInput = {
  descripcion: string;
  monto: number;
  tipo: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna";
  fecha: string; // YYYY-MM-DD
  categoriaNombre?: string | null;
  cuentaNombre?: string | null;
  tarjetaNombre?: string | null;
  cuentaDestinoNombre?: string | null;
  tarjetaDestinoNombre?: string | null;
};

export type CreateTransaccionResult = {
  categoriaMatched: NamedOption | null;
  cuentaMatched: NamedOption | null;
  tarjetaMatched: NamedOption | null;
  cuentaDestinoMatched: NamedOption | null;
  tarjetaDestinoMatched: NamedOption | null;
  mesMatched: boolean;
};

export async function createTransaccion(
  input: CreateTransaccionInput
): Promise<CreateTransaccionResult> {
  const [categorias, cuentas, tarjetas, mesId] = await Promise.all([
    getCategorias(),
    getCuentas(),
    getTarjetas(),
    findMesPage(input.fecha),
  ]);

  const categoria = matchByName(categorias, input.categoriaNombre);
  const cuenta = matchByName(cuentas, input.cuentaNombre);
  const tarjeta = matchByName(tarjetas, input.tarjetaNombre);
  const cuentaDestino = matchByName(cuentas, input.cuentaDestinoNombre);
  const tarjetaDestino = matchByName(tarjetas, input.tarjetaDestinoNombre);

  const properties: Record<string, unknown> = {
    Descripción: { title: [{ text: { content: input.descripcion } }] },
    Monto: { number: input.monto },
    Tipo: { select: { name: input.tipo } },
    Fecha: { date: { start: input.fecha } },
  };
  if (categoria) properties["Categorías"] = { relation: [{ id: categoria.id }] };
  if (cuenta) properties["Cuenta"] = { relation: [{ id: cuenta.id }] };
  if (tarjeta) properties["Tarjeta"] = { relation: [{ id: tarjeta.id }] };
  if (cuentaDestino) properties["Cuenta Destino"] = { relation: [{ id: cuentaDestino.id }] };
  if (tarjetaDestino) properties["Tarjeta Destino"] = { relation: [{ id: tarjetaDestino.id }] };
  if (mesId) properties["Mes"] = { relation: [{ id: mesId }] };

  await notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: DS.transacciones },
      icon: { type: "icon", icon: { name: "transfers", color: "gray" } },
      properties,
    }),
  });

  return {
    categoriaMatched: categoria,
    cuentaMatched: cuenta,
    tarjetaMatched: tarjeta,
    cuentaDestinoMatched: cuentaDestino,
    tarjetaDestinoMatched: tarjetaDestino,
    mesMatched: Boolean(mesId),
  };
}

export type QueryTransaccionesInput = {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  tipo?: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna" | null;
  categoriaNombre?: string | null;
};

export type TransaccionRow = {
  id: string;
  descripcion: string;
  monto: number;
  tipo: string;
  fecha: string;
  categoria: string | null;
  cuenta: string | null;
};

function rowsFromNotionResults(
  results: any[],
  categoriaById: Map<string, string>,
  cuentaById: Map<string, string>
): TransaccionRow[] {
  return results.map((r) => {
    const p = r.properties;
    const catRelation = p["Categorías"]?.relation ?? [];
    const cuentaRelation = p["Cuenta"]?.relation ?? [];
    return {
      id: r.id,
      descripcion: titleText(p["Descripción"]),
      monto: p["Monto"]?.number ?? 0,
      tipo: p["Tipo"]?.select?.name ?? "",
      fecha: p["Fecha"]?.date?.start ?? "",
      categoria: catRelation[0] ? categoriaById.get(catRelation[0].id) ?? null : null,
      cuenta: cuentaRelation[0] ? cuentaById.get(cuentaRelation[0].id) ?? null : null,
    };
  });
}

export async function archivarTransaccion(pageId: string): Promise<void> {
  await notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ archived: true }),
  });
}

export async function queryTransacciones(
  input: QueryTransaccionesInput
): Promise<TransaccionRow[]> {
  const [categorias, cuentas] = await Promise.all([getCategorias(), getCuentas()]);
  const categoria = matchByName(categorias, input.categoriaNombre);

  const andFilters: any[] = [
    { property: "Fecha", date: { on_or_after: input.desde } },
    { property: "Fecha", date: { on_or_before: input.hasta } },
  ];
  if (input.tipo) andFilters.push({ property: "Tipo", select: { equals: input.tipo } });
  if (categoria) andFilters.push({ property: "Categorías", relation: { contains: categoria.id } });

  const results = await queryAll(DS.transacciones, { filter: { and: andFilters } });
  const categoriaById = new Map(categorias.map((c) => [c.id, c.nombre]));
  const cuentaById = new Map(cuentas.map((c) => [c.id, c.nombre]));

  return rowsFromNotionResults(results, categoriaById, cuentaById);
}

export type MovimientosRecientesInput = {
  limite: number;
  desde?: string | null; // YYYY-MM-DD
  hasta?: string | null; // YYYY-MM-DD
  fechaExacta?: string | null; // YYYY-MM-DD
  descripcionContiene?: string | null;
  tipo?: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna" | null;
  categoriaNombre?: string | null;
};

export async function getMovimientosRecientes(
  input: MovimientosRecientesInput
): Promise<TransaccionRow[]> {
  const [categorias, cuentas] = await Promise.all([getCategorias(), getCuentas()]);
  const categoria = matchByName(categorias, input.categoriaNombre);

  const andFilters: any[] = [];
  if (input.desde) andFilters.push({ property: "Fecha", date: { on_or_after: input.desde } });
  if (input.hasta) andFilters.push({ property: "Fecha", date: { on_or_before: input.hasta } });
  if (input.fechaExacta) andFilters.push({ property: "Fecha", date: { equals: input.fechaExacta } });
  if (input.descripcionContiene)
    andFilters.push({ property: "Descripción", title: { contains: input.descripcionContiene } });
  if (input.tipo) andFilters.push({ property: "Tipo", select: { equals: input.tipo } });
  if (categoria) andFilters.push({ property: "Categorías", relation: { contains: categoria.id } });

  const body: Record<string, unknown> = {
    page_size: Math.min(Math.max(input.limite, 1), 50),
    sorts: [{ property: "Fecha", direction: "descending" }],
  };
  if (andFilters.length > 0) body.filter = { and: andFilters };

  const page = await notionFetch(`/data_sources/${DS.transacciones}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });

  const categoriaById = new Map(categorias.map((c) => [c.id, c.nombre]));
  const cuentaById = new Map(cuentas.map((c) => [c.id, c.nombre]));

  return rowsFromNotionResults(page.results, categoriaById, cuentaById);
}
