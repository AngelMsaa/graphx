# Recorridos

Un recorrido contesta **una pregunta que tiene un lector concreto**, como un camino por el mapa. Un sistema no se
entiende por una sola pregunta, así que un mapa suele llevar varios: `tours` en la raíz, cada uno con su `title`, su
`question` y sus `steps`. El lector los elige por la pregunta («Empezar recorrido» abre la lista) y cambia de uno a
otro sin salir.

Léela antes de escribir un recorrido, o cuando la persona pida «explícame cómo funciona» sobre un mapa.

## Qué recorridos hacen falta

Cuatro tipos cubren casi todo. No hacen falta los cuatro: hacen falta los que contestan preguntas que alguien hace
de verdad.

| Tipo | Pregunta | Forma del camino |
|---|---|---|
| **Estructura** | ¿qué partes hay y cómo se ordenan? | de lo grande a lo pequeño: carriles, piezas, cómo se tocan |
| **Flujo** | ¿qué pasa cuando ocurre X, de principio a fin? | un caso concreto, en el orden en que pasa, siguiendo aristas |
| **Tema transversal** | ¿cómo funciona una idea que toca a todo? | la misma regla vista desde cada sitio que la usa |
| **Cambio** | ¿dónde toco para hacer X y qué más se mueve? | dónde va lo nuevo, quién tiene que nombrarlo, qué falla si falta |

El de estructura casi siempre es el primero; los demás salen de preguntas reales. Si no sabes cuáles son, pregunta a
la persona qué le preguntan a ella sobre el sistema, o mira de dónde viene el mapa (README, onboarding, incidentes).

## Cómo es un recorrido

- **`question`**: una frase, la que el lector se hace. Es lo que ve en la lista; el título solo lo nombra.
- **4–7 pasos.** Menos es un párrafo; más, otra pregunta que merece su propio recorrido.
- **Contexto: el flujo entero, no el paso.** Al empezar, el recorrido se ve dentro de un filtro predefinido: el que
  nombre su `filter` o, si no nombra ninguno, el más pequeño de `filters` que cubre todo lo que señalan sus pasos
  (`filter: false` enseña el mapa entero). Lo que un paso no señala sigue a la vista, atenuado, para que el lector
  vea dónde encaja.
- **El último paso devuelve el mapa al lector**: qué probar ahora (un filtro, una pieza que seleccionar, otro
  recorrido).

## Cómo es un paso

- **`title`**: la conclusión, como afirmación. «El conocimiento vive una vez, en shared», no «Conocimiento
  compartido».
- **`body`**: tres frases como mucho. Qué se ve, por qué está hecho así y en qué fijarse. El porqué es lo que el
  mapa no dice solo.
- **`focus`** señala algo visible: piezas, aristas o mensajes. Si el paso necesita palabras que el mapa no puede
  enseñar, va en un documento, no en un recorrido.
- **`depth`** cuando el paso necesita otra granularidad; **`select`** cuando el panel cuenta mejor el detalle (quién
  lee, qué contiene).
- Un paso, una idea. Si el `body` dice «y además», parte el paso.

## Cómo escribir el texto de un paso

El lector mira el dibujo y lee la caja a la vez. La caja le dice **qué mirar, qué significa y por qué importa**; lo
que el dibujo ya enseña sobra.

- **Empieza por lo que se ve.** La primera frase ancla la vista: «Las cajas de la izquierda son las skills». Sin
  ancla, el lector busca mientras lee.
- **Una palabra por cosa.** Si el mapa la llama «branch», el texto también; un sinónimo parece otra pieza.
- **Define antes de usar.** La primera vez que sale un término del sistema (router, leaf, domain), dile qué es en
  media frase. Después ya no.
- **Concreto antes que general.** Un caso que ocurre («cuando pides review sobre una PR») antes que la regla
  («las skills enrutan por objetivo»).
- **Di si lo iluminado es una parte.** Si el paso enciende unas piezas entre muchas, el lector cree que son todas.
  Di que son una parte, de qué todo, y qué queda atenuado: «de todo lo que lee review, estos son los revisores».
  Antes de acercarte a una parte, enseña el todo en un paso.
- **El porqué en la última frase.** Qué problema evita o qué permite. Es lo que el lector se lleva.
- **Frases cortas, voz activa, sujeto que se ve.** «Review abre pr», no «pr es abierto en función del objetivo».
- **Nada de cifras a mano** ni de nombres que el mapa no enseña.

## Modo sencillo (ELI5)

Cada paso puede llevar `simple: {title, body}` y cada recorrido `simple: {question}`. Con eso aparece el
interruptor **ELI5** en la caja: el lector cambia entre el texto técnico y el sencillo cuando quiera. El técnico
puede ir tan hondo como haga falta; el sencillo es para quien no conoce el dominio.

- **Una analogía por paso, y que aguante.** Elige una imagen del día a día (una cocina, una biblioteca, una
  oficina de correos) y úsala en todo el recorrido: cambiar de imagen a mitad obliga a empezar de cero.
- **Explica qué es y para qué sirve antes que cómo funciona.** «Es como el recepcionista de un hotel: escucha lo
  que pides y te manda a quien sabe.»
- **Cero jerga.** Si una palabra técnica tiene que salir (porque está en el dibujo), va entre comillas y con su
  traducción: «el "router", que es quien decide adónde va cada petición».
- **Mismo foco que el técnico.** El paso señala lo mismo en los dos modos; solo cambia cómo se cuenta.
- **Todo o nada.** Si un paso lo lleva, todos los del recorrido lo llevan (`--check` avisa), o el lector cae en
  texto técnico en medio del modo fácil.
- **Prueba de lectura:** alguien de fuera del equipo lo lee en voz alta y lo entiende a la primera.

## La descripción del mapa

El `summary` de la raíz es lo primero que se lee, antes de cualquier recorrido. Tres frases, en este orden:

1. **Qué es**, con una categoría que el lector ya conoce: «angelos es un conjunto de instrucciones que le da a
   Claude formas de trabajar expertas». Nunca empieces por lo que hace sin decir qué es.
2. **Cómo lo hace**, en una idea: el mecanismo central.
3. **Qué hay en el mapa**: las partes que va a ver y cómo se relacionan, sacadas de los datos.

## Errores típicos

- **El recorrido como índice**: un paso por carril, describiendo lo que ya se ve. Cuenta por qué, o sobra.
- **Afirmar lo que el mapa no enseña**: si el paso dice «X lee Y», la arista tiene que estar en el foco. Comprueba
  cada afirmación contra el mapa antes de escribirla.
- **Una pregunta para varios lectores**: quien usa el sistema y quien lo cambia preguntan cosas distintas. Dos
  recorridos.
- **Cifras escritas a mano** («tiene diez skills») que el mapa ya sabe: sácalas de los datos al generar el spec, o
  se quedan viejas.

## Cómo trabajarlo con la persona

1. **Las preguntas primero.** Propón 3–4 preguntas con su tipo y deja que elija o cambie.
2. **El esquema antes que el texto.** Para cada recorrido, solo títulos de paso y foco. Es barato de cambiar y es
   donde se ve si el camino tiene sentido.
3. **Luego los `body`**, comprobando cada afirmación contra el mapa.
4. **`--check`** valida que cada foco existe en cada recorrido: si el sistema cambia, el recorrido roto falla al
   construir en vez de mentir.
