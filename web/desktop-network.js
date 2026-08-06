const desktopApiRequest = window.pixelDesktop?.apiRequest;

window.PixelDesktopNetwork = {
  enabled: typeof desktopApiRequest === "function",
  transport: typeof desktopApiRequest === "function" ? "renderer-with-ipc-fallback" : "browser"
};

function isNgrokApiUrl(value) {
  try {
    const hostname = new URL(String(value || "")).hostname.toLowerCase();
    return hostname.endsWith(".ngrok-free.app") || hostname.endsWith(".ngrok-free.dev");
  } catch {
    return false;
  }
}

function prepareDesktopRequest(input, init) {
  try {
    const request = input instanceof Request
      ? new Request(input.clone(), init)
      : new Request(input, init);

    if (!isNgrokApiUrl(request.url)) return request;

    const headers = new Headers(request.headers);
    if (!headers.has("ngrok-skip-browser-warning")) {
      headers.set("ngrok-skip-browser-warning", "pixel-everywhere");
    }
    return new Request(request, { headers });
  } catch {
    return null;
  }
}

function isNgrokBrowserWarning(request, response) {
  if (!request || !isNgrokApiUrl(request.url) || !response?.ok) return false;
  const contentType = String(response.headers?.get?.("content-type") || "").toLowerCase();
  return contentType.includes("text/html");
}

if (typeof desktopApiRequest === "function") {
  const rendererFetch = window.fetch.bind(window);

  async function relayDesktopRequest(fallbackRequest, directError) {
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
        relayError?.message || "La version desktop ne parvient pas à joindre le serveur PDD."
      );
      error.cause = directError;
      throw error;
    }
  }

  window.fetch = async function desktopResilientFetch(input, init) {
    const preparedRequest = prepareDesktopRequest(input, init);
    const directRequest = preparedRequest?.clone() || null;
    const fallbackRequest = preparedRequest?.clone() || null;

    try {
      const response = preparedRequest
        ? await rendererFetch(directRequest)
        : await rendererFetch(input, init);

      if (!isNgrokBrowserWarning(preparedRequest, response) || !fallbackRequest) {
        return response;
      }

      return await relayDesktopRequest(
        fallbackRequest,
        new TypeError("NGROK_BROWSER_WARNING")
      );
    } catch (directError) {
      if (directError?.name === "AbortError" || !fallbackRequest) throw directError;
      if (!/^https?:$/i.test(new URL(fallbackRequest.url).protocol)) throw directError;
      return relayDesktopRequest(fallbackRequest, directError);
    }
  };
}
