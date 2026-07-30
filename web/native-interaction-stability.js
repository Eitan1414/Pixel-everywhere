const userAgent = navigator.userAgent || "";
const platform = navigator.platform || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);
const isMacOS = Boolean(window.pixelDesktop) && /Mac/i.test(`${platform} ${userAgent}`);
const isStableNativeRuntime = isAndroid || isMacOS;

window.PixelNativeStability = {
  enabled: isStableNativeRuntime,
  platform: isAndroid ? "android" : isMacOS ? "macos" : "other"
};

document.documentElement.dataset.pixelStableNative = String(isStableNativeRuntime);
document.documentElement.dataset.pixelRuntime = window.PixelNativeStability.platform;

if (isStableNativeRuntime) {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = function stableNativeFetch(input, init = {}) {
    if (init?.signal) return nativeFetch(input, init);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    return nativeFetch(input, { ...init, signal: controller.signal })
      .finally(() => window.clearTimeout(timeout));
  };

  if (typeof window.scrollTo === "function") {
    const nativeScrollTo = window.scrollTo.bind(window);
    window.scrollTo = function stableScrollTo(first, second) {
      if (first && typeof first === "object") {
        return nativeScrollTo({ ...first, behavior: "auto" });
      }
      return nativeScrollTo(first, second);
    };
  }

  const dialogPrototype = window.HTMLDialogElement?.prototype;
  const nativeShowModal = dialogPrototype?.showModal;
  if (dialogPrototype && typeof nativeShowModal === "function") {
    dialogPrototype.showModal = function stableShowModal() {
      if (this.id !== "serverStatusDialog") {
        return nativeShowModal.call(this);
      }

      this.dataset.nonBlocking = "true";
      if (!this.open) this.show();
    };
  }

  window.addEventListener("error", (event) => {
    const message = event.error?.message || event.message || "Erreur inconnue";
    localStorage.setItem("pixel-last-native-error", `${Date.now()}|${message}`);
  });

  window.addEventListener("unhandledrejection", (event) => {
    const message = event.reason?.message || String(event.reason || "Promesse rejetée");
    localStorage.setItem("pixel-last-native-error", `${Date.now()}|${message}`);
  });
}
