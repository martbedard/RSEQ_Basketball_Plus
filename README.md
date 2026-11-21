# RSEQ Basketball Plus

**Site du classement** — <https://martbedard.github.io/RSEQ_Basketball_Plus/>

[Exécutions GitHub Actions](https://github.com/martbedard/RSEQ_Basketball_Plus/actions/workflows/classement.yml) · [Calendrier officiel RSEQ](https://www.rseq-stats.ca/collegial/ne/basketball-m-d2/)

Classement indépendant des marqueurs du collégial masculin D2, conférence Nord-Est, section QCA-EDQ-SLSJ, saison régulière 2026-2027. La vue **Tous** affiche par défaut chaque joueur admissible. Le tri par statistique affiche le rang pour cette statistique parmi tous les joueurs admissibles. Les joueurs à égalité pour cette statistique partagent le même rang et sont affichés dans l’ordre du rang général. Les filtres conservent ces rangs et les sélections Top 10, 25 et 50 utilisent le rang général. L’export CSV reprend exactement les lignes affichées, avec un séparateur point-virgule, une virgule décimale et un BOM UTF-8 pour Excel.

## Sources et calculs

Les huit correspondances entre identifiants et noms vérifiées auprès du RSEQ figurent dans `config/teams.json`. Le client interroge `https://s1.rseq.ca/api/TeamApi/GetTeamDiffusion/?teamId=…`. Il contrôle la ligue, la saison, le sport, la catégorie, les équipes, les effectifs et les nombres de matchs. Les noms et statistiques publiés proviennent de `LeagueBasketballStats`. Seules les données utiles au classement quittent le traitement.

- **MJ d’équipe** provient de la ligne `Standings` de l’équipe et de la ligue pour `SeasonType == 1` (saison régulière). Chaque ligne individuelle doit confirmer ce total dans `TeamGames`.
- **Admissibilité** exige au moins un match joué et `2 × MJ du joueur ≥ MJ de l’équipe`. Trois matchs d’équipe exigent donc deux apparitions. Le site officiel indique ce minimum dans l’en-tête du tableau et son API peut aussi renvoyer des joueurs sous le seuil.
- **Rang** utilise la fraction exacte `TotalPoints / GamesPlayed`. À égalité viennent les points totaux décroissants, les MJ décroissants, le nom complet en ordre Unicode sans distinction de casse, puis l’identifiant. Les moyennes affichées ont une décimale. Un identifiant dupliqué bloque la publication.
- **Standard** utilise les champs numériques `FieldGoals{2,3}Made` et `FieldGoals{2,3}Attemped`. L’orthographe « Attemped » appartient à l’API. Les huit équipes utilisaient cette méthode lors de la mise en service.
- **Hudl** présente les colonnes LR, LT, LR 3 et LT 3. Les champs préfixés `FieldThrows2` correspondent à tous les tirs de champ. Les paniers ou tentatives à deux points sont obtenus en soustrayant les trois points de leur total respectif. Les contrôles vérifient les bornes, le total de points et la moyenne officielle. Le test Hudl est synthétique.
- **Valeurs manquantes**. Les tentatives et rebonds dont la valeur numérique est zéro et la cellule officielle vide sont affichés par un tiret. Le calcul d’un pourcentage exige un dénominateur connu et positif. Le total de rebonds peut provenir du champ officiel lorsque sa ventilation est indisponible. Les points et les paniers réussis sont contrôlés par l’identité `PTS = 2 × LR 2 + 3 × LR 3 + LFR`.
- Les feuilles individuelles peuvent être complétées après l’inscription du score d’une équipe. Les totaux individuels reprennent les chiffres diffusés par le RSEQ, sans répartir de points supplémentaires.

## Photos des joueurs

La fiche charge le portrait à l’ouverture. Les photos proviennent des alignements de [Sainte-Foy](https://dynamiques.csfoy.ca/equipes/basketball-m-d2/), de [Rimouski](https://www.sportsrimouski.com/sports/alignement-basketball-masculin) et de [Champlain–St. Lawrence](https://slc.qc.ca/fr/sports/basketball-m-d2/). Pour ajouter un portrait, vérifier le nom et l’équipe sur l’alignement du cégep, puis associer l’URL de l’image à l’identifiant RSEQ du joueur dans `site/portraits.mjs`.

Les portraits de Limoilou sont recadrés à partir de la photo d’équipe 2026-2027. Les numéros de maillot correspondent aux identifiants de la fiche RSEQ. Le ballon cache le numéro de Xavier Marceau (4), déduit par élimination. Le portrait du numéro 6 est conservé dans `site/portraits/limoilou/2026-27/6.jpg` en attendant son identifiant RSEQ. [Photo d’équipe du cégep](https://www.cegeplimoilou.ca/equipe/titans-basketball-masculin-d2/) · [Effectif RSEQ](https://s1.rseq.ca/api/TeamApi/GetTeamDiffusion/?teamId=dcbfbcb3-6d8f-4e6a-bb19-ad39463afef6)

## Exécuter localement

Python 3.10+ suffit à produire et servir le site. Node.js 22+ et npm servent aux tests de l’interface.

```sh
git clone https://github.com/martbedard/RSEQ_Basketball_Plus.git
cd RSEQ_Basketball_Plus
python3 scripts/sync.py
python3 -m http.server 8000 --directory site
```

Ouvrir http://localhost:8000. Le HTML, la feuille de style, le JavaScript et la police sont servis par le même site. Les chemins relatifs fonctionnent sous le répertoire de projet GitHub Pages.

```sh
python3 -m unittest discover -s tests
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Les tests navigateur utilisent le fichier produit par une extraction réelle. Ils couvrent les deux tailles d’écran, les filtres, le tri, le téléchargement CSV, la fiche joueur, le défilement horizontal, le chargement et les pannes. Les réponses simulées de panne restent isolées dans le navigateur de test.

## Actualisation et déploiement

Dans **Settings → Pages → Build and deployment → Source**, sélectionner **GitHub Actions**. Le workflow `classement.yml` publie le site après un changement de code sur la branche principale ou sur demande. GitHub prévoit aussi une extraction à la minute 17 de chaque heure. À la minute 47, le workflow `rattrapage.yml` vérifie l’horodatage publié. Si le site ne présente aucune extraction de l’heure UTC en cours et qu’aucune actualisation n’est en cours, il déclenche `classement.yml`. GitHub peut retarder ou omettre l’un ou l’autre passage.

Les publications sont sérialisées. Un onglet visible vérifie les nouvelles données toutes les cinq minutes et dès qu’on y revient. L’indicateur de fraîcheur est recalculé chaque minute.

Le job d’extraction a un accès en lecture. Celui de publication reçoit uniquement les autorisations Pages et OIDC. Après le premier déploiement réussi de chaque mois UTC, un job distinct archive ce JSON dans `archives/AAAA-MM.json`. Ce point de sauvegarde mensuel crée de l’activité dans le dépôt pendant la saison. Les extractions ordinaires utilisent uniquement les artefacts. Une politique de branche interdisant les écritures du robot peut empêcher l’archivage. [Règles de planification de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

## Diagnostic

1. Ouvrir les [exécutions planifiées](https://github.com/martbedard/RSEQ_Basketball_Plus/actions/workflows/classement.yml?query=event%3Aschedule), sélectionner une exécution, puis **build → Extraire et valider les huit équipes**. L’étape d’extraction indique chaque équipe, ses MJ et son nombre de joueurs admissibles. Les erreurs incluent le nom et l’identifiant de l’équipe.
2. Une requête expire après 20 secondes. En cas de panne réseau ou de réponse illisible, le client réessaie deux fois avec des délais croissants. Une incohérence de saison, d’association, de statistiques ou de couverture interrompt la publication. GitHub Pages conserve le dernier déploiement réussi et son horodatage d’origine.
3. La **dernière vérification auprès du RSEQ** correspond à la collecte des données affichées, en heure du Québec. L’horodatage avance après une collecte complète publiée, même si les statistiques du RSEQ sont identiques. Une page servie sans premier fichier de données signale l’attente de la première extraction. Si aucun déploiement n’a encore réussi, GitHub Pages peut renvoyer sa propre page 404.
4. Le prochain passage réessaie automatiquement. Pour un diagnostic immédiat, utiliser **Run workflow → main**. Une exécution planifiée peut être retardée ou omise par GitHub. Après 60 jours sans activité, GitHub peut désactiver la planification. Le cas échéant, sélectionner **Enable workflow**. Une panne du RSEQ ou de GitHub peut allonger le délai entre deux extractions.
