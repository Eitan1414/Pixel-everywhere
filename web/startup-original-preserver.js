const startup = document.querySelector("#startupAnimation");
const macOSBundle = document.body?.dataset.pixelMacosNoIntro === "true";

if (startup && !macOSBundle) {
  window.__pixelOriginalStartupMarkup = startup.innerHTML;
}
