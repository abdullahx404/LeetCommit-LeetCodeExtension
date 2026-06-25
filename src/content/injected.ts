/* eslint-disable @typescript-eslint/unbound-method */
/**
 * Network response interceptor executing directly in LeetCode MAIN world.
 * Declared in manifest.json with world: MAIN to prevent CSP script injection blocks.
 */
export function injectMainWorldInterceptor(): void {
  // No-op: script is loaded natively via manifest world: MAIN
}

(function initMainWorldInterceptor() {
  const win = window as unknown as { __gitleet_injected__?: boolean; fetch: typeof fetch };
  if (win.__gitleet_injected__) return;
  win.__gitleet_injected__ = true;

  const origFetch = win.fetch;
  win.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    const clone = response.clone();

    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && 'url' in args[0] ? args[0].url : '');

      if (url.includes('/submissions/detail/') || url.includes('/graphql') || url.includes('/submit/')) {
        clone.json().then((data: Record<string, unknown>) => {
          if (!data) return;

          let isAccepted = false;
          let lang = '';
          let code = '';

          // Route 1: Standard REST check
          if (data['state'] === 'SUCCESS' && data['status_msg'] === 'Accepted') {
            isAccepted = true;
            lang = typeof data['lang'] === 'string' ? data['lang'] : '';
            code = typeof data['code'] === 'string' ? data['code'] : '';
          }

          // Route 2: GraphQL submission details
          if (data['data'] && typeof data['data'] === 'object') {
            const d = data['data'] as Record<string, unknown>;
            if (d['submissionDetails'] && typeof d['submissionDetails'] === 'object') {
              const sub = d['submissionDetails'] as Record<string, unknown>;
              if (sub['statusDisplay'] === 'Accepted' || sub['statusCode'] === 10) {
                isAccepted = true;
                if (sub['lang'] && typeof sub['lang'] === 'object' && 'name' in sub['lang']) {
                  lang = String((sub['lang'] as Record<string, unknown>)['name']);
                } else if (typeof sub['lang'] === 'string') {
                  lang = sub['lang'];
                }
                code = typeof sub['code'] === 'string' ? sub['code'] : '';
              }
            }
          }

          if (isAccepted) {
            window.postMessage({
              type: 'GITLEET_SUBMISSION_ACCEPTED',
              payload: {
                language: lang,
                code: code,
                timestamp: Date.now(),
              },
            }, '*');
          }
        }).catch(() => {
          // Ignore non-JSON fetch
        });
      }
    } catch {
      // Ignore intercept error
    }

    return response;
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as unknown as { _url?: string })._url = typeof url === 'string' ? url : url.toString();
    return origXhrOpen.call(this, method, url, ...(rest as [boolean, string, string]));
  };

  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
    this.addEventListener('load', function () {
      try {
        const xhrUrl = (this as unknown as { _url?: string })._url || '';
        if (xhrUrl.includes('/submissions/detail/') || xhrUrl.includes('/graphql')) {
          const text = this.responseText;
          if (text && text.includes('Accepted')) {
            const data = JSON.parse(text) as Record<string, unknown>;
            if ((data['state'] === 'SUCCESS' && data['status_msg'] === 'Accepted') ||
                (data['data'] && typeof data['data'] === 'object' && ((data['data'] as Record<string, unknown>)['submissionDetails'] as Record<string, unknown>)?.['statusDisplay'] === 'Accepted')) {
              window.postMessage({
                type: 'GITLEET_SUBMISSION_ACCEPTED',
                payload: { timestamp: Date.now() },
              }, '*');
            }
          }
        }
      } catch {
        // Ignore JSON parse error
      }
    });
    return origXhrSend.apply(this, args as [Document | XMLHttpRequestBodyInit | null | undefined]);
  };
})();
