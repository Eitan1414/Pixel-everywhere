const apiBase = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

const state = {
  token: sessionStorage.getItem("pixel-token") || "",
  user: JSON.parse(sessionStorage.getItem("pixel-user") || "null"),
  memberToken: localStorage.getItem("pixel-member-token") || "",
  member: JSON.parse(localStorage.getItem("pixel-member") || "null"),
  applications: [],
  activeApplication: null,
  pet: JSON.parse(localStorage.getItem("pixel-pet") || "null")
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function element(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(options).forEach(([key, value]) => {
    if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  });
  children.filter(Boolean).forEach((child) => node.append(child));
  return node;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(`${date}${date.endsWith("Z") || date.includes("+") ? "" : "Z"}`));
}

function setFormStatus(node, message, type = "") {
  node.textContent = message;
  node.className = `form-status ${type}`.trim();
}

let toastTimer;
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
}

async function api(path, options = {}) {
  const { auth = "staff", ...fetchOptions } = options;
  const headers = { ...(options.headers || {}) };
  if (apiBase.includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const token = auth === "member" ? state.memberToken : auth === "none" ? "" : state.token;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${apiBase}${path}`, { ...fetchOptions, headers });
  } catch {
    throw new Error(
      "Serveur Pixel Everywhere inaccessible. Vérifie que Termux est ouvert et que npm start fonctionne."
    );
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Une erreur est survenue.");
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

function saveSession(token, user) {
  state.token = token;
  state.user = user;
  sessionStorage.setItem("pixel-token", token);
  sessionStorage.setItem("pixel-user", JSON.stringify(user));
  updateAccountButton();
}

function clearSession() {
  state.token = "";
  state.user = null;
  state.applications = [];
  sessionStorage.removeItem("pixel-token");
  sessionStorage.removeItem("pixel-user");
  updateAccountButton();
}

function saveMemberSession(token, member) {
  state.memberToken = token;
  state.member = member;
  localStorage.setItem("pixel-member-token", token);
  localStorage.setItem("pixel-member", JSON.stringify(member));
  updateAccountButton();
  updateAccountDialog();
}

function clearMemberSession() {
  state.memberToken = "";
  state.member = null;
  localStorage.removeItem("pixel-member-token");
  localStorage.removeItem("pixel-member");
  updateAccountButton();
  updateAccountDialog();
}

function updateAccountButton() {
  const button = $("#accountButton");
  button.innerHTML = "";
  const label = state.user?.username || state.member?.displayName || "Compte";
  button.append(
    element("span", { text: state.user || state.member ? "●" : "○", "aria-hidden": "true" }),
    document.createTextNode(label)
  );
}

function navigate(page) {
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  $$(".bottom-nav button").forEach((button) =>
    button.classList.toggle("active", button.dataset.pageTarget === page)
  );
  window.scrollTo({ top: 0, behavior: "smooth" });

  if (page === "announcements") loadAnnouncements();
  if (page === "pixel") renderPet();
  if (page === "staff") openStaffWorkspace();
}

$$("[data-page-target]").forEach((button) => {
  button.addEventListener("click", () => navigate(button.dataset.pageTarget));
});

async function loadAnnouncements() {
  const list = $("#announcementsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement des annonces…" }));

  try {
    const data = await api("/announcements");
    if (!data.configured) {
      list.replaceChildren(
        element("div", {
          className: "empty-state",
          text: "Le bot Discord n’est pas encore connecté au salon d’annonces."
        })
      );
      return;
    }
    if (!data.announcements.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Aucune annonce pour le moment." })
      );
      return;
    }
    list.replaceChildren(...data.announcements.map(renderAnnouncement));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderAnnouncement(announcement) {
  const fallbackAvatar = element("div", { className: "mini-avatar" });
  const avatar = announcement.author.avatarUrl
    ? element("img", { src: announcement.author.avatarUrl, alt: "" })
    : fallbackAvatar;
  const author = element("div", { className: "announcement-author" }, [
    avatar,
    element("strong", { text: announcement.author.username })
  ]);
  const head = element("div", { className: "announcement-head" }, [
    author,
    element("time", { text: formatDate(announcement.createdAt) })
  ]);
  const card = element("article", { className: "announcement-card" }, [head]);
  if (announcement.content) {
    card.append(element("p", { className: "announcement-content", text: announcement.content }));
  }
  announcement.embeds.forEach((embed) => {
    const body = [embed.title, embed.description].filter(Boolean).join("\n");
    if (body) card.append(element("p", { className: "announcement-content", text: body }));
  });
  announcement.attachments
    .filter((attachment) => attachment.contentType.startsWith("image/"))
    .forEach((attachment) => {
      card.append(
        element("img", {
          className: "announcement-image",
          src: attachment.url,
          alt: attachment.filename,
          loading: "lazy"
        })
      );
    });
  return card;
}

$("#refreshAnnouncements").addEventListener("click", loadAnnouncements);

$("#applicationForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const status = $("#applicationStatus");
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Envoi en cours…");
  try {
    const result = await api("/applications", {
      method: "POST",
      body: JSON.stringify(values)
    });
    form.reset();
    setFormStatus(status, result.message, "success");
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

const loginDialog = $("#loginDialog");
$("#accountButton").addEventListener("click", () => {
  updateAccountDialog();
  loginDialog.showModal();
});
$("#closeLogin").addEventListener("click", () => loginDialog.close());

function selectAccountTab(tab) {
  $$("[data-account-tab]").forEach((button) =>
    button.classList.toggle("active", button.dataset.accountTab === tab)
  );
  $$(".account-panel").forEach((panel) =>
    panel.classList.toggle("active", panel.id === `account-${tab}`)
  );
}

$$("[data-account-tab]").forEach((button) => {
  button.addEventListener("click", () => selectAccountTab(button.dataset.accountTab));
});

function updateAccountDialog() {
  $("#memberSignedIn").classList.toggle("hidden", !state.member);
  $("#memberGuest").classList.toggle("hidden", Boolean(state.member));
  $("#memberIdentity").textContent = state.member
    ? `${state.member.displayName} (@${state.member.username})`
    : "";
  $("#staffSignedIn").classList.toggle("hidden", !state.user);
  $("#loginForm").classList.toggle("hidden", Boolean(state.user));
  $("#staffDialogIdentity").textContent = state.user
    ? `${state.user.username} • ${state.user.role === "admin" ? "Administrateur" : "Modérateur"}`
    : "";
}

$$("[data-member-mode]").forEach((button) => {
  button.addEventListener("click", () => {
    const mode = button.dataset.memberMode;
    $$("[data-member-mode]").forEach((item) => item.classList.toggle("active", item === button));
    $("#memberLoginForm").classList.toggle("active", mode === "login");
    $("#memberRegisterForm").classList.toggle("active", mode === "register");
  });
});

async function submitMemberForm(event, path, successMessage) {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Connexion…");
  try {
    const result = await api(path, {
      method: "POST",
      auth: "none",
      body: JSON.stringify(values)
    });
    if (!result.token || !result.member) {
      throw new Error("Le serveur n’a pas renvoyé une session membre valide.");
    }
    saveMemberSession(result.token, result.member);
    form.reset();
    setFormStatus(status, "");
    toast(successMessage);
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
}

$("#memberLoginForm").addEventListener("submit", (event) =>
  submitMemberForm(event, "/members/login", "Connexion membre réussie.")
);
$("#memberRegisterForm").addEventListener("submit", (event) =>
  submitMemberForm(event, "/members/register", "Ton compte membre a été créé.")
);
$("#memberLogoutButton").addEventListener("click", () => {
  clearMemberSession();
  toast("Compte membre déconnecté.");
});
$("#openStaffButton").addEventListener("click", () => {
  loginDialog.close();
  navigate("staff");
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  setFormStatus(status, "Connexion…");
  try {
    const result = await api("/auth/login", {
      method: "POST",
      auth: "none",
      body: JSON.stringify(values)
    });
    if (!result.token || !result.user) {
      throw new Error("Le serveur n’a pas renvoyé une session valide.");
    }
    saveSession(result.token, result.user);
    form.reset();
    setFormStatus(status, "");
    updateAccountDialog();
    loginDialog.close();
    navigate("staff");
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$("#logoutButton").addEventListener("click", () => {
  clearSession();
  navigate("home");
  toast("Session staff déconnectée.");
});

async function openStaffWorkspace() {
  if (!state.token || !state.user) {
    navigate("home");
    loginDialog.showModal();
    return;
  }
  try {
    const data = await api("/auth/me");
    state.user = data.user;
    sessionStorage.setItem("pixel-user", JSON.stringify(data.user));
  } catch {
    clearSession();
    navigate("home");
    selectAccountTab("staff");
    loginDialog.showModal();
    return;
  }

  $("#staffIdentity").textContent =
    `${state.user.username} • ${state.user.role === "admin" ? "Administrateur" : "Modérateur"}`;
  $("#passwordChangePanel").classList.toggle("hidden", !state.user.mustChangePassword);
  $("#staffWorkspace").classList.toggle("hidden", state.user.mustChangePassword);
  $("#accountsTabButton").classList.toggle("hidden", state.user.role !== "admin");

  if (!state.user.mustChangePassword) loadApplications();
}

$("#passwordChangeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    const result = await api("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(values)
    });
    saveSession(result.token, result.user);
    form.reset();
    setFormStatus(status, "Mot de passe modifié.", "success");
    await openStaffWorkspace();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

$$("[data-staff-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const tab = button.dataset.staffTab;
    $$(".staff-tabs button").forEach((item) => item.classList.toggle("active", item === button));
    $$(".staff-panel").forEach((panel) =>
      panel.classList.toggle("active", panel.id === `staff-${tab}`)
    );
    if (tab === "applications") loadApplications();
    if (tab === "messages") loadMessages();
    if (tab === "accounts") loadAccounts();
  });
});

const statusLabels = {
  pending: "En attente",
  reviewing: "En examen",
  accepted: "Acceptée",
  rejected: "Refusée"
};

async function loadApplications() {
  const list = $("#staffApplicationsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/staff/applications");
    state.applications = data.applications;
    if (!state.applications.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "Aucune candidature reçue." })
      );
      return;
    }
    list.replaceChildren(...state.applications.map(renderApplicationCard));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderApplicationCard(application) {
  const pill = element("span", {
    className: `status-pill status-${application.status}`,
    text: statusLabels[application.status]
  });
  const head = element("div", { className: "application-head" }, [
    element("strong", { text: application.discord_username }),
    pill
  ]);
  const card = element(
    "article",
    {
      className: "application-card",
      onclick: () => openApplication(application)
    },
    [
      head,
      element("p", { text: `${application.real_name} • ${application.age} ans • ${application.desired_role}` }),
      element("time", { text: formatDate(application.created_at) })
    ]
  );
  return card;
}

const applicationDialog = $("#applicationDialog");
$("#closeApplication").addEventListener("click", () => applicationDialog.close());

async function openApplication(application) {
  state.activeApplication = application;
  const content = $("#applicationDetailContent");
  content.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  applicationDialog.showModal();
  try {
    const data = await api(`/staff/applications/${application.id}/notes`);
    renderApplicationDetail(application, data.notes);
  } catch (error) {
    content.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function field(label, value) {
  return element("div", { className: "application-field" }, [
    element("small", { text: label }),
    element("div", { text: String(value) })
  ]);
}

function renderApplicationDetail(application, notes) {
  const content = $("#applicationDetailContent");
  const statusSelect = element("select");
  Object.entries(statusLabels).forEach(([value, label]) => {
    const option = element("option", { value, text: label });
    option.selected = value === application.status;
    statusSelect.append(option);
  });
  statusSelect.addEventListener("change", async () => {
    try {
      await api(`/staff/applications/${application.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: statusSelect.value })
      });
      application.status = statusSelect.value;
      toast("Statut mis à jour.");
      loadApplications();
    } catch (error) {
      toast(error.message);
    }
  });

  const notesList = element("div", { className: "note-list" });
  if (!notes.length) {
    notesList.append(element("p", { className: "form-status", text: "Aucune note interne." }));
  } else {
    notes.forEach((note) => {
      notesList.append(
        element("article", { className: "note-card" }, [
          element("strong", { text: note.username }),
          element("time", { text: formatDate(note.created_at) }),
          element("p", { text: note.body })
        ])
      );
    });
  }

  const noteInput = element("input", { placeholder: "Ajouter une note privée…", maxlength: "2000" });
  const noteButton = element("button", { type: "button", text: "Ajouter" });
  noteButton.addEventListener("click", async () => {
    if (!noteInput.value.trim()) return;
    noteButton.disabled = true;
    try {
      await api(`/staff/applications/${application.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteInput.value })
      });
      await openApplication(application);
    } catch (error) {
      toast(error.message);
    } finally {
      noteButton.disabled = false;
    }
  });

  content.replaceChildren(
    element("p", { className: "eyebrow", text: "Candidature privée" }),
    element("h2", { text: application.discord_username }),
    element("div", { className: "application-fields" }, [
      field("Prénom", application.real_name),
      field("Âge", `${application.age} ans`),
      field("Rôle souhaité", application.desired_role),
      field("Pseudo Discord", application.discord_username),
      field("Motivation", application.motivation),
      field("Reçue le", formatDate(application.created_at))
    ]),
    element("label", {}, [document.createTextNode("Statut"), statusSelect]),
    element("h3", { text: "Notes du staff" }),
    notesList,
    element("div", { className: "application-actions" }, [noteInput, noteButton])
  );
}

async function loadMessages() {
  const list = $("#staffMessagesList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/staff/messages");
    if (!data.messages.length) {
      list.replaceChildren(
        element("div", { className: "empty-state", text: "La messagerie est vide." })
      );
      return;
    }
    list.replaceChildren(
      ...data.messages.map((message) =>
        element("article", { className: "message-card" }, [
          element("strong", {
            text: `${message.username}${message.role === "admin" ? " • Admin" : ""}`
          }),
          element("time", { text: formatDate(message.created_at) }),
          element("p", { text: message.body })
        ])
      )
    );
    list.scrollTop = list.scrollHeight;
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

$("#staffMessageForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = $("input[name='body']", form);
  const button = $("button", form);
  button.disabled = true;
  try {
    await api("/staff/messages", {
      method: "POST",
      body: JSON.stringify({ body: input.value })
    });
    form.reset();
    await loadMessages();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

async function loadAccounts() {
  const list = $("#staffAccountsList");
  list.replaceChildren(element("div", { className: "loading-card", text: "Chargement…" }));
  try {
    const data = await api("/admin/accounts");
    list.replaceChildren(...data.accounts.map(renderAccount));
  } catch (error) {
    list.replaceChildren(element("div", { className: "empty-state", text: error.message }));
  }
}

function renderAccount(account) {
  const info = element("div", {}, [
    element("strong", { text: account.username }),
    element("small", {
      text: `${account.role === "admin" ? "Administrateur" : "Modérateur"}${account.mustChangePassword ? " • mot de passe temporaire" : ""}`
    })
  ]);
  const toggle = element("button", {
    type: "button",
    text: account.active ? "Désactiver" : "Réactiver"
  });
  toggle.addEventListener("click", async () => {
    try {
      await api(`/admin/accounts/${account.id}/toggle`, { method: "PATCH" });
      await loadAccounts();
    } catch (error) {
      toast(error.message);
    }
  });
  return element("article", { className: "account-card" }, [
    info,
    element("span", {
      className: `role-pill ${account.active ? "active-pill" : "inactive-pill"}`,
      text: account.active ? "Actif" : "Désactivé"
    }),
    toggle
  ]);
}

$("#accountForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = $(".form-status", form);
  const button = $("button[type='submit']", form);
  const values = Object.fromEntries(new FormData(form));
  button.disabled = true;
  try {
    await api("/admin/accounts", {
      method: "POST",
      body: JSON.stringify(values)
    });
    form.reset();
    setFormStatus(status, "Compte créé. Le mot de passe devra être changé à la première connexion.", "success");
    await loadAccounts();
  } catch (error) {
    setFormStatus(status, error.message, "error");
  } finally {
    button.disabled = false;
  }
});

const defaultPet = {
  hunger: 82,
  joy: 88,
  energy: 76,
  updatedAt: Date.now()
};

function currentPet() {
  const pet = state.pet && typeof state.pet === "object" ? state.pet : { ...defaultPet };
  const hoursAway = Math.max(0, (Date.now() - Number(pet.updatedAt || Date.now())) / 3_600_000);
  if (hoursAway >= 0.25) {
    pet.hunger = Math.max(5, Number(pet.hunger ?? 82) - hoursAway * 2.5);
    pet.joy = Math.max(5, Number(pet.joy ?? 88) - hoursAway * 1.8);
    pet.energy = Math.max(5, Number(pet.energy ?? 76) - hoursAway * 1.4);
  }
  pet.updatedAt = Date.now();
  state.pet = pet;
  return pet;
}

function savePet() {
  state.pet.updatedAt = Date.now();
  localStorage.setItem("pixel-pet", JSON.stringify(state.pet));
}

function petMood(pet) {
  const average = (pet.hunger + pet.joy + pet.energy) / 3;
  if (average >= 80) return ["Très heureux", "Pixel rayonne de bonheur !"];
  if (average >= 60) return ["Heureux", "Pixel est content de passer du temps avec toi."];
  if (average >= 40) return ["Calme", "Pixel aimerait recevoir un peu d’attention."];
  return ["Fatigué", "Pixel a besoin que tu prennes soin de lui."];
}

function renderPet(reaction = "") {
  const pet = currentPet();
  const values = {
    hunger: Math.round(pet.hunger),
    joy: Math.round(pet.joy),
    energy: Math.round(pet.energy)
  };
  Object.entries(values).forEach(([name, value]) => {
    $(`#${name}Value`).textContent = `${value}%`;
    $(`#${name}Bar`).style.width = `${value}%`;
  });
  const [mood, message] = petMood(pet);
  $("#petMoodBadge").textContent = mood;
  $("#petMessage").textContent = message;
  if (reaction) $("#petReaction").textContent = reaction;
  savePet();
}

function animatePet(animation, reaction) {
  const mascot = $("#petMascot");
  mascot.classList.remove("pet-bounce", "pet-eat", "pet-walk", "pet-sleep");
  void mascot.offsetWidth;
  mascot.classList.add(animation);
  $("#petReaction").textContent = reaction;
  window.setTimeout(() => mascot.classList.remove(animation), 950);
}

$$("[data-pet-action]").forEach((button) => {
  button.addEventListener("click", () => {
    const pet = currentPet();
    const action = button.dataset.petAction;
    if (action === "feed") {
      pet.hunger = Math.min(100, pet.hunger + 18);
      pet.joy = Math.min(100, pet.joy + 3);
      animatePet("pet-eat", "Miam ! 🍊");
    }
    if (action === "bounce") {
      pet.joy = Math.min(100, pet.joy + 13);
      pet.energy = Math.max(5, pet.energy - 5);
      animatePet("pet-bounce", "Youpi ! ✨");
    }
    if (action === "walk") {
      pet.joy = Math.min(100, pet.joy + 16);
      pet.hunger = Math.max(5, pet.hunger - 4);
      pet.energy = Math.max(5, pet.energy - 8);
      animatePet("pet-walk", "En route ! 👟");
    }
    if (action === "sleep") {
      pet.energy = Math.min(100, pet.energy + 24);
      pet.hunger = Math.max(5, pet.hunger - 3);
      animatePet("pet-sleep", "Zzz… 🌙");
    }
    state.pet = pet;
    savePet();
    renderPet();
  });
});

const guideDialog = $("#guideDialog");
$("#pixelGuideButton").addEventListener("click", () => guideDialog.showModal());
$("#closeGuide").addEventListener("click", () => guideDialog.close());
$$("[data-guide-page]").forEach((button) => {
  button.addEventListener("click", () => {
    const page = button.dataset.guidePage;
    guideDialog.close();
    if (page === "staff" && !state.user) {
      selectAccountTab("staff");
      updateAccountDialog();
      loginDialog.showModal();
      return;
    }
    navigate(page);
  });
});

async function restoreMemberSession() {
  if (!state.memberToken) return;
  try {
    const data = await api("/members/me", { auth: "member" });
    state.member = data.member;
    localStorage.setItem("pixel-member", JSON.stringify(data.member));
  } catch {
    clearMemberSession();
  }
  updateAccountButton();
  updateAccountDialog();
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
}

updateAccountButton();
updateAccountDialog();
renderPet();
restoreMemberSession();
