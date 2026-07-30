const startup = window.__pixelOriginalStartupElement;
const macOSBundle = document.body?.dataset.pixelMacosNoIntro === "true";

if (startup && !macOSBundle) {
  startup.id = "startupAnimation";
}

delete window.__pixelOriginalStartupElement;
