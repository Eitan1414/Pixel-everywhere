const startup = document.querySelector("#startupAnimation");
const originalMarkup = window.__pixelOriginalStartupMarkup;
const macOSBundle = document.body?.dataset.pixelMacosNoIntro === "true";

if (startup && originalMarkup && !macOSBundle) {
  startup.innerHTML = originalMarkup;
  startup.classList.remove("leaving");
  startup.removeAttribute("aria-hidden");
  startup.hidden = false;
  startup.style.removeProperty("display");
  startup.style.removeProperty("pointer-events");
}

delete window.__pixelOriginalStartupMarkup;
