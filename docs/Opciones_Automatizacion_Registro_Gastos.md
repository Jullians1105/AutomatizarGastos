# 🔍 OPCIONES PARA AUTOMATIZAR REGISTRO Y CONSULTA DE GASTOS

Evaluación de alternativas a la entrada manual en Notion, para registrar gastos/ingresos "siempre que quiera" y poder consultarlos. Investigado el 2026-08-05 (precios y capacidades vigentes a esa fecha, revisar de nuevo si pasa mucho tiempo).

---

## Comparación de opciones

| Opción | Costo | Desarrollo | Registro (rapidez/fricción) | Consultas de gastos | Nota |
|---|---|---|---|---|---|
| **Apple Shortcuts → Notion API directo** | $0 | Ninguno (config ~20 min) | Muy alto — atajo en pantalla de inicio o "Oye Siri, gasté 20 mil en almuerzo" | Básicas (otro atajo que consulta y resume) | Notion cambió su API a modelo "data sources" en 2025 — hay que usar `data_source_id`, no solo `database_id`, en las llamadas |
| **Telegram Bot + Google Apps Script + Notion API** | **$0** | Medio (armar el script una vez) | Muy alto — texto libre por Telegram, sin servidor que pagar | Excelente si se agrega Gemini API (capa gratis) para responder en lenguaje natural | Apps Script lo hostea Google gratis, cuota de 20,000 llamadas HTTP/día en cuenta personal — de sobra para uso propio |
| **Notion Forms (nativo)** | $0 | Ninguno (5 min) | Alto — un toque desde acceso directo en pantalla de inicio, llenas 3 campos | No aplica (solo captura) | La forma más simple de dejar de escribir directo en la tabla; no entiende texto libre, es un formulario estructurado |
| **WhatsApp/Telegram + n8n (self-hosted) + LLM** | ~$5-7/mes (VPS) | Medio (armar el workflow una vez) | Muy alto — texto o nota de voz libre, la IA extrae monto/categoría | Excelente — mismo chat responde "¿cuánto gasté en comida este mes?" en lenguaje natural | Self-hosted n8n no tiene límite de ejecuciones, a diferencia de Make. Único costo real es el VPS |
| **WhatsApp/Telegram + Make.com (plan free)** | $0 | Bajo-medio | Alto | Limitada por 1000 ops/mes y 2 escenarios activos | Suficiente para volumen bajo (20-30 transacciones/semana entra cómodo) |
| **Backend propio (Node.js + OpenAI)** | ~$5/mes servidor + centavos por IA | Alto | Alto, muy personalizable | Excelente, control total | Opción 2 del resumen original |
| **APIs bancarias Bancolombia/Nequi** | Variable | Alto | — | — | Descartar del corto/mediano plazo: son APIs tipo Open Banking orientadas a fintechs/empresas registradas, no hay un flujo simple de "conecta tu cuenta personal" como Plaid en EE.UU. |
| **App nativa iOS** | $1,000-3,000 | Muy alto | — | — | Overkill salvo que se quiera esto como producto |

---

## Recomendación

Dos capas, no una sola herramienta:

1. **Ahora mismo (0 costo, funciona hoy):** Atajo de Apple Shortcuts que hace `POST` directo a la API de Notion, o alternativamente **Notion Forms** si se prefiere cero configuración de API. Se dispara desde el ícono en pantalla de inicio o por Siri, pide monto/descripción/tipo y listo — sin Make, sin Zapier, sin servidor.
2. **Para que funcione "siempre que quiera" con texto libre y consultas conversacionales:** WhatsApp o Telegram + **n8n self-hosted** (no Make) + LLM (Claude/OpenAI) barato para parsear el texto y clasificar categoría automáticamente. El mismo bot sirve para preguntar "¿cuánto llevo gastado en transporte?".

Esto reemplaza las Opciones 1, 3 y 4 del documento original (`Resumen_Notion_Finanzas_Dinamico.md`) por una sola vía más simple y sin coste de suscripción recurrente en SaaS de automatización.

### Opción 100% gratis, sin pagar servidor

Si el objetivo es no pagar nada (ni siquiera el VPS de n8n), la combinación **Telegram Bot + Google Apps Script + Notion API** (+ opcionalmente Gemini API en su capa gratis) logra lo mismo que la Opción 2 de arriba pero a costo $0/mes, porque Google hostea el script sin cargo. Es la opción recomendada si el presupuesto es la prioridad sobre la robustez a largo plazo.

---

## Fuentes consultadas

- [n8n Pricing 2026: Free Self-Hosted vs $24/mo Cloud](https://automationatlas.io/answers/n8n-pricing-self-hosted-vs-cloud-2026/)
- [The Real Cost of Self-Hosting n8n in 2026](https://expresstech.io/the-real-cost-of-self-hosting-n8n-in-2026/)
- [Is Make.com Actually Free? The 1,000 Operation Limit Explained](https://aiscending.com/is-make-com-free-for-small-businesses/)
- [Make.com Free Plan 2026: Limits, Use Cases](https://use-apify.com/blog/make-com-free-plan-limits)
- [Nequi - API, Developer Portal & Open Banking](https://www.openbankingtracker.com/provider/nequi-co)
- [Primeros pasos con los productos API de Open Banking – Bancolombia](https://soportedevs.bancolombia.com/hc/es-419/articles/29354511872020-Primeros-pasos-con-los-productos-API-de-Open-Banking)
- [Fill a Notion database via iOS home screen shortcuts through the Notion API](https://medium.com/madebywild/connect-apple-shortcuts-to-a-notion-database-with-the-example-of-an-exercise-tracker-3eeb30ad1304)
- [Notion API 2025-09-03 Update: Data Sources + Shortcuts](https://bizstrtga.com/blogs/sip-and-bloom/notion-api-09032025-update-data-sources-apple-shortcuts)
- [Google Apps Script Quotas & Limits: Complete 2026 Reference](https://appscriptexpert.com/blog/google-apps-script-quotas-and-limits)
- [Quotas for Google Services | Apps Script | Google for Developers](https://developers.google.com/apps-script/guides/services/quotas)
- [Telegram bot with Google Apps Script (GAS)](https://romankurnovskii.com/en/blog/howto-setup-telegram-bot-and-google-apps-script/)
- [Google Gemini API Free Tier: Limits, Billing, Setup](https://www.aifreeapi.com/en/posts/google-gemini-api-free-tier)
- [Build forms in Notion | Notion Help Center](https://www.notion.com/help/forms)

---

## Próximo paso pendiente

Decidir entre: (a) empezar por el atajo de Shortcuts, o (b) ir directo a montar el bot de WhatsApp/Telegram con n8n.
