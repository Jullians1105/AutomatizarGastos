import { NextRequest, NextResponse } from "next/server";
import { parseMessage } from "@/lib/gemini";
import {
  getCategorias,
  getCuentas,
  getTarjetas,
  createTransaccion,
  queryTransacciones,
  type TransaccionRow,
} from "@/lib/notion";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function todayBogota(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function firstAndLastDayOfMonth(iso: string): [string, string] {
  const [y, m] = iso.split("-").map(Number);
  const first = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return [first, last];
}

function summarize(rows: TransaccionRow[]) {
  const gastos = rows.filter((r) => r.tipo === "Gasto");
  const ingresos = rows.filter((r) => r.tipo === "Ingreso");
  const totalGastos = gastos.reduce((s, r) => s + r.monto, 0);
  const totalIngresos = ingresos.reduce((s, r) => s + r.monto, 0);

  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    const key = g.categoria ?? "Sin categoría";
    porCategoria.set(key, (porCategoria.get(key) ?? 0) + g.monto);
  }
  const topCategorias = [...porCategoria.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return { totalGastos, totalIngresos, topCategorias, gastosCount: gastos.length, ingresosCount: ingresos.length };
}

export async function POST(req: NextRequest) {
  try {
    const { mensaje } = await req.json();
    if (typeof mensaje !== "string" || !mensaje.trim()) {
      return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
    }

    const [categorias, cuentas, tarjetas] = await Promise.all([
      getCategorias(),
      getCuentas(),
      getTarjetas(),
    ]);

    const hoy = todayBogota();
    const parsed = await parseMessage({
      mensaje,
      hoyISO: hoy,
      categorias: categorias.map((c) => c.nombre),
      cuentas: cuentas.map((c) => c.nombre),
      tarjetas: tarjetas.map((t) => t.nombre),
    });

    if (parsed.action === "add") {
      const validos = (parsed.items ?? []).filter((it) => it.monto > 0 && it.descripcion);

      if (validos.length === 0) {
        return NextResponse.json({
          message: "Me falta el monto o la descripción del movimiento. ¿Cuánto fue y en qué?",
        });
      }

      const lineas: string[] = [];
      let totalMesFaltante = false;

      for (const item of validos) {
        const result = await createTransaccion({
          descripcion: item.descripcion,
          monto: item.monto,
          tipo: item.tipo ?? "Gasto",
          fecha: item.fecha ?? hoy,
          categoriaNombre: item.categoria,
          cuentaNombre: item.cuenta,
          tarjetaNombre: item.tarjeta,
        });

        const detalles: string[] = [];
        detalles.push(`${item.tipo ?? "Gasto"} de ${COP.format(item.monto)}`);
        detalles.push(`"${item.descripcion}"`);
        if (result.categoriaMatched) detalles.push(`categoría ${result.categoriaMatched.nombre}`);
        if (result.cuentaMatched) detalles.push(`cuenta ${result.cuentaMatched.nombre}`);
        if (result.tarjetaMatched) detalles.push(`tarjeta ${result.tarjetaMatched.nombre}`);

        let linea = `• ${detalles.join(" · ")}`;
        if (item.categoria && !result.categoriaMatched) {
          linea += ` (sin categoría parecida a "${item.categoria}")`;
        }
        if (item.cuenta && !result.cuentaMatched && !item.tarjeta) {
          linea += ` (sin cuenta parecida a "${item.cuenta}")`;
        }
        if (!result.mesMatched) totalMesFaltante = true;

        lineas.push(linea);
      }

      const omitidos = (parsed.items ?? []).length - validos.length;
      const encabezado =
        validos.length === 1 ? "Listo, registré:" : `Listo, registré ${validos.length} movimientos:`;

      let message = `${encabezado}\n${lineas.join("\n")}`;
      if (omitidos > 0) {
        message += `\n(${omitidos} movimiento${omitidos > 1 ? "s" : ""} más no tenía monto o descripción claros, no lo${omitidos > 1 ? "s" : ""} registré.)`;
      }
      if (totalMesFaltante) {
        message += `\n(Alguno quedó sin enlazar al mes correspondiente en Balance Mensual — no encontré esa página.)`;
      }

      return NextResponse.json({ message });
    }

    if (parsed.action === "query") {
      let desde = parsed.query_desde;
      let hasta = parsed.query_hasta;
      if (!desde || !hasta) {
        [desde, hasta] = firstAndLastDayOfMonth(hoy);
      }

      const rows = await queryTransacciones({
        desde,
        hasta,
        tipo: parsed.query_tipo ?? null,
        categoriaNombre: parsed.query_categoria ?? null,
      });

      if (rows.length === 0) {
        return NextResponse.json({
          message: `No encontré movimientos entre ${desde} y ${hasta}${parsed.query_categoria ? ` en "${parsed.query_categoria}"` : ""}.`,
        });
      }

      const { totalGastos, totalIngresos, topCategorias, gastosCount, ingresosCount } = summarize(rows);

      const lines: string[] = [];
      if (parsed.query_categoria) {
        const total = rows.reduce((s, r) => s + r.monto, 0);
        lines.push(`En "${parsed.query_categoria}" entre ${desde} y ${hasta}: ${COP.format(total)} (${rows.length} movimientos).`);
      } else if (parsed.query_tipo === "Gasto") {
        lines.push(`Gastaste ${COP.format(totalGastos)} entre ${desde} y ${hasta} (${gastosCount} movimientos).`);
      } else if (parsed.query_tipo === "Ingreso") {
        lines.push(`Ingresaste ${COP.format(totalIngresos)} entre ${desde} y ${hasta} (${ingresosCount} movimientos).`);
      } else {
        lines.push(`Entre ${desde} y ${hasta}: gastos ${COP.format(totalGastos)} (${gastosCount}), ingresos ${COP.format(totalIngresos)} (${ingresosCount}).`);
      }

      if (topCategorias.length > 0 && !parsed.query_categoria) {
        lines.push(
          "Top categorías: " +
            topCategorias.map(([nombre, monto]) => `${nombre} ${COP.format(monto)}`).join(", ") +
            "."
        );
      }

      return NextResponse.json({ message: lines.join(" ") });
    }

    return NextResponse.json({ message: parsed.respuesta ?? "¿En qué te ayudo?" });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
