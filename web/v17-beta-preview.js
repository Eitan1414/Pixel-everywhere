import "./v17-beta-preview.css";

// This badge only exists on the beta packaging branch, never on main.
function installBetaNotice() {
  if (document.querySelector("#v17BetaNotice")) return;
  const brand = document.querySelector(".brand-title em");
  if (brand) brand.textContent = "BÊTA 1.7";

  const home = document.querySelector("#page-home");
  const hero = home?.querySelector(".hero");
  if (!home || !hero) return;

  const banner = document.createElement("aside");
  banner.id = "v17BetaNotice";
  banner.className = "v17-beta-notice";
  banner.setAttribute("aria-label", "Préversion Pixel Everywhere 1.7");

  const title = document.createElement("strong");
  title.textContent = "🧪 Pixel Everywhere 1.7 · Bêta 1";
  const intro = document.createElement("p");
  intro.textContent =
    "Tu consultes une préversion indépendante de l'application habituelle : navigation 1.7, messagerie 2.0, personnalité de Pixel et liaison Discord.";
  const warning = document.createElement("p");
  warning.className = "v17-beta-warning";
  warning.textContent =
    "Attention : les actions envoyées au serveur PDD restent réelles. Les fonctions Discord 1.7 nécessitent sa mise à jour et peuvent être indisponibles pendant cette bêta.";
  const meta = document.createElement("small");
  meta.textContent =
    "Préversion du 11 novembre 2026 · Sans déploiement du serveur ni fusion de la branche principale.";

  banner.append(title, intro, warning, meta);
  hero.after(banner);
  document.documentElement.dataset.pixelBetaPreview = "1.7.0-beta.1";
}

installBetaNotice();
