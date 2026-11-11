"""The built-in font catalog: Google Fonts families under the OFL or Apache 2.0.

The files (latin subset, woff2, via Fontsource) are committed in font_files/ and
copied into storage by the seed command; see font_catalog.py. Every family the
editor's font pairings use is here.
"""

from dataclasses import dataclass

OFL = "OFL-1.1"
APACHE = "Apache-2.0"


@dataclass(frozen=True)
class CatalogFont:
    family: str
    category: str  # sans-serif | serif | display | handwriting | monospace
    weights: tuple[int, ...]
    italics: tuple[int, ...] = ()
    license: str = OFL

    @property
    def fontsource_id(self) -> str:
        return self.family.lower().replace(" ", "-")

    def styles(self) -> list[tuple[int, str]]:
        return [(w, "normal") for w in self.weights] + [(w, "italic") for w in self.italics]


def _f(family: str, category: str, weights: tuple[int, ...], italics: tuple[int, ...] = (),
       license: str = OFL) -> CatalogFont:
    return CatalogFont(family, category, weights, italics, license)


SANS, SERIF, DISPLAY, HAND, MONO = "sans-serif", "serif", "display", "handwriting", "monospace"

FONTS: list[CatalogFont] = [
    # sans serif
    _f("Inter", SANS, (300, 400, 500, 600, 700, 800, 900)),
    _f("Outfit", SANS, (300, 400, 500, 600, 700, 800)),
    _f("Roboto", SANS, (300, 400, 500, 700, 900), (400, 700)),
    _f("Open Sans", SANS, (300, 400, 600, 700, 800), (400, 700)),
    _f("Lato", SANS, (300, 400, 700, 900), (400, 700)),
    _f("Montserrat", SANS, (300, 400, 500, 600, 700, 800, 900), (400, 700)),
    _f("Poppins", SANS, (300, 400, 500, 600, 700, 800), (400, 700)),
    _f("Raleway", SANS, (300, 400, 500, 600, 700, 800), (400, 700)),
    _f("Nunito", SANS, (300, 400, 600, 700, 800), (400, 700)),
    _f("Work Sans", SANS, (300, 400, 500, 600, 700, 800), (400,)),
    _f("DM Sans", SANS, (400, 500, 700), (400,)),
    _f("IBM Plex Sans", SANS, (300, 400, 500, 600, 700), (400, 700)),
    _f("Source Sans 3", SANS, (300, 400, 600, 700, 900), (400, 700)),
    _f("Space Grotesk", SANS, (300, 400, 500, 600, 700)),
    _f("Archivo", SANS, (400, 500, 600, 700, 800, 900), (400,)),
    _f("Archivo Black", SANS, (400,)),
    _f("Quicksand", SANS, (300, 400, 500, 600, 700)),
    _f("Rubik", SANS, (300, 400, 500, 700, 900), (400,)),
    _f("Manrope", SANS, (300, 400, 500, 600, 700, 800)),
    _f("Karla", SANS, (300, 400, 500, 700), (400,)),
    _f("Mulish", SANS, (300, 400, 600, 700, 800), (400,)),
    _f("Barlow", SANS, (300, 400, 500, 600, 700, 800), (400,)),
    _f("Barlow Condensed", SANS, (400, 500, 600, 700, 800)),
    _f("Oswald", SANS, (300, 400, 500, 600, 700)),
    _f("Josefin Sans", SANS, (300, 400, 600, 700), (400,)),
    _f("Fira Sans", SANS, (300, 400, 500, 600, 700, 800), (400,)),
    _f("Plus Jakarta Sans", SANS, (300, 400, 500, 600, 700, 800), (400,)),
    _f("Lexend", SANS, (300, 400, 500, 600, 700, 800)),
    _f("Sora", SANS, (300, 400, 600, 700, 800)),
    _f("Urbanist", SANS, (300, 400, 500, 600, 700, 800, 900)),
    _f("Figtree", SANS, (300, 400, 500, 600, 700, 800, 900), (400,)),
    _f("Red Hat Display", SANS, (400, 500, 700, 900)),
    _f("Cabin", SANS, (400, 500, 600, 700), (400,)),
    _f("PT Sans", SANS, (400, 700), (400, 700)),
    _f("Noto Sans", SANS, (300, 400, 500, 700, 900), (400,)),
    _f("Kanit", SANS, (300, 400, 500, 600, 700, 800)),
    _f("Exo 2", SANS, (300, 400, 600, 700, 800, 900), (400,)),
    _f("Titillium Web", SANS, (300, 400, 600, 700, 900)),
    _f("League Spartan", SANS, (300, 400, 500, 600, 700, 800, 900)),
    _f("Syne", SANS, (400, 500, 600, 700, 800)),
    _f("Chivo", SANS, (300, 400, 700, 900), (400,)),
    _f("Epilogue", SANS, (300, 400, 500, 700, 800, 900)),
    _f("Anton", SANS, (400,)),
    _f("Bebas Neue", SANS, (400,)),
    # serif
    _f("Playfair Display", SERIF, (400, 500, 600, 700, 800, 900), (400, 700)),
    _f("Fraunces", SERIF, (300, 400, 600, 700, 900), (400, 700)),
    _f("Merriweather", SERIF, (300, 400, 700, 900), (400,)),
    _f("Lora", SERIF, (400, 500, 600, 700), (400, 700)),
    _f("Cormorant Garamond", SERIF, (300, 400, 500, 600, 700), (400, 600)),
    _f("EB Garamond", SERIF, (400, 500, 600, 700, 800), (400,)),
    _f("Libre Baskerville", SERIF, (400, 700), (400,)),
    _f("DM Serif Display", SERIF, (400,), (400,)),
    _f("Abril Fatface", SERIF, (400,)),
    _f("Crimson Text", SERIF, (400, 600, 700), (400,)),
    _f("PT Serif", SERIF, (400, 700), (400,)),
    _f("Source Serif 4", SERIF, (300, 400, 600, 700, 900), (400,)),
    _f("Bitter", SERIF, (300, 400, 500, 700, 900), (400,)),
    _f("Cinzel", SERIF, (400, 500, 600, 700, 800, 900)),
    _f("Prata", SERIF, (400,)),
    _f("Spectral", SERIF, (300, 400, 500, 600, 700, 800), (400,)),
    _f("Zilla Slab", SERIF, (300, 400, 500, 600, 700), (400,)),
    _f("Roboto Slab", SERIF, (300, 400, 500, 700, 900), license=APACHE),
    _f("Arvo", SERIF, (400, 700), (400,)),
    _f("Alegreya", SERIF, (400, 500, 700, 800, 900), (400,)),
    _f("Young Serif", SERIF, (400,)),
    # display
    _f("Righteous", DISPLAY, (400,)),
    _f("Lobster", DISPLAY, (400,)),
    _f("Alfa Slab One", DISPLAY, (400,)),
    _f("Bungee", DISPLAY, (400,)),
    _f("Fredoka", DISPLAY, (300, 400, 500, 600, 700)),
    _f("Shrikhand", DISPLAY, (400,)),
    _f("Monoton", DISPLAY, (400,)),
    _f("Titan One", DISPLAY, (400,)),
    _f("Staatliches", DISPLAY, (400,)),
    _f("Paytone One", DISPLAY, (400,)),
    _f("Passion One", DISPLAY, (400, 700, 900)),
    _f("Chewy", DISPLAY, (400,), license=APACHE),
    _f("Luckiest Guy", DISPLAY, (400,), license=APACHE),
    # handwriting and script
    _f("Pacifico", HAND, (400,)),
    _f("Caveat", HAND, (400, 500, 600, 700)),
    _f("Dancing Script", HAND, (400, 500, 600, 700)),
    _f("Great Vibes", HAND, (400,)),
    _f("Satisfy", HAND, (400,), license=APACHE),
    _f("Sacramento", HAND, (400,)),
    _f("Kalam", HAND, (300, 400, 700)),
    _f("Shadows Into Light", HAND, (400,)),
    _f("Amatic SC", HAND, (400, 700)),
    _f("Permanent Marker", HAND, (400,), license=APACHE),
    _f("Indie Flower", HAND, (400,)),
    _f("Patrick Hand", HAND, (400,)),
    _f("Homemade Apple", HAND, (400,), license=APACHE),
    _f("Allura", HAND, (400,)),
    _f("Parisienne", HAND, (400,)),
    _f("Yellowtail", HAND, (400,), license=APACHE),
    _f("Courgette", HAND, (400,)),
    # monospace
    _f("JetBrains Mono", MONO, (300, 400, 500, 700, 800), (400,)),
    _f("Space Mono", MONO, (400, 700), (400,)),
    _f("IBM Plex Mono", MONO, (300, 400, 500, 600, 700), (400,)),
    _f("Fira Code", MONO, (300, 400, 500, 600, 700)),
    _f("Roboto Mono", MONO, (300, 400, 500, 700), (400,)),
    _f("DM Mono", MONO, (300, 400, 500), (400,)),
]

BY_FAMILY = {f.family: f for f in FONTS}
