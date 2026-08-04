# Identite CineVerse

Ce dossier decrit l'identite visuelle de CineVerse 1.0. Les fichiers source
utilisables dans l'application et les supports de communication se trouvent
dans [`public/brand`](../../public/brand).

## Signature

Le symbole associe un `C` ouvert et un bouton de lecture. Il peut etre utilise
seul pour les favicons, l'extension Companion et les surfaces compactes. Le
lockup complet reste la signature principale sur fond sombre.

| Asset | Usage |
| --- | --- |
| `cineverse-mark.svg` | Icone compacte et avatar produit |
| `cineverse-wordmark.svg` | Signature principale rouge et blanche |
| `cineverse-wordmark-red.svg` | Variante monochrome rouge |
| `cineverse-social-card.svg` | README, partage et presentation du projet |

## Couleurs

| Role | Valeur | Usage |
| --- | --- | --- |
| Rouge CineVerse | `#f20d19` | Marque et action principale |
| Noir cinema | `#050505` | Fond principal |
| Surface | `#151515` | Controles et panneaux |
| Blanc projection | `#f7f7f7` | Titres et pictogramme de lecture |
| Gris secondaire | `#a1a1aa` | Metadonnees et textes secondaires |

## Regles d'usage

- Conserver autour du symbole une marge au moins egale au quart de sa largeur.
- Utiliser le symbole seul en dessous de 96 px de largeur disponible.
- Ne pas recolorer le bouton de lecture en rouge sur le symbole principal.
- Ne pas etirer, incliner ou ajouter d'ombre au logo.
- Reserver le rouge plein a l'action principale et a la signature de marque.

## Signature animee

Au premier chargement d'une session, une bande rouge arrive depuis le coin
superieur droit, rejoint l'ouverture du symbole et dessine le `C`. Le symbole
Play apparait ensuite avec une impulsion, puis le mot-symbole et la promesse de
marque terminent la sequence. Cette signature dure moins de trois secondes,
peut etre passee avec `Echap` et ne se rejoue pas pendant les navigations de la
meme session.

Le mode `prefers-reduced-motion` remplace la construction par une courte
apparition statique. L'animation ne doit pas etre declenchee avant chaque film
ou chaque changement de page: elle signe l'ouverture de CineVerse, pas les
actions courantes.
