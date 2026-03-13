export function shouldShowGlobalTibaBotFab(pathname: string | null | undefined) {
  if (!pathname || pathname === '/' || pathname === '/sign-in') {
    return false;
  }

  return !/^\/encounters\/(?!new\/?$)[^/]+\/?$/.test(pathname);
}