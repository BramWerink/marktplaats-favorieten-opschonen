# Marktplaats – Verwijder verlopen favorieten

Chrome-extensie die verlopen advertenties uit je Marktplaats-favorietenlijst verwijdert met één klik.

## Installeren

1. Open `chrome://extensions` in Chrome.
2. Zet rechtsboven "Ontwikkelaarsmodus" (Developer mode) aan.
3. Klik op "Uitgepakte extensie laden" (Load unpacked).
4. Selecteer deze map (`chrome plugin`).

## Gebruik

1. Ga naar je favorietenpagina: https://www.marktplaats.nl/my-account/favorites/index.html
2. Klik op het extensie-icoon en druk op "Verwijder verlopen favorieten".
3. Wacht tot de status "Klaar" toont, met een overzicht van de verwijderde items.

## Werking (kort)

- `content.js` scrollt de favorietenpagina volledig door (infinite scroll) om alle items te laden.
- Items worden herkend als verlopen via het label `Verlopen` (badge) dat Marktplaats zelf toont.
- Per verlopen item wordt op de knop "Verwijderen uit favorieten" geklikt, en gewacht tot het item uit de lijst verdwijnt.
- Actieve favorieten worden niet aangeraakt.

Als Marktplaats de paginastructuur wijzigt en de detectie niet meer werkt, pas de tekst-matching in `EXPIRED_TERMS` of de `aria-label`-checks in `content.js` aan.
