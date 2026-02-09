/**
 * Vertex AI Proxy Interceptor — Client-side fetch shim
 * Ported from roofstack-ai-2/frontend/vertex-ai-proxy-interceptor.js
 *
 * This script intercepts window.fetch() calls to Google Cloud AI APIs
 * and redirects them through the server-side Vertex AI proxy at /api/ai/vertex-proxy.
 *
 * Usage: Include this script BEFORE any code that calls Vertex AI directly.
 * <script src="/static/vertex-ai-proxy.js"></script>
 *
 * When active, any fetch to aiplatform.googleapis.com will be proxied
 * through the server, which adds OAuth2 authentication.
 */
(function(clientRegexPattern) {
  const originalFetch = window.fetch;
  const apiRegex = new RegExp(clientRegexPattern);

  console.log('[Vertex AI Proxy Shim] Initialized. Intercepting Cloud AI API URLs');

  window.fetch = async function(url, options) {
    const inputUrl = typeof url === 'string' ? url : (url instanceof Request ? url.url : null);
    const normalizedUrl = (typeof inputUrl === 'string') ? inputUrl.split('?')[0] : null;

    // Check if URL matches Vertex AI patterns
    if (normalizedUrl && apiRegex.test(normalizedUrl)) {
      console.log('[Vertex AI Proxy Shim] Intercepted:', normalizedUrl);

      const requestDetails = {
        originalUrl: normalizedUrl,
        headers: options?.headers ? Object.fromEntries(new Headers(options.headers).entries()) : {},
        method: options?.method || 'POST',
        body: options?.body,
      };

      try {
        const proxyResponse = await originalFetch.call(this, '/api/ai/vertex-proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-App-Proxy': 'local-vertex-ai-app'
          },
          body: JSON.stringify(requestDetails),
        });

        if (proxyResponse.status === 401) {
          console.error('[Vertex Proxy Shim] 401 — authentication needed.');
        }

        return proxyResponse;
      } catch (error) {
        console.error('[Vertex AI Proxy Shim] Error:', error);
        return new Response(JSON.stringify({
          error: 'Proxying failed',
          details: error.message,
          proxiedUrl: inputUrl
        }), {
          status: 503,
          statusText: 'Proxy Unavailable',
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    return originalFetch.apply(this, arguments);
  };
})(
  // Regex matching Vertex AI API patterns
  "^https:\\/\\/aiplatform\\.googleapis\\.com\\/(?<version>[^/]+)\\/publishers\\/google\\/models\\/(?<model>[^/]+):(generateContent|predict|streamGenerateContent)$" +
  "|^https:\\/\\/(?<endpoint_location>[^-]+)-aiplatform\\.googleapis\\.com\\/(?<version2>[^/]+)\\/projects\\/(?<project_id>[^/]+)\\/locations\\/(?<location_id>[^/]+)\\/reasoningEngines\\/(?<engine_id>[^/]+):(query|streamQuery)$"
);
