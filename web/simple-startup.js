const startup = document.querySelector("#startupAnimation");
const appShell = document.querySelector(".app-shell");

document.body?.classList.remove("startup-running");
startup?.remove();

if (appShell) {
  appShell.style.removeProperty("display");
  appShell.style.removeProperty("visibility");
  appShell.style.removeProperty("opacity");
  appShell.style.removeProperty("animation");
}

document.documentElement.dataset.pixelSimpleStartup = "true";
