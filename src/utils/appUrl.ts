function trimTrailingSlash(value: string) {
  return value.endsWith('/') && value !== '/' ? value.slice(0, -1) : value;
}

export function getAppBasePath() {
  const basePath = import.meta.env.BASE_URL || '/';
  return trimTrailingSlash(basePath);
}

export function createAppUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const basePath = getAppBasePath();
  return `${window.location.origin}${basePath === '/' ? '' : basePath}#${normalizedPath}`;
}
