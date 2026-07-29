const STARTUP_MAX_DURATION_MS = 9_200;
const STARTUP_FADE_DURATION_MS = 540;

let dismissed = false;
let safetyTimer = null;
const startedAt = performance.now();

function reportDismissal(reason) {
  try {
    window.pixelDesktop?.reportStartupDismissed?.({ reason });
  } catch {
    // Le pont Electron est facultatif sur Android et dans le navigateur.
  }
}

function dismissStartup(reason = "unknown") {
  if (dismissed) return;
  dismissed = true;
  window.clearTimeout(safetyTimer);

  const startup = document.querySelector("#startupAnimation");
  document.body?.classList.remove("startup-running");

  if (!startup) {
    reportDismissal(`${reason}:missing`);
    return;
  }

  startup.classList.add("leaving");
  startup.setAttribute("aria-hidden", "true");
  startup.style.pointerEvents = "none";

  window.setTimeout(() => {
    startup.hidden = true;
    startup.style.display = "none";
    reportDismissal(reason);
  }, STARTUP_FADE_DURATION_MS);
}

function installStartupSafety() {
  const startup = document.querySelector("#startupAnimation");
  if (!startup) {
    reportDismissal("not-present");
    return;
  }

  const skipButton = document.querySelector("#skipStartup");
  skipButton?.addEventListener(
    "click",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismissStartup("skip-button");
    },
    { capture: true }
  );

  startup.addEventListener("animationend", (event) => {
    const target = event.target;
    if (
      event.animationName === "intro-blackout" ||
      target?.classList?.contains("startup-blackout-v2")
    ) {
      dismissStartup("animation-finished");
    }
  });

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  safetyTimer = window.setTimeout(
    () => dismissStartup("safety-timeout"),
    reducedMotion ? 1_800 : STARTUP_MAX_DURATION_MS
  );

  const releaseAfterResume = () => {
    if (!document.hidden && performance.now() - startedAt >= STARTUP_MAX_DURATION_MS) {
      dismissStartup("resume-timeout");
    }
  };
  document.addEventListener("visibilitychange", releaseAfterResume);
  window.addEventListener("pageshow", releaseAfterResume);
}

installStartupSafety();

window.addEventListener("pixel:force-startup-dismiss", () => {
  dismissStartup("forced");
});
