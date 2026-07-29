const accountApiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
let accountMetadata = new Map();
let accountMetadataLoading = null;

function accountHeaders() {
  const headers = {};
  const token = sessionStorage.getItem("pixel-token")
    || localStorage.getItem("pixel-staff-token-persistent")
    || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accountApiBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  return headers;
}

function currentStaffAccount() {
  const raw = sessionStorage.getItem("pixel-user")
    || localStorage.getItem("pixel-staff-user-persistent")
    || "null";
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function showAccountToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 2800);
}

async function loadAccountMetadata({ force = false } = {}) {
  if (accountMetadataLoading && !force) return accountMetadataLoading;
  accountMetadataLoading = (async () => {
    const response = await fetch(`${accountApiBase}/admin/accounts`, {
      method: "GET",
      headers: accountHeaders(),
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Impossible de charger les utilisateurs.");
    const accounts = Array.isArray(data.accounts)
      ? data.accounts
      : Array.isArray(data.users)
        ? data.users
        : [];
    accountMetadata = new Map(accounts.map((account) => [account.username, account]));
    return accountMetadata;
  })();
  try {
    return await accountMetadataLoading;
  } finally {
    accountMetadataLoading = null;
  }
}

async function deleteStaffAccount(account, card, button) {
  const confirmed = window.confirm(
    `Supprimer définitivement le compte « ${account.username} » ?\n\n` +
    "La personne ne pourra plus se connecter. L’historique déjà enregistré sera conservé."
  );
  if (!confirmed) return;

  const buttons = [...card.querySelectorAll("button")];
  buttons.forEach((item) => { item.disabled = true; });
  button.textContent = "Suppression…";

  try {
    const response = await fetch(`${accountApiBase}/admin/accounts/${encodeURIComponent(account.id)}`, {
      method: "DELETE",
      headers: accountHeaders()
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Impossible de supprimer ce compte.");

    accountMetadata.delete(account.username);
    card.classList.add("account-card-deleting");
    window.setTimeout(() => card.remove(), 180);
    showAccountToast(data.message || `Le compte ${account.username} a été supprimé.`);
  } catch (error) {
    buttons.forEach((item) => { item.disabled = false; });
    button.textContent = "Supprimer";
    showAccountToast(error.message);
  }
}

function decorateAccountCards() {
  const list = document.querySelector("#staffAccountsList");
  if (!list) return;
  const current = currentStaffAccount();

  list.querySelectorAll(".account-card").forEach((card) => {
    if (card.dataset.deletionReady === "true") return;
    const username = card.querySelector("strong")?.textContent?.trim() || "";
    const account = accountMetadata.get(username);
    if (!account) return;

    card.dataset.deletionReady = "true";
    card.dataset.accountId = String(account.id);

    const existingButton = [...card.children].find((child) => child.tagName === "BUTTON");
    const actions = document.createElement("div");
    actions.className = "account-card-actions";
    if (existingButton) actions.append(existingButton);

    const protectedAccount = Number(account.id) === Number(current?.id) || Boolean(account.isOwnerAdmin);
    if (!protectedAccount) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "account-delete-button";
      deleteButton.textContent = "Supprimer";
      deleteButton.addEventListener("click", () => deleteStaffAccount(account, card, deleteButton));
      actions.append(deleteButton);
    } else {
      const protectedLabel = document.createElement("small");
      protectedLabel.className = "account-protected-label";
      protectedLabel.textContent = account.isOwnerAdmin ? "Compte propriétaire protégé" : "Votre compte";
      actions.append(protectedLabel);
    }

    card.append(actions);
  });
}

async function refreshAccountDeletionControls({ force = false } = {}) {
  try {
    await loadAccountMetadata({ force });
    decorateAccountCards();
  } catch {
    // La liste principale affiche déjà l’erreur du serveur.
  }
}

function installAccountDeletionControls() {
  const help = document.querySelector("#accountForm .account-help");
  if (help) help.textContent = "Créer, activer, désactiver ou supprimer les comptes du staff.";

  const list = document.querySelector("#staffAccountsList");
  if (list) {
    const observer = new MutationObserver(() => refreshAccountDeletionControls());
    observer.observe(list, { childList: true, subtree: true });
  }

  document.querySelector("#accountsTabButton")?.addEventListener("click", () => {
    window.setTimeout(() => refreshAccountDeletionControls({ force: true }), 80);
  });

  window.setTimeout(() => refreshAccountDeletionControls(), 500);
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAccountDeletionControls, { once: true });
} else {
  installAccountDeletionControls();
}
