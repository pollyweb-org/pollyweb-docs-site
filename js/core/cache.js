(function initPortalCache() {
  const STORAGE_PREFIX = "portal-http-cache-v1:";
  const memoryCache = new Map();
  const inFlight = new Map();
  const lastRequestAt = new Map();

  function hashString(value) {
    let hash = 5381;
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function storageKey(cacheKey) {
    return `${STORAGE_PREFIX}${hashString(cacheKey)}`;
  }

  function readPersistent(cacheKey) {
    try {
      const raw = window.localStorage.getItem(storageKey(cacheKey));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.cacheKey !== cacheKey) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writePersistent(cacheKey, entry) {
    try {
      const serialized = JSON.stringify(entry);
      if (serialized.length > 300_000) {
        return;
      }
      window.localStorage.setItem(storageKey(cacheKey), serialized);
    } catch {
      // Ignore localStorage failures (quota/private mode).
    }
  }

  function createHttpError(status, body, url) {
    const details = typeof body === "string" && body.trim() ? `: ${body}` : "";
    const error = new Error(`HTTP ${status} for ${url}${details}`);
    error.status = status;
    error.body = body;
    return error;
  }

  function isFresh(entry) {
    return Boolean(entry && typeof entry.expiresAt === "number" && Date.now() <= entry.expiresAt);
  }

  function getCachedEntry(cacheKey, persistent) {
    const memEntry = memoryCache.get(cacheKey) || null;
    if (memEntry) return memEntry;
    if (!persistent) return null;

    const diskEntry = readPersistent(cacheKey);
    if (!diskEntry) return null;
    memoryCache.set(cacheKey, diskEntry);
    return diskEntry;
  }

  function storeEntry(cacheKey, entry, persistent) {
    memoryCache.set(cacheKey, entry);
    if (persistent) {
      writePersistent(cacheKey, entry);
    }
  }

  function deleteCached(cacheKey) {
    memoryCache.delete(cacheKey);
    inFlight.delete(cacheKey);
    lastRequestAt.delete(cacheKey);
    try {
      window.localStorage.removeItem(storageKey(cacheKey));
    } catch {
      // Ignore localStorage failures.
    }
  }

  function shouldThrottle(cacheKey, minRequestIntervalMs) {
    if (!minRequestIntervalMs || minRequestIntervalMs <= 0) return false;
    const last = lastRequestAt.get(cacheKey) || 0;
    return Date.now() - last < minRequestIntervalMs;
  }

  async function parseResponseBody(response, responseType) {
    if (responseType === "text") return response.text();
    return response.json();
  }

  async function fetchCached(url, options = {}) {
    const {
      cacheKey = url,
      headers = {},
      responseType = "json",
      ttlMs = 10 * 60 * 1000,
      negativeTtlMs = 90 * 1000,
      persistent = true,
      allowStaleOnError = true,
      minRequestIntervalMs = 0,
      staleWhileRevalidate = false,
    } = options;

    const cached = getCachedEntry(cacheKey, persistent);
    if (cached && cached.kind === "error" && isFresh(cached)) {
      throw createHttpError(cached.status || 500, cached.body || cached.message, url);
    }

    if (cached && cached.kind === responseType && isFresh(cached)) {
      return { data: cached.data, fromCache: true, stale: false };
    }

    if (cached && cached.kind === responseType && staleWhileRevalidate) {
      if (!inFlight.has(cacheKey) && !shouldThrottle(cacheKey, minRequestIntervalMs)) {
        void fetchCached(url, {
          ...options,
          staleWhileRevalidate: false,
        }).catch(() => {});
      }
      return { data: cached.data, fromCache: true, stale: true };
    }

    if (shouldThrottle(cacheKey, minRequestIntervalMs) && cached && cached.kind === responseType) {
      return { data: cached.data, fromCache: true, stale: !isFresh(cached) };
    }

    const inFlightRequest = inFlight.get(cacheKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }

    const requestPromise = (async () => {
      const requestHeaders = { ...headers };
      if (cached && cached.etag) {
        requestHeaders["If-None-Match"] = cached.etag;
      }

      lastRequestAt.set(cacheKey, Date.now());
      let response;
      try {
        response = await fetch(url, { headers: requestHeaders });
      } catch (err) {
        if (allowStaleOnError && cached && cached.kind === responseType) {
          return { data: cached.data, fromCache: true, stale: true };
        }
        throw err;
      }

      if (response.status === 304 && cached && cached.kind === responseType) {
        const refreshed = {
          ...cached,
          expiresAt: Date.now() + ttlMs,
          updatedAt: Date.now(),
        };
        storeEntry(cacheKey, refreshed, persistent);
        return { data: cached.data, fromCache: true, stale: false };
      }

      if (!response.ok) {
        const body = await response.text();
        const errorEntry = {
          cacheKey,
          kind: "error",
          status: response.status,
          body,
          message: `HTTP ${response.status}`,
          expiresAt: Date.now() + negativeTtlMs,
          updatedAt: Date.now(),
        };
        storeEntry(cacheKey, errorEntry, persistent);

        if (allowStaleOnError && cached && cached.kind === responseType) {
          return { data: cached.data, fromCache: true, stale: true };
        }
        throw createHttpError(response.status, body, url);
      }

      const data = await parseResponseBody(response, responseType);
      const entry = {
        cacheKey,
        kind: responseType,
        data,
        etag: response.headers.get("etag") || "",
        expiresAt: Date.now() + ttlMs,
        updatedAt: Date.now(),
      };
      storeEntry(cacheKey, entry, persistent);
      return { data, fromCache: false, stale: false };
    })();

    inFlight.set(cacheKey, requestPromise);
    try {
      return await requestPromise;
    } finally {
      inFlight.delete(cacheKey);
    }
  }

  window.PortalCache = {
    fetchCached,
    deleteCached,
  };
})();
