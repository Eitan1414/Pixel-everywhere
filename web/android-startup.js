const userAgent = navigator.userAgent || "";
const isAndroid = window.Capacitor?.getPlatform?.() === "android" || /Android/i.test(userAgent);

if (isAndroid && !document.querySelector("#androidStartupAnimation")) {
  const root = document.documentElement;
  root.dataset.pixelAndroidIntro = "active";

  const style = document.createElement("style");
  style.dataset.pixelAndroidIntroFix = "true";
  style.textContent = `
    #androidStartupAnimation .android-intro-stage {
      display: grid;
      place-items: center;
      align-content: center;
      gap: 18px;
      width: min(92vw, 560px);
      height: auto;
      min-height: 0;
    }

    #androidStartupAnimation .android-intro-mascot {
      position: relative;
      inset: auto;
      width: clamp(170px, 48vw, 280px);
      transform: none;
      animation: pixel-intro-mascot 5.8s cubic-bezier(.2,.8,.2,1) both;
    }

    #androidStartupAnimation .android-intro-mascot-inner {
      position: relative;
      inset: auto;
      width: 100%;
      aspect-ratio: 1;
      animation: pixel-intro-float 2.4s ease-in-out 2.7s infinite;
    }

    #androidStartupAnimation .android-intro-full-mascot {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      opacity: 0;
      clip-path: inset(0 100% 0 0);
      filter: drop-shadow(0 0 18px rgba(255,255,255,.18));
      animation: pixel-intro-draw 5.8s cubic-bezier(.35,.05,.22,1) both;
    }

    #androidStartupAnimation .android-intro-trace {
      position: absolute;
      inset: -8%;
      border-radius: 50%;
      opacity: 0;
      background: conic-gradient(from 210deg, transparent 0 12%, #ff6b19 20%, #fff 34%, #12d6df 48%, transparent 62% 100%);
      -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      mask: radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px));
      animation: pixel-intro-trace 5.8s ease both;
      filter: drop-shadow(0 0 8px rgba(18,214,223,.65));
    }

    #androidStartupAnimation .android-intro-title {
      position: relative;
      z-index: 8;
      text-align: center;
      opacity: 0;
      transform: translateY(18px) scale(.96);
      animation: pixel-intro-title 5.8s cubic-bezier(.2,.8,.2,1) both;
    }

    #androidStartupAnimation .android-intro-title strong,
    #androidStartupAnimation .android-intro-title span {
      display: block;
      line-height: .95;
      text-transform: uppercase;
      font-family: Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif;
      font-style: italic;
      letter-spacing: .03em;
    }

    #androidStartupAnimation .android-intro-title strong {
      color: #ff6b19;
      font-size: clamp(3rem, 15vw, 5.8rem);
      text-shadow: 0 0 18px rgba(255,107,25,.26);
    }

    #androidStartupAnimation .android-intro-title span {
      margin-top: 7px;
      color: #12d6df;
      font-size: clamp(1.25rem, 6vw, 2.25rem);
      text-shadow: 0 0 14px rgba(18,214,223,.3);
    }

    #androidStartupAnimation .android-intro-copy {
      position: relative;
      inset: auto;
      display: block;
      opacity: 0;
      animation: pixel-intro-copy 5.8s ease both;
    }

    #androidStartupAnimation .android-intro-copy p:not(.android-intro-tagline) {
      display: none;
    }

    #androidStartupAnimation .android-intro-tagline {
      margin: 0 !important;
      font-size: .78rem !important;
      letter-spacing: .16em !important;
      color: rgba(255,255,255,.72) !important;
    }

    #androidStartupAnimation .android-intro-rings::before,
    #androidStartupAnimation .android-intro-rings::after {
      top: 47%;
      animation-duration: 5.8s;
    }

    #androidStartupAnimation .android-intro-hand,
    #androidStartupAnimation .android-intro-body,
    #androidStartupAnimation .android-intro-eye,
    #androidStartupAnimation .android-intro-sketch,
    #androidStartupAnimation .android-intro-pencil-trail,
    #androidStartupAnimation .android-intro-wordmark,
    #androidStartupAnimation .android-intro-wordmark-streaks {
      display: none !important;
    }

    @keyframes pixel-intro-draw {
      0%, 10% { opacity: 0; clip-path: inset(0 100% 0 0); transform: scale(.94); }
      18% { opacity: .2; }
      55% { opacity: 1; clip-path: inset(0 0 0 0); transform: scale(1); }
      88% { opacity: 1; transform: scale(1); }
      100% { opacity: .95; transform: scale(.96); }
    }

    @keyframes pixel-intro-trace {
      0%, 8% { opacity: 0; transform: rotate(-130deg) scale(.86); }
      16% { opacity: .9; }
      52% { opacity: .8; transform: rotate(230deg) scale(1.02); }
      62%, 100% { opacity: 0; transform: rotate(300deg) scale(1.08); }
    }

    @keyframes pixel-intro-mascot {
      0%, 8% { opacity: 0; transform: translateY(18px) scale(.9); }
      18% { opacity: 1; }
      60%, 88% { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-12px) scale(.96); }
    }

    @keyframes pixel-intro-title {
      0%, 48% { opacity: 0; transform: translateY(18px) scale(.96); }
      62%, 88% { opacity: 1; transform: translateY(0) scale(1); }
      100% { opacity: 0; transform: translateY(-8px) scale(.98); }
    }

    @keyframes pixel-intro-copy {
      0%, 62% { opacity: 0; transform: translateY(8px); }
      72%, 90% { opacity: 1; transform: translateY(0); }
      100% { opacity: 0; transform: translateY(-5px); }
    }

    @keyframes pixel-intro-float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-7px); }
    }
  `;
  document.head.append(style);

  const overlay = document.createElement("div");
  overlay.id = "androidStartupAnimation";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-label", "Animation de démarrage Pixel Everywhere");
  overlay.innerHTML = `
    <div class="android-intro-glow" aria-hidden="true"></div>
    <div class="android-intro-grid" aria-hidden="true"></div>
    <div class="android-intro-beams" aria-hidden="true"><i></i><i></i><i></i></div>
    <div class="android-intro-particles" aria-hidden="true">
      ${Array.from({ length: 18 }, () => "<i></i>").join("")}
    </div>
    <div class="android-intro-stage" aria-hidden="true">
      <div class="android-intro-rings"></div>
      <div class="android-intro-mascot">
        <div class="android-intro-mascot-inner">
          <span class="android-intro-trace"></span>
          <img class="android-intro-full-mascot" src="./assets/pixel-mascot.png" alt="" />
        </div>
      </div>
      <div class="android-intro-title">
        <strong>Pixel</strong>
        <span>Everywhere</span>
      </div>
      <div class="android-intro-copy">
        <p class="android-intro-tagline">Imagine • Create • Share</p>
      </div>
    </div>
    <button class="android-intro-skip" type="button">Passer</button>
  `;

  const finish = () => {
    if (overlay.classList.contains("android-intro-leaving")) return;
    overlay.classList.add("android-intro-leaving");
    root.dataset.pixelAndroidIntro = "finished";
    window.setTimeout(() => {
      overlay.remove();
      style.remove();
    }, 520);
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const timer = window.setTimeout(finish, reducedMotion ? 1200 : 5900);

  overlay.querySelector(".android-intro-skip")?.addEventListener("click", () => {
    window.clearTimeout(timer);
    finish();
  });

  overlay.addEventListener("animationcancel", () => {
    if (!document.hidden) finish();
  }, { once: true });

  document.body.prepend(overlay);

  window.setTimeout(() => {
    if (root.dataset.pixelAndroidIntro === "active" && !document.body.contains(overlay)) {
      root.dataset.pixelAndroidIntro = "finished";
    }
  }, 7000);
}
