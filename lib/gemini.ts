export class GeminiRateLimitError extends Error {
  constructor(detail: string) {
    super(`Gemini rate limit exceeded: ${detail}`);
    this.name = "GeminiRateLimitError";
  }
}

const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TIPO_ENUM = ["Gasto", "Ingreso", "Transferencia", "Transferencia Interna"];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "query", "delete", "chat"] },
    items: {
      type: "array",
      description: "Uno por cada movimiento distinto mencionado en el mensaje (add).",
      items: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: TIPO_ENUM },
          monto: { type: "number" },
          descripcion: { type: "string" },
          categoria: { type: "string" },
          cuenta: { type: "string" },
          tarjeta: { type: "string" },
          cuentaDestino: {
            type: "string",
            description: "Solo para Transferencia/Transferencia Interna: cuenta destino, la que va después de 'a' (ej. 'de Nequi a Bancolombia' -> cuenta: Nequi, cuentaDestino: Bancolombia).",
          },
          tarjetaDestino: {
            type: "string",
            description: "Igual que cuentaDestino pero cuando el destino es una tarjeta.",
          },
          fecha: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["tipo", "monto", "descripcion"],
      },
    },
    query_forma: {
      type: "string",
      enum: ["resumen", "detalle"],
      description: "resumen = totales/estadísticas. detalle = listar movimientos concretos (último, últimos N, cuál fue, qué compré, etc).",
    },
    query_limite: { type: "number", description: "Cuántos movimientos listar en modo detalle (ej. 'el último' -> 1)." },
    query_desde: { type: "string", description: "YYYY-MM-DD" },
    query_hasta: { type: "string", description: "YYYY-MM-DD" },
    query_categoria: { type: "string" },
    query_tipo: { type: "string", enum: TIPO_ENUM },
    delete_modo: {
      type: "string",
      enum: ["ultimo", "buscar"],
      description: "ultimo = borrar el/los N movimientos más recientes (inequívoco por definición). buscar = borrar por descripción/fecha.",
    },
    delete_limite: { type: "number", description: "Cuántos borrar en modo 'ultimo' (ej. 'el último' -> 1)." },
    delete_descripcion: { type: "string", description: "Texto clave a buscar en la descripción (modo 'buscar')." },
    delete_fecha: { type: "string", description: "YYYY-MM-DD, día exacto (modo 'buscar')." },
    delete_tipo: { type: "string", enum: TIPO_ENUM },
    delete_categoria: { type: "string" },
    respuesta: { type: "string" },
  },
  required: ["action"],
} as const;

export type ParsedItem = {
  tipo: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna";
  monto: number;
  descripcion: string;
  categoria?: string;
  cuenta?: string;
  tarjeta?: string;
  cuentaDestino?: string;
  tarjetaDestino?: string;
  fecha?: string;
};

export type ParsedIntent = {
  action: "add" | "query" | "delete" | "chat";
  items?: ParsedItem[];
  query_forma?: "resumen" | "detalle";
  query_limite?: number;
  query_desde?: string;
  query_hasta?: string;
  query_categoria?: string;
  query_tipo?: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna";
  delete_modo?: "ultimo" | "buscar";
  delete_limite?: number;
  delete_descripcion?: string;
  delete_fecha?: string;
  delete_tipo?: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna";
  delete_categoria?: string;
  respuesta?: string;
};

export async function parseMessage(params: {
  mensaje: string;
  hoyISO: string;
  categorias: string[];
  cuentas: string[];
  tarjetas: string[];
}): Promise<ParsedIntent> {
  const { mensaje, hoyISO, categorias, cuentas, tarjetas } = params;

  const systemPrompt = `Eres el motor de interpretación de una app de finanzas personales en español (Colombia, pesos COP).
Hoy es ${hoyISO}.

Dado el mensaje del usuario, clasifica su intención en una de cuatro acciones y responde SOLO con el JSON pedido:

- "add": el usuario quiere registrar uno o VARIOS gastos, ingresos o transferencias en el mismo mensaje (ej. "50 mil almuerzo y 20 mil el bus" son DOS movimientos). Devuelve un item en "items" por cada movimiento distinto, cada uno con:
  - monto (número, sin puntos ni comas, ej "50 mil" -> 50000)
  - descripcion: SOLO el concepto corto del movimiento (ej. "almuerzo", "pago Netflix", "gasolina"). Nunca metas ahí el monto, ni el nombre de cuenta/tarjeta/categoría aunque el usuario los mencione pegados en la misma frase — cada dato va en su propio campo, no lo dupliques ni lo mezcles en la descripción.
  - tipo: identifícalo por el SENTIDO del dinero, no por una palabra literal:
    - "Gasto": el dinero sale a pagar algo o a alguien fuera de las cuentas propias del usuario (compras, servicios, deudas a terceros).
    - "Ingreso": el dinero entra desde afuera (salario, le pagaron, le devolvieron algo).
    - "Transferencia" / "Transferencia Interna": el dinero se mueve entre dos cuentas o tarjetas PROPIAS del usuario, no gasta ni gana (ej. "pasé/moví/transferí de X a Y"). En este caso no asignes categoría.
  - fecha (YYYY-MM-DD; si no dice nada usa hoy; si dice "ayer" resta un día, etc)
  - categoria (SOLO para Gasto/Ingreso, nunca para Transferencia/Transferencia Interna): elige la de esta lista que MEJOR representa el concepto por SIGNIFICADO, no por coincidencia literal de palabras — ej. "almuerzo"/"mercado"/"restaurante" -> categoría "Comida" si existe así, "gasolina"/"Uber"/"bus" -> "Transporte", "Netflix"/"Spotify" -> "Suscripciones", aunque esas palabras no aparezcan en el nombre de la categoría. Usa el nombre EXACTO de la lista. Solo omite el campo si de verdad ninguna categoría disponible tiene relación razonable con el concepto:
    Categorías disponibles: ${categorias.join(", ") || "(ninguna registrada)"}
  - cuenta y/o tarjeta SOLO si el mensaje da una pista textual (nombre o parte de él) y hay una opción MÁS parecida por nombre en estas listas (si no hay ninguna parecida, omite el campo — a diferencia de categoria, aquí NO infieras por significado, son nombres propios):
    Cuentas disponibles: ${cuentas.join(", ") || "(ninguna registrada)"}
    Tarjetas disponibles: ${tarjetas.join(", ") || "(ninguna registrada)"}
  - Si tipo es "Transferencia" o "Transferencia Interna" y el mensaje tiene la forma "de <origen> a <destino>": la cuenta/tarjeta que sigue a "de" es el ORIGEN (va en "cuenta" o "tarjeta"), y la que sigue a "a" es el DESTINO (va en "cuentaDestino" o "tarjetaDestino"). No confundas ese "a" con otra parte del mensaje. Ejemplos: "moví 50 mil de Nequi a Bancolombia" -> cuenta: "Nequi", cuentaDestino: "Bancolombia". "pasé 100 mil de mi cuenta de ahorros a la tarjeta de crédito" -> cuenta: "ahorros", tarjetaDestino: "crédito". Si el mensaje solo menciona una cuenta/tarjeta (sin "de ... a ..."), trátala como antes: va en "cuenta"/"tarjeta" sin destino. cuentaDestino/tarjetaDestino SOLO aplican para Transferencia/Transferencia Interna — en Gasto/Ingreso déjalos vacíos y usa solo "cuenta"/"tarjeta".

- "query": el usuario pregunta por sus gastos/ingresos. Primero decide query_forma:
  - "resumen": pregunta por totales, cuánto ha gastado/ingresado, o pide top categorías (ej "¿cuánto gasté en comida este mes?", "¿cuánto llevo de ingresos en agosto?"). Si no da fechas, deja query_desde/query_hasta vacíos (se asume el mes actual completo).
  - "detalle": pide ver movimiento(s) concretos, no un total (ej "¿cuál fue mi último movimiento?", "¿qué compré el martes?", "muéstrame mis últimos gastos", "¿en qué gasté ayer?"). Pon query_limite (ej "el último" -> 1, "los últimos 5 gastos" -> 5, si no especifica cantidad y pregunta por "el último/la última" -> 1, si pregunta algo más abierto sin cantidad -> 10). Si el usuario no menciona un periodo de tiempo, NO pongas query_desde/query_hasta (deja que busque en todo el historial, no solo el mes actual).
  En ambos casos: query_categoria si menciona una categoría (elige la más parecida de la lista de categorías disponibles arriba, o omite), y query_tipo si pregunta específicamente por gastos o ingresos.

- "delete": el usuario quiere BORRAR uno o varios movimientos ya registrados (ej "borra el último gasto", "elimina lo del almuerzo de ayer", "borra los últimos 2 movimientos"). Decide delete_modo:
  - "ultimo": cuando pide borrar "el último X" o "los últimos N X" — es inequívoco por definición, no hace falta descripción. Pon delete_limite (1 si dice "el último", N si dice "los últimos N") y delete_tipo si dice gasto/ingreso/etc.
  - "buscar": cuando da una pista de descripción o fecha en vez de "el último" (ej "borra lo de la gaseosa", "elimina el gasto del martes"). Pon delete_descripcion con la palabra clave (sin fechas ni montos) y delete_fecha si menciona cuándo (YYYY-MM-DD).
  Usa delete_categoria si menciona una categoría en cualquiera de los dos modos.

- "chat": cualquier otro caso (saludo, mensaje ambiguo que falta información clave como el monto, agradecimiento, etc). Usa el campo "respuesta" para responder brevemente en español, con tono natural y directo. Si falta el monto en un intento de registro, pide que lo aclare aquí.

Responde ÚNICAMENTE con el JSON, sin texto adicional.`;

  const res = await fetch(`${GEMINI_URL}?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\nMensaje del usuario: "${mensaje}"` }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 429) {
      throw new GeminiRateLimitError(body);
    }
    throw new Error(`Gemini API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvió contenido");

  return JSON.parse(text) as ParsedIntent;
}
