# Paquetes: mapas de cualquier dominio

Un paquete (`packs/<nombre>.json`) es el vocabulario de un dominio: qué tipos de pieza hay, qué aristas los unen y
en qué sentido, qué etiquetas son demasiado genéricas para aceptarlas y cuántas piezas caben en una vista. El
motor es el mismo para todos; lo concreto lo pone el paquete. **Escribe siempre contra un paquete**, nunca contra
las ocho categorías sueltas: sin paquete, el mapa sale vago.

| Paquete | Para | Lo que trae el motor |
|---|---|---|
| `software` (por defecto) | arquitectura, dependencias, PRs | radio de impacto por tipo de arista |
| `process` | quién hace qué y en qué orden, RACI, blueprint | un solo `accountable` por paso |
| `systems` | stocks, flujos y bucles (Meadows) | bucles R/B, retrasos, trampas, dónde intervenir |
| `business` | segmentos, propuesta, canales, socios, métricas | bucles de crecimiento y bajas vía `drives` |
| `tree` | árbol de oportunidades, OKR, mapa de impacto | cada solución llega a un resultado (`trace`) |
| `concept` | mapas conceptuales, argumentos | cada `relates` se lee como frase |

Antes de escribir, **lee el JSON del paquete**: `describe` en cada tipo dice qué cuenta como tal, `labelPattern`
en cada arista cómo se etiqueta y `from`/`to` hacia dónde apunta (`uses` va de quien usa a lo usado). Esas son las instrucciones; no las repitas en prosa ni las cambies por las tuyas.
Hay un ejemplo por paquete en `examples/<paquete>/` (y `examples/onboarding-proceso.json` para `process`).

Cuando la posición significa algo (un service blueprint, un mapa de Wardley, una matriz de interesados), usa
`axes` con su preset y da a cada pieza su `at`: `examples/axes/` tiene uno de cada tipo de eje.

Si nada del paquete encaja, usa la categoría (`actor`, `unit`, `resource`, `activity`, `artifact`, `concept`,
`event`, `state`) como `kind`, o `kind: "unmapped"` con `category`. No inventes tipos.

## De una fuente a un mapa

Cuando el mapa sale de un texto (una entrevista, un memo, un proceso escrito, un ensayo):

1. **Elige el paquete.** Mira una muestra de la fuente y propón uno con una línea de por qué; si la persona no lo
   dijo y dudas entre dos, pregunta. «auto» es una decisión tuya, no un valor: el builder no acepta
   `"pack": "auto"`.
2. **Extrae.** Cada pieza y cada arista que la fuente afirma, con su cita corta en
   `sources: [{ "quote": "…", "ref": "…" }]`; las aristas también. Sin cita, no entra. Una pieza es algo que la
   fuente trata como cosa propia: no partas una frase compuesta («bucles y retrasos») en piezas sueltas ni
   conviertas en pieza cada ejemplo de una lista («un impuesto, un termostato, una subvención») salvo que la
   fuente diga algo de cada uno. No generalices: si la fuente dice «un tipo de interés», la arista sale de ahí,
   no de «parámetro».
3. **Normaliza.** Junta los alias (el mismo actor con dos nombres), asigna a cada pieza un tipo del paquete y
   reescribe las etiquetas con las palabras de la fuente, no con las de la categoría: «HR leads at 50 to 500 person
   firms», no «Customers». `confidence` (0 a 1) donde la fuente lo deja a interpretación.
4. **Verifica.** Para cada arista: ¿la cita dice eso, sí o no? Quita las que no. Luego una sola pasada de «¿qué
   falta?» contra la fuente.
5. **Emite** el JSON dentro del presupuesto del paquete (`budget.view`, que cuenta las piezas visibles al abrir, en
   `initialDepth`): lo que sobra se pliega bajo un padre o va a un filtro con nombre, no se borra. Los equipos o
   áreas que hacen el trabajo van como `lanes` (`[{ "id", "label" }]` en la raíz y `lane` en cada pieza de primer
   nivel), no como piezas: no gastan presupuesto y dicen de quién es cada cosa. Piezas de tipo actor solo cuando
   la relación con la persona es el tema (RACI, un compañero de acogida que recibe a alguien).
   Si la fuente nombra etapas o fases («el alta administrativa», «el primer mes»), son los padres de sus pasos;
   un entregable es pieza solo si alguien lo pasa a otro o lo espera, no cada cosa que un paso deja hecha.
6. **Valida y repara.** `node graphx-build.mjs <spec>.json --check`. Cada `⚠` empieza por `nodo <id>:` o
   `arista <id>:`; arregla solo esas piezas y vuelve a correrlo hasta que no quede ninguno de los avisos del
   paquete (etiqueta genérica, tipo fuera de sitio, anidado, cardinalidad, `trace`, sin `sources`). No hagas una
   autocrítica abierta: el validador ya dice qué falla.
7. **Revisa** *(opcional)*: ¿contesta la pregunta de la persona? ¿Cada etiqueta nombra un caso que se podría
   señalar con el dedo?

Una arista puede llevar `label` aunque su tipo ya tenga nombre: el tipo da el trazo, la etiqueta lo concreto.
Con `systems` o `business`, el signo va en `polarity` (`+`, `-`; el tipo trae uno por defecto) y el retraso en
`delay`: `true` o `{ "duration": "2 months", "type": "perception" | "response" | "delivery" }` (tardar en verlo,
en decidir, en que llegue). Nombra cada bucle que el motor encuentre (`bucles: R1, B1` en la salida de `--check`)
en `groups`: `{ "id": "R1", "type": "R", "label": "referrals compound", "edges": [ids de sus aristas], "goal": … }`.
La etiqueta dice qué hace, sin el «R1» delante (el motor lo pone), y cada B lleva su `goal`. Un aviso de
oscilación o de trampa es un hallazgo, no un error: cuéntaselo a la persona. Si la fuente dice que una meta
persigue otra cosa de la que declara, ponlo en `statedPurpose` y `observedPurpose`; si nombra la creencia de
fondo, es una pieza `paradigm`; un stock que está para absorber golpes lleva `buffer: true`.

Cuando la fuente da tiempos o costes por paso, ponlos como número en un campo de cada pieza (`"hours": 4`) y
declara `aggregates: [{ "field": "hours", "label": "…", "unit": "h" }]`: el motor suma el camino crítico.
Una relación sin sentido (dos socios, dos ideas que se tocan) lleva `direction: "undirected"`; una que va en
los dos, `"mutual"`.

## Medir

`tools/eval.mjs <candidato>.json <oro>.json` compara un mapa con uno de referencia: precisión, cobertura y F1 de
piezas y aristas por etiqueta normalizada. Mira la precisión aparte: el modelo tiende a sacar de más. Los casos
están en `evals/` (fuente y mapa de referencia, uno por paquete).
