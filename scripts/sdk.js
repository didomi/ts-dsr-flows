function writeSDK(loaderUrl) {
  const url = new URL(loaderUrl);
  for (const rel of ["preconnect", "dns-prefetch"]) {
    const link = document.createElement("link");
    link.rel = rel;
    link.as = "script";
    link.href = url.origin + "/";
    document.head.append(link);
  }
  const preload = document.createElement("link");
  preload.rel = "preload";
  preload.as = "script";
  preload.href = url.href;
  const loader = document.createElement("script");
  loader.id = "spcloader";
  loader.type = "text/javascript";
  loader.async = true;
  loader.charset = "utf-8";
  loader.src = url.href;
  document.head.append(preload, loader);
}
