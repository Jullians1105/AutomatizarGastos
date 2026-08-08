const GEMINI_MODEL = "gemini-flash-latest";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const TIPO_ENUM = ["Gasto", "Ingreso", "Transferencia", "Transferencia Interna"];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["add", "query", "chat"] },
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
          fecha: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["tipo", "monto", "descripcion"],
      },
    },
    query_desde: { type: "string", description: "YYYY-MM-DD" },
    query_hasta: { type: "string", description: "YYYY-MM-DD" },
    query_categoria: { type: "string" },
    query_tipo: { type: "string", enum: TIPO_ENUM },
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
  fecha?: string;
};

export type ParsedIntent = {
  action: "add" | "query" | "chat";
  items?: ParsedItem[];
  query_desde?: string;
  query_hasta?: string;
  query_categoria?: string;
  query_tipo?: "Gasto" | "Ingreso" | "Transferencia" | "Transferencia Interna";
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

Dado el mensaje del usuario, clasifica su intención en una de tres acciones y responde SOLO con el JSON pedido:

- "add": el usuario quiere registrar uno o VARIOS gastos, ingresos o transferencias en el mismo mensaje (ej. "50 mil almuerzo y 20 mil el bus" son DOS movimientos). Devuelve un item en "items" por cada movimiento distinto, cada uno con:
  - monto (número, sin puntos ni comas, ej "50 mil" -> 50000)
  - descripcion breve
  - tipo
  - fecha (YYYY-MM-DD; si no dice nada usa hoy; si dice "ayer" resta un día, etc)
  - categoria, cuenta y/o tarjeta SOLO si el mensaje da una pista y hay una opción MÁS parecida en estas listas (si no hay ninguna parecida, omite el campo):
    Categorías disponibles: ${categorias.join(", ") || "(ninguna registrada)"}
    Cuentas disponibles: ${cuentas.join(", ") || "(ninguna registrada)"}
    Tarjetas disponibles: ${tarjetas.join(", ") || "(ninguna registrada)"}

- "query": el usuario pregunta por sus gastos/ingresos (ej "¿cuánto gasté en comida este mes?", "¿cuánto llevo de ingresos en agosto?"). Extrae query_desde y query_hasta (YYYY-MM-DD, infiere el rango de fechas según lo que pregunte; si no especifica, usa el mes calendario actual completo), query_categoria si menciona una categoría (elige la más parecida de la lista de categorías disponibles arriba, o omite), y query_tipo si pregunta específicamente por gastos o ingresos.

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
    throw new Error(`Gemini API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini no devolvió contenido");

  return JSON.parse(text) as ParsedIntent;
}
