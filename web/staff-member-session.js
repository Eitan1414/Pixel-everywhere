const staffMemberKeys = Object.freeze({
  staffToken: "pixel-token",
  staffUser: "pixel-user",
  memberToken: "pixel-member-token",
  memberUser: "pixel-member"
});

let synchronizationPromise = null;
let initialSynchronizationFinished = false;
let lastIdentitySignature = "";
let lastErrorMessage = "";

function parseStored(storage, key) {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function staffIdentity() {
  return {
    token: sessionStorage.getItem(staffMemberKeys.staffToken) || "",
    user: parseStored(sessionStorage, staffMemberKeys.staffUser)
  };
}

function memberIdentity() {
  return {
    token: localStorage.getItem(staffMemberKeys.memberToken) || "",
    member: parseStored(localStorage, staffMemberKeys.memberUser)
  };
}

function apiBase() {
  const configured = localStorage.getItem("pixel-api-base-url");
  return String(configured || import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");
}

function identitySignature() {
  const staff = staffIdentity();
  const member = memberIdentity();
  return `${staff.token}:${staff.user?.id || ""}:${member.token}:${member.member?.id || ""}:${
    member.member?.staffId || ""
  }`;
}

function linkedToStaff(member, staff) {
  return Boolean(
    member?.staffLinked &&
      Number(member.staffId) === Number(staff?.id)
  );
}

function dispatchMemberReady(token, member) {
  window.dispatchEvent(new CustomEvent("pixel-member-session-ready", {
    detail: { token, member }
  }));
}

function dispatchMemberCleared() {
  window.dispatchEvent(new CustomEvent("pixel-member-session-cleared"));
}

function setCompatibilityError(message = "") {
  lastErrorMessage = message;
  document.documentElement.dataset.pixelMemberSessionError = message ? "true" : "false";
  const status = document.querySelector("#memberDirectStatus");
  if (status && message) {
    status.textContent = message;
    status.className = "conversation-status error";
  }
}

function refreshMemberAccessDom() {
  const member = memberIdentity();
  const available = Boolean(member.token && member.member);

  document.querySelector("#memberInboxGate")?.classList.toggle("hidden", available);
  document.querySelector("#memberInboxButton")?.classList.toggle("hidden", !available);
  document.querySelector("#communityChatGate")?.classList.toggle("hidden", available);
  document.querySelector("#communityChatArea")?.classList.toggle("hidden", !available);

  const directTab = document.querySelector("#memberDirectTab");
  if (directTab) directTab.disabled = !available;

  if (available && lastErrorMessage) setCompatibilityError("");
  if (!available && lastErrorMessage) setCompatibilityError(lastErrorMessage);
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return {};
  return response.json().catch(() => ({}));
}

async function createLinkedMemberProfile(staff) {
  const headers = { Authorization: `Bearer ${staff.token}` };
  if (apiBase().includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }

  let response;
  try {
    response = await fetch(`${apiBase()}/conversations/staff/member-profile`, {
      method: "POST",
      headers
    });
  } catch {
    throw new Error("Le serveur PDD est inaccessible : le profil membre du compte staff n’a pas pu être préparé.");
  }

  const payload = await readResponse(response);
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Le serveur PDD n’est pas à jour. Installe la version serveur 0.31.19 avant d’utiliser les MP."
      );
    }
    throw new Error(payload.error || "Le profil membre automatique du compte staff n’a pas pu être créé.");
  }
  if (!payload.token || !payload.member) {
    throw new Error("Le serveur n’a pas renvoyé une session membre liée valide.");
  }
  return payload;
}

async function probeCommunityMessaging(memberToken) {
  const headers = { Authorization: `Bearer ${memberToken}` };
  if (apiBase().includes(".ngrok-free.")) {
    headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
  }
  try {
    const response = await fetch(`${apiBase()}/member-direct/members`, {
      method: "GET",
      headers,
      cache: "no-store"
    });
    if (response.status === 404) {
      setCompatibilityError(
        "Les MP ne sont pas encore installés sur le serveur PDD. Mets le serveur Termux à jour vers la 0.31.19."
      );
      return false;
    }
    if (response.ok) setCompatibilityError("");
    return response.ok;
  } catch {
    return false;
  }
}

async function synchronizeStaffMemberSession({ reloadAfterChange = false } = {}) {
  if (synchronizationPromise) return synchronizationPromise;

  synchronizationPromise = (async () => {
    const staff = staffIdentity();
    const member = memberIdentity();

    if (!staff.token || !staff.user) {
      if (member.member?.staffLinked) {
        localStorage.removeItem(staffMemberKeys.memberToken);
        localStorage.removeItem(staffMemberKeys.memberUser);
        sessionStorage.removeItem("pixel-staff-member-profile-ready");
        dispatchMemberCleared();
        refreshMemberAccessDom();
        if (reloadAfterChange) window.location.reload();
      } else {
        refreshMemberAccessDom();
      }
      return memberIdentity();
    }

    if (member.token && linkedToStaff(member.member, staff.user)) {
      sessionStorage.setItem("pixel-staff-member-profile-ready", String(staff.user.id));
      dispatchMemberReady(member.token, member.member);
      refreshMemberAccessDom();
      await probeCommunityMessaging(member.token);
      return member;
    }

    try {
      const payload = await createLinkedMemberProfile(staff);
      localStorage.setItem(staffMemberKeys.memberToken, payload.token);
      localStorage.setItem(staffMemberKeys.memberUser, JSON.stringify(payload.member));
      sessionStorage.setItem("pixel-staff-member-profile-ready", String(staff.user.id));
      dispatchMemberReady(payload.token, payload.member);
      refreshMemberAccessDom();
      await probeCommunityMessaging(payload.token);
      if (reloadAfterChange) window.location.reload();
      return { token: payload.token, member: payload.member };
    } catch (error) {
      console.error("PIXEL_STAFF_MEMBER_SESSION_FAILED", error);
      setCompatibilityError(error.message || "Erreur de préparation du compte membre staff.");
      refreshMemberAccessDom();
      return memberIdentity();
    }
  })();

  try {
    return await synchronizationPromise;
  } finally {
    synchronizationPromise = null;
  }
}

await synchronizeStaffMemberSession({ reloadAfterChange: false });
initialSynchronizationFinished = true;
lastIdentitySignature = identitySignature();
refreshMemberAccessDom();

window.PixelStaffMemberSession = Object.freeze({
  ensure: () => synchronizeStaffMemberSession({ reloadAfterChange: false }),
  refresh: refreshMemberAccessDom,
  getIdentity: memberIdentity
});

window.setInterval(async () => {
  refreshMemberAccessDom();
  const signature = identitySignature();
  if (signature === lastIdentitySignature) return;
  lastIdentitySignature = signature;
  if (!initialSynchronizationFinished) return;
  await synchronizeStaffMemberSession({ reloadAfterChange: true });
  lastIdentitySignature = identitySignature();
}, 700);
