const STAFF_TOKEN_KEYS = ["pixel-token", "pixel-staff-token-persistent"];
const STAFF_USER_KEYS = ["pixel-user", "pixel-staff-user-persistent"];

function readStoredValue(keys) {
  for (const key of keys) {
    const value = sessionStorage.getItem(key) || localStorage.getItem(key);
    if (value) return value;
  }
  return "";
}

function currentStaffSession() {
  const token = readStoredValue(STAFF_TOKEN_KEYS);
  const rawUser = readStoredValue(STAFF_USER_KEYS);
  if (!token || !rawUser) return null;
  try {
    const user = JSON.parse(rawUser);
    if (!user?.username || !["admin", "moderator", "mod"].includes(String(user.role || "").toLowerCase())) {
      return null;
    }
    return { token, user };
  } catch {
    return null;
  }
}

function stopLegacyPixelSwipe(event) {
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function installPixelVerticalScrollProtection() {
  const page = document.querySelector("#page-pixel");
  if (!page || page.dataset.verticalScrollProtection === "true") return;
  page.dataset.verticalScrollProtection = "true";

  let gesture = null;

  page.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) {
      gesture = null;
      return;
    }

    gesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      startedAt: performance.now(),
      scrollY: window.scrollY,
      multiTouch: event.touches.length > 1,
      interactive: Boolean(event.target.closest(
        "button, input, textarea, select, a, dialog, canvas, [role='button'], [data-pet-action], [data-shop-item]"
      ))
    };
  }, { capture: true, passive: true });

  page.addEventListener("touchmove", (event) => {
    if (!gesture) return;
    if (event.touches.length > 1) gesture.multiTouch = true;
    const touch = event.changedTouches?.[0] || event.touches?.[0];
    if (!touch) return;
    gesture.lastX = touch.clientX;
    gesture.lastY = touch.clientY;
  }, { capture: true, passive: true });

  page.addEventListener("touchend", (event) => {
    if (!gesture) return;
    const current = gesture;
    gesture = null;

    const touch = event.changedTouches?.[0];
    const endX = touch?.clientX ?? current.lastX;
    const endY = touch?.clientY ?? current.lastY;
    const deltaX = endX - current.startX;
    const deltaY = endY - current.startY;
    const horizontalDistance = Math.abs(deltaX);
    const verticalDistance = Math.abs(deltaY);
    const pageScrolled = Math.abs(window.scrollY - current.scrollY) > 6;
    const duration = performance.now() - current.startedAt;

    const intentionalHorizontalSwipe =
      !current.multiTouch &&
      !current.interactive &&
      !pageScrolled &&
      duration <= 900 &&
      horizontalDistance >= 125 &&
      horizontalDistance > verticalDistance * 1.8;

    if (!intentionalHorizontalSwipe) stopLegacyPixelSwipe(event);
  }, { capture: true, passive: true });

  page.addEventListener("touchcancel", (event) => {
    gesture = null;
    stopLegacyPixelSwipe(event);
  }, { capture: true, passive: true });
}

function activateStaffTab(button) {
  const tab = button?.dataset.staffTab;
  if (!tab) return;

  document.querySelectorAll(".staff-tabs [data-staff-tab]").forEach((item) => {
    item.classList.toggle("active", item === button);
    item.setAttribute("aria-selected", String(item === button));
  });
  document.querySelectorAll(".staff-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `staff-${tab}`);
  });
}

function installDelegatedStaffTabs() {
  const tabs = document.querySelector(".staff-tabs");
  if (!tabs || tabs.dataset.delegatedModerationTabs === "true") return;
  tabs.dataset.delegatedModerationTabs = "true";

  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-staff-tab]");
    if (!button || button.hidden || button.classList.contains("hidden")) return;
    activateStaffTab(button);
  }, { capture: true });
}

function openStaffAccountPanel() {
  document.querySelector("#accountButton")?.click();
  window.setTimeout(() => {
    document.querySelectorAll("[data-account-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.accountTab === "staff");
    });
    document.querySelectorAll(".account-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === "account-staff");
    });
  }, 0);
}

function openModeration() {
  const session = currentStaffSession();
  if (!session) {
    openStaffAccountPanel();
    return;
  }

  if (!sessionStorage.getItem("pixel-token")) sessionStorage.setItem("pixel-token", session.token);
  if (!sessionStorage.getItem("pixel-user")) sessionStorage.setItem("pixel-user", JSON.stringify(session.user));

  const guideStaffButton = document.querySelector('[data-guide-page="staff"]');
  if (guideStaffButton) {
    guideStaffButton.click();
    return;
  }

  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === "page-staff");
  });
  document.querySelector("#staffWorkspace")?.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function installModerationShortcut() {
  const actions = document.querySelector(".topbar-actions");
  if (!actions || document.querySelector("#moderationAccessButton")) return;

  const style = document.createElement("style");
  style.id = "moderationAccessStyles";
  style.textContent = `
    #moderationAccessButton{min-height:40px;padding:8px 12px;border:1px solid rgba(18,214,223,.36);border-radius:12px;color:var(--text);font-weight:900;background:rgba(18,214,223,.10)}
    #moderationAccessButton.hidden{display:none!important}
  `;
  document.head.append(style);

  const button = document.createElement("button");
  button.id = "moderationAccessButton";
  button.type = "button";
  button.textContent = "Modération";
  button.addEventListener("click", openModeration);
  actions.insertBefore(button, document.querySelector("#accountButton") || null);

  const sync = () => button.classList.toggle("hidden", !currentStaffSession());
  sync();
  window.setInterval(sync, 750);
  window.addEventListener("storage", sync);
}

function installAccessRepairs() {
  installPixelVerticalScrollProtection();
  installDelegatedStaffTabs();
  installModerationShortcut();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", installAccessRepairs, { once: true });
} else {
  installAccessRepairs();
}

window.PixelInteractionAccessStability = Object.freeze({
  openModeration,
  installAccessRepairs
});
