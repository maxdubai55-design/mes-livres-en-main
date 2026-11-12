"""Spécifications KDP (broché noir et blanc). Longueurs en centimètres.
Source : aide KDP « Définir la taille de coupe, le fond perdu et les marges » et « Créer une couverture de livre broché ».
À revérifier sur kdp.amazon.com avant chaque dépôt : Amazon modifie parfois ces valeurs."""
POUCE = 2.54
FOND_PERDU = 0.125 * POUCE
MARGE_EXT_MIN = 0.25 * POUCE            # sans fond perdu
PAGES_MIN, PAGES_MAX = 24, 828
PAGES_MIN_TEXTE_DOS = 79
MARGE_TEXTE_DOS = 0.0625 * POUCE        # de chaque côté du texte du dos
EPAISSEUR_PAGE = {"blanc": 0.002252 * POUCE, "creme": 0.0025 * POUCE}
CODE_BARRES = (2.0 * POUCE, 1.2 * POUCE)  # largeur, hauteur
CODE_BARRES_RETRAIT = 0.25 * POUCE        # depuis le pli du dos et le bas de coupe
SECURITE_COUV = 0.25 * POUCE              # texte de couverture : retrait conseillé depuis la coupe
FORMATS = {                               # tailles de coupe courantes (largeur, hauteur)
    "12.7x20.32": (12.7, 20.32), "12.85x19.84": (12.85, 19.84), "13.34x20.32": (13.34, 20.32),
    "13.97x21.59": (13.97, 21.59), "15.24x22.86": (15.24, 22.86),
}
DESCRIPTION_MAX = 4000
MOTS_CLES_NB, MOT_CLE_MAX = 7, 50
TITRE_MAX = 200
CATEGORIES_MAX = 3
EBOOK_COUV_PX = (1600, 2560)


def marge_interieure_min(pages: int) -> float:
    for limite, pouces in ((150, 0.375), (300, 0.5), (500, 0.625), (700, 0.75), (828, 0.875)):
        if pages <= limite:
            return pouces * POUCE
    raise ValueError(f"{pages} pages : au-delà du maximum KDP ({PAGES_MAX})")


def largeur_dos(pages: int, papier: str) -> float:
    return pages * EPAISSEUR_PAGE[papier]


def dimensions_couverture(largeur: float, hauteur: float, pages: int, papier: str) -> tuple[float, float, float]:
    dos = largeur_dos(pages, papier)
    return 2 * largeur + dos + 2 * FOND_PERDU, hauteur + 2 * FOND_PERDU, dos
