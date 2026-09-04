---
name: graphify
description: Navega el grafo de llamadas entre funciones de este proyecto (quién llama a qué, dónde está definido un símbolo) usando un grafo de código pre-generado por Graphify. Útil para orientarse en app.js (archivo único de ~113KB) sin tener que leerlo entero, o para rastrear de dónde viene una función antes de tocarla.
---

# Graphify — grafo de llamadas de bola gym

Este proyecto tiene un grafo de código (funciones + relaciones "llama a")
extraído por una herramienta externa llamada Graphify, que escaneó todo el
Desktop del usuario. Este skill ya recortó ese grafo enorme (10MB, miles de
proyectos ajenos como bots de Dota o `shop-web`) a un archivo chico
(`data/bola-gym-graph.json`, ~175KB) que contiene **solo** los símbolos y
llamadas de este proyecto.

## Cuándo usar esto

- El usuario pregunta "¿qué llama a X?" o "¿qué hace la función Y?" o
  "¿dónde está definido Z?" sobre el código de este proyecto.
- Antes de modificar una función en `app.js` (que es un solo archivo de
  ~113KB, difícil de navegar a ojo) para entender su radio de impacto sin
  leer todo el archivo.
- Para ubicar rápido la línea de un símbolo en vez de grepear a mano.

No lo uses para preguntas generales de "cómo funciona la app" que se
responden mejor leyendo el código directamente — esto es específicamente
para navegar relaciones de llamadas entre funciones.

## Cómo usarlo

Corré el script de consulta con Node (no hace falta instalar nada):

```bash
node .claude/skills/graphify/query.js <comando> [argumento]
```

Comandos:

| Comando | Qué hace |
|---|---|
| `files` | Lista los archivos cubiertos por el grafo |
| `symbols <archivo>` | Lista funciones/símbolos definidos en un archivo (ej: `app.js`) |
| `search <término>` | Busca funciones por nombre parcial, sin importar mayúsculas |
| `calls <término>` | Qué funciones llama `<término>` |
| `callers <término>` | Qué funciones llaman a `<término>` |

Ejemplo real (ver qué depende de `signUpClient`):

```bash
node .claude/skills/graphify/query.js callers signupclient
```

## Limitaciones — leer antes de confiar en el resultado

- **Es una foto del 23 de agosto de 2026**, no se regenera solo. Si el
  usuario agregó o cambió funciones después de esa fecha (muy probable —
  este proyecto tuvo cambios grandes después, como toda la parte de PWA),
  esas funciones **no van a aparecer**. Si `search`/`symbols` no encuentra
  algo que sabés que existe, no asumas que no existe — puede ser simplemente
  que es más nuevo que el grafo. En ese caso, buscá con Grep normal en el
  código en vez de confiar en el grafo.
- Solo cubre relaciones **"calls" extraídas por AST** en archivos de código
  (`.js`). No indexa `styles.css`, `index.html`, ni el flujo de datos con
  Supabase (RPCs, políticas RLS) — para eso hay que leer `supabase-client.js`
  y las migraciones directamente.
- Los nombres de funciones anónimas o de flechas asignadas a propiedades de
  objeto (común en `app.js`, que usa objetos grandes tipo `ACTIONS = { foo:
  () => {...} }`) pueden no quedar bien capturados por el extractor AST —
  si una búsqueda no da resultados, no es necesariamente que no exista.

## Para regenerar el grafo con datos más nuevos

Este skill no sabe cómo volver a correr Graphify — el usuario tiene esa
herramienta aparte, por fuera de este proyecto. Si el grafo queda muy
desactualizado, hay que pedirle al usuario que corra Graphify de nuevo sobre
el Desktop (o específicamente sobre esta carpeta) y volver a generar
`data/bola-gym-graph.json` con el mismo filtro por prefijo `bola gym/` que
se usó la primera vez (ver el script que lo generó, más abajo, como
referencia si hay que rehacerlo).
