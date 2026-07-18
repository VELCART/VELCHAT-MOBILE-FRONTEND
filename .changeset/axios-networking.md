---
'@velchat/mobile': minor
---

Networking layer (§M7/§L3): Axios API client with request interceptor (Bearer + tenant + request-id + client-version), response envelope-unwrap, single-flight 401 refresh, backoff retry + 429 Retry-After, and a typed `AppError`. Feature-flags loader moved off `fetch` to Axios.
