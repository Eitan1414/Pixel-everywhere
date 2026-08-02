const startup = document.querySelector("#startupAnimation");
const appShell = document.querySelector(".app-shell");
const androidIntroSessionKey = "pixel-android-intro-started-session";
const androidIntroAlreadyStarted = sessionStorage.getItem(androidIntroSessionKey) === "1";

if (androidIntroAlreadyStarted) {
  document.documentElement.dataset.pixelSkipAndroidIntro = "true";

  const skipStyle = document.createElement("style");
  skipStyle.id = "pixelSkipRepeatedAndroidIntro";
  skipStyle.textContent = `
    #androidStartupAnimation {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.append(skipStyle);

  const removeRepeatedIntro = () => {
    document.querySelector("#androidStartupAnimation")?.remove();
    document.documentElement.dataset.pixelAndroidIntro = "finished";
  };

  const repeatedIntroObserver = new MutationObserver(removeRepeatedIntro);
  repeatedIntroObserver.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(() => {
    removeRepeatedIntro();
    repeatedIntroObserver.disconnect();
  }, 8_000);
} else {
  sessionStorage.setItem(androidIntroSessionKey, "1");
  document.documentElement.dataset.pixelSkipAndroidIntro = "false";
}

document.body?.classList.remove("startup-running");
startup?.remove();

if (appShell) {
  appShell.style.removeProperty("display");
  appShell.style.removeProperty("visibility");
  appShell.style.removeProperty("opacity");
  appShell.style.removeProperty("animation");
}

document.documentElement.dataset.pixelSimpleStartup = "true";

// Les jetons membre expirent au bout de quelques heures. Un compte staff conserve
// néanmoins son profil membre lié dans localStorage. Sans renouvellement, l'onglet
// MP membres continue d'envoyer l'ancien jeton et paraît cassé après une mise à jour.
if (!window.__pixelMemberDirectFetchRecovery) {
  window.__pixelMemberDirectFetchRecovery = true;

  const nativeFetch = window.fetch.bind(window);
  let refreshPromise = null;

  function requestUrl(input) {
    return typeof input === "string" ? input : input?.url || "";
  }

  function isMemberDirectRequest(url) {
    try {
      return /\/api\/member-direct(?:\/|$)/.test(new URL(url, window.location.href).pathname);
    } catch {
      return false;
    }
  }

  function linkedProfileEndpoint(url) {
    const endpoint = new URL(url, window.location.href);
    endpoint.pathname = endpoint.pathname.replace(
      /\/member-direct(?:\/.*)?$/,
      "/conversations/staff/member-profile"
    );
    endpoint.search = "";
    endpoint.hash = "";
    return endpoint.toString();
  }

  function jsonError(message, status = 503) {
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" }
    });
  }

  function storedStaffSession() {
    const token = sessionStorage.getItem("pixel-token") ||
      localStorage.getItem("pixel-staff-token-persistent") || "";
    const rawUser = sessionStorage.getItem("pixel-user") ||
      localStorage.getItem("pixel-staff-user-persistent") || "";
    if (!token || !rawUser) return null;
    try {
      const user = JSON.parse(rawUser);
      return user?.id ? { token, user } : null;
    } catch {
      return null;
    }
  }

  async function refreshLinkedMemberSession(url) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = (async () => {
      const staff = storedStaffSession();
      if (!staff) {
        return {
          token: "",
          error: "La session membre a expiré. Reconnecte ton compte staff pour réactiver les MP."
        };
      }

      const headers = { Authorization: `Bearer ${staff.token}` };
      if (url.includes(".ngrok-free.")) {
        headers["ngrok-skip-browser-warning"] = "pixel-everywhere";
      }

      let response;
      try {
        response = await nativeFetch(linkedProfileEndpoint(url), {
          method: "POST",
          headers,
          cache: "no-store"
        });
      } catch {
        return {
          token: "",
          error: "Le serveur PDD est inaccessible : impossible de renouveler la session MP."
        };
      }

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.token || !payload.member) {
        const expiredStaff = [401, 403].includes(response.status);
        return {
          token: "",
          error: expiredStaff
            ? "La session staff a expiré. Reconnecte ton compte staff, puis rouvre MP membres."
            : payload.error || "Le serveur n'a pas pu renouveler la session membre du staff."
        };
      }

      localStorage.setItem("pixel-member-token", payload.token);
      localStorage.setItem("pixel-member", JSON.stringify(payload.member));
      sessionStorage.setItem("pixel-staff-member-profile-ready", String(staff.user.id));
      window.dispatchEvent(new CustomEvent("pixel-member-session-ready", {
        detail: { token: payload.token, member: payload.member }
      }));
      window.PixelStaffMemberSession?.refresh?.();
      return { token: payload.token, member: payload.member, error: "" };
    })();

    try {
      return await refreshPromise;
    } finally {
      refreshPromise = null;
    }
  }

  function retryOptions(input, init, token) {
    const inheritedHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers || inheritedHeaders || {});
    headers.set("Authorization", `Bearer ${token}`);
    if (requestUrl(input).includes(".ngrok-free.")) {
      headers.set("ngrok-skip-browser-warning", "pixel-everywhere");
    }
    return { ...(init || {}), headers, cache: "no-store" };
  }

  window.fetch = async function memberDirectStableFetch(input, init) {
    const url = requestUrl(input);
    const response = await nativeFetch(input, init);
    if (!isMemberDirectRequest(url)) return response;

    if ([401, 403].includes(response.status)) {
      const renewed = await refreshLinkedMemberSession(url);
      if (!renewed.token) {
        return jsonError(renewed.error, response.status);
      }
      return nativeFetch(input, retryOptions(input, init, renewed.token));
    }

    if (response.status === 404) {
      return jsonError(
        "Les routes MP membres ne sont pas installées sur le serveur utilisé par l'application. Mets le serveur Termux à jour puis redémarre npm start.",
        404
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok && !contentType.includes("application/json")) {
      return jsonError(
        `Le serveur MP a répondu avec l'erreur HTTP ${response.status}. Vérifie l'URL du serveur PDD et le tunnel ngrok.`,
        response.status || 503
      );
    }

    return response;
  };
}