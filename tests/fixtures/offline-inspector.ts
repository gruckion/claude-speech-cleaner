// Keep the CLI path test independent of any running Claude or local debugger.
globalThis.fetch = Object.assign(async () => Response.json([]), {
  preconnect: () => {},
});
