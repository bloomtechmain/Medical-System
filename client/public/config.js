// Default/dev placeholder. In production this file is overwritten at container
// start (see docker-entrypoint.sh) from the API_URL env var, so the same built
// Docker image can run against any backend without rebuilding (ARCH-04).
window.__APP_CONFIG__ = { API_URL: "" };
