# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Fans de Pokémon (sobre todo de la 1.ª generación) que juegan una partida diaria corta, de uno o dos minutos, en el móvil o en el ordenador por igual, y comparten el resultado en un grupo de chat para retar a sus amigos.

## Product Purpose
Epidex es un juego diario de "¿Quién es ese Pokémon?": la silueta del Pokémon del día se dibuja sola con círculos que giran (epiciclos de una serie de Fourier). Empieza con 2 círculos y cada fallo o salto añade más (2 → 4 → 8 → 16 → 32 → 64), hasta 6 intentos. Al acabar se revela el arte del Pokémon y el jugador comparte su resultado sin destripar la respuesta. Éxito: reconocerlo con los menos círculos posibles y volver mañana.

## Positioning
La pista no es una imagen pixelada ni recortada: es la propia forma reconstruida por matemáticas, de borrón a silueta nítida, dibujada en directo por una cadena de círculos. Ningún otro juego del nicho enseña el mecanismo de Fourier como la pista misma.

## Operating Context
- Mismo Pokémon para todos cada día (medianoche, hora de Madrid); calendario en `web/data/`.
- Sin cuentas: racha y estadísticas en el navegador.
- Se juega con teclado en escritorio: escribir en cualquier momento, Enter para responder, Esc para borrar (comportamiento confirmado como intocable).
- Ayuda que se abre sola la primera vez; estadísticas con racha y distribución de intentos; compartir con cuadrícula de emojis.

## Capabilities and Constraints
- Motor compartido con el juego de países (`main`): contorno → Fourier → epiciclos en canvas (`web/js/render/epicycles.js`, que lee colores de variables CSS).
- Front estático: HTML + CSS + módulos JS sin framework ni build.
- Lógica, datos y funciones se mantienen; todo lo visual puede cambiar.
- Esta rama es un proyecto aparte y no se fusiona con `main`.

## Brand Commitments
- Nombre: Epidex (epiciclo + Pokédex). Evita «Poké», que es marca registrada.
- Prototipo privado: el arte y los nombres de Pokémon tienen copyright de Nintendo / Game Freak / The Pokémon Company. Aviso de proyecto de fans visible. No publicar tal cual.

## Evidence on Hand
- Arte oficial de la 1.ª generación para la revelación (`web/data/pokemon/art/`), 151 siluetas y puzzles generados.
- No hay usuarios, cifras ni testimonios: no inventarlos.

## Product Principles
- La silueta dibujándose es la protagonista; todo lo demás se aparta.
- Cada fallo debe sentirse como una recompensa (más detalle), no como un castigo.
- Compartir sin destripar.
- Rápido de jugar con teclado o con el pulgar.
