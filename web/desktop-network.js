const desktopApiRequest = window.pixelDesktop?.apiRequest;

window.PixelDesktopNetwork = {
  enabled: typeof desktopApiRequest === "function",
  transport: typeof desktopApiRequest === "function" ? "renderer-with-ipc-fallback" : "browser"
};

if (typeof desktopApiRequest === "function") {
  const rendererFetch = window.fetch.bind(window);

  window.fetch = async function desktopResilientFetch(input, init) {
    let fallbackRequest = null;
    try {
      fallbackRequest = input instanceof Request
        ? new Request(input.clone(), init)
        : new Request(input, init);
    } catch {
      // La requête directe affichera l'erreur utile si elle est invalide.
    }

    try {
      return await rendererFetch(input, init);
    } catch (directError) {
      if (directError?.name === "AbortError" || !fallbackRequest) throw directError;
      if (!/^https?:$/i.test(new URL(fallbackRequest.url).protocol)) throw directError;

      try {
        const method = fallbackRequest.method.toUpperCase();
        const body = ["GET", "HEAD"].includes(method)
          ? undefined
          : await fallbackRequest.text();
        const result = await desktopApiRequest({
          url: fallbackRequest.url,
          method,
          headers: Object.fromEntries(fallbackRequest.headers.entries()),
          body
        });

        const responseBody = result.body === "" || [204, 205, 304].includes(result.status)
          ? null
          : result.body;
        return new Response(responseBody, {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers
        });
      } catch (relayError) {
        const error = new TypeError(
          relayError?.message || "La version macOS ne parvient pas à joindre le serveur PDD."
        );
        error.cause = directError;
        throw error;
      }
    }
  };
}