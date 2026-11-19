# PokéFourier (nombre provisional)

**¿Quién es ese Pokémon?** La silueta del Pokémon del día se dibuja sola con
epiciclos (círculos que giran, una serie de Fourier). Empieza con 2 círculos y
cada fallo o salto añade más: 2 → 4 → 8 → 16 → 32 → 64. Al acabar se revela el
Pokémon y puedes retar a un amigo con tu resultado.

Es una variante de [fourier-game](../fourier-game) (países y banderas) con otra
personalidad: una Pokédex roja con pantalla LCD verde.

> ⚠️ **Prototipo para probar la idea.** El arte y los nombres de Pokémon tienen
> copyright de Nintendo / Game Freak / The Pokémon Company. Antes de publicarlo
> habría que sustituirlos (p. ej. criaturas propias o imágenes con licencia libre).

## Puesta en marcha

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m pipeline.download   # 151 imágenes (≈22 MB) a data/raw/pokemon/
python -m pipeline.build      # contornos -> Fourier -> web/data/
python -m pipeline.art        # arte de la revelación (web/data/pokemon/art/)
python -m http.server 8005 --directory web
```

- Juego: <http://localhost:8005/> (el calendario empieza el 19/11/2026; otro día: `?fecha=2026-11-25`)
- Vista previa de todas las siluetas por nivel: `python -m pipeline.preview --collection pokemon --levels`
- Tests: `pytest` (Python) y <http://localhost:8005/dev/tests.html> (JavaScript)

## De imagen a contorno

[`pipeline/sources/image.py`](pipeline/sources/image.py) convierte cada PNG en un
contorno ordenado, que es lo que necesita la DFT:

1. Máscara figura/fondo con la transparencia (o umbral de Otsu si no hay).
2. Cierre morfológico para unir grietas pequeñas.
3. Componente conexa más grande y relleno de agujeros.
4. Trazado del borde exterior con el algoritmo de vecinos de Moore.

Una convolución (Sobel, etc.) no basta: da píxeles de borde *sin orden*.

El resto (remuestreo, DFT, niveles, calendario, frontend) es el mismo motor que
fourier-game. Diferencias del frontend: estilos propios (`web/css/`), revelación
del arte al acabar (`ui.art` en la colección) y nombre en `web/js/app/config.js`.

## Ideas

- Pistas por intento (tipo, generación) como en otros juegos del nicho.
- Más generaciones (cambiar `last` en `[images]` de `config.toml`).
- Modo "sombra clásica": rellenar la silueta en negro con un fondo de rayos.
