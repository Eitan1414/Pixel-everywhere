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