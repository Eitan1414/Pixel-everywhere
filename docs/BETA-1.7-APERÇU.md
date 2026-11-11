# Pixel Everywhere 1.7 — Bêta 1 de consultation

**Statut : préversion de test, non publiée et non fusionnée.** Cette branche est une photographie indépendante de `feature/v1.7-ui-foundation` (source : `a938178a6340c2899fa2d2d79c1ff00776c75359`). Toutes les fonctionnalités de l'interface 1.7 y sont reprises, sans déploiement ni migration du serveur Termux.

## Versions

- **Android :** `com.pdd.pixeleverywhere.beta` / `Pixel Everywhere Bêta`, version `1.7.0-beta.1`. Installe une seconde application sur ton téléphone/tablette, sans écraser le package `com.pdd.pixeleverywhere` habituel. La bêta possède son propre stockage local.
- **Windows :** `com.pdd.pixeleverywhere.beta` / `Pixel Everywhere Bêta`, version `1.7.0-beta.1`. Application séparée de l'installation ordinaire. Les workflows GitHub créent une version portable et un installateur.
- **Web :** le workflow Android fournit également un ZIP `Pixel-Web-Bundle-Debug`. Il contient un bundle Vite compilé mais **ce n'est pas un site hébergé** : il doit être servi par un serveur local ou un hébergeur compatible, pas ouvert directement par un simple `file://`.

## À consulter

1. Accueil et navigation modernisés : `Accueil / Autres menus / Compte`.
2. Panel staff réorganisé (compte staff requis).
3. Liaison d'un membre avec Discord PDD (nouveaux endpoints v1.7).
4. Discord Activity Center, dont le Gateway est **désactivé par défaut** côté serveur.
5. Centre de notifications et boîte Messagerie 2.0 (`Privés`, `Staff`, `Notifications`).
6. Conversations épinglées et filtres `Toutes / Non lues / Récentes / Épinglées`.
7. Personnalité de Pixel 2.0 (humeurs, habitudes, phrases réactives), sans nouveaux dessins ni animations complexes.

## Fonctionnalités limitées pendant cette consultation

- **Aucun serveur 1.7 n'a été déployé sur Termux.** La liaison Discord, les nouveaux endpoints de notification et le journal d'activité dépendront d'une mise à jour serveur ultérieure. Ils peuvent afficher une erreur ou l'état « non configuré ».
- Les fonctions historiques (MP, publications, pièces, staff) peuvent accéder au serveur PDD **actuel** si tu y connectes la bêta. Les actions envoyées sont alors **réelles** et pas simulées. Évite les opérations administrateur destructives pendant les essais.
- Les épingles de conversations et la progression de Pixel restent **locales à l'appareil**. Android bêta et Android habituel ne partagent pas leur stockage ; Windows bêta et Windows habituel non plus.
- Aucune notification Android push lorsque l'application est fermée.
- Les graphismes supplémentaires du Tamagotchi Pixel sont reportés.
- Les fichiers Windows ne sont pas signés par un certificat de distribution officiel ; les protections Windows peuvent afficher un avertissement.

## Consulter les fichiers de bêta

Ouvre la PR de bêta sur GitHub, va dans **Checks**, puis dans le workflow :
- `Compiler Pixel Everywhere` → section **Artifacts** → `Pixel-Everywhere-APK` pour Android.
- `Compiler Pixel Everywhere Windows` → section **Artifacts** → `Pixel-Everywhere-Windows-x64-PORTABLE` (ou `INSTALLER`) pour Windows.
- `Vérifier Pixel Everywhere Desktop` pour les résultats des tests.

GitHub fournit les artefacts sous forme de ZIP et peut demander de se connecter pour les télécharger. Sur Android, décompresse le ZIP et ouvre le fichier `app-debug.apk`. Sur Windows, décompresse le ZIP portable puis lance l'exécutable qu'il contient. **N'installe pas une build provenant d'un commit antérieur à cette branche bêta**, car l'identifiant d'application pourrait ne pas être isolé.

## Remontée de bugs

Note l'appareil et sa version d'OS, la fonction testée, les étapes permettant de reproduire le problème et le résultat observé. Évite les captures contenant des jetons d'authentification, des liens de gestion privés ou des messages personnels. Ajoute des observations dans la PR de bêta.

## Sortie de bêta

Cette branche est destinée à la consultation. **Ne pas fusionner telle quelle dans `main`**, car elle remplace volontairement les identifiants d'application par des identifiants « bêta ». Les fonctionnalités réelles continuent d'être développées dans la PR #60.
