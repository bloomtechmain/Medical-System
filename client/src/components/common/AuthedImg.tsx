import { useEffect, useState } from 'react';
import { fetchAuthedImageUrl } from '../../utils/authedFiles';

// SEC-28: drop-in replacement for <img src={apiUrl}> when apiUrl needs an
// Authorization header — fetches the image with the header, renders a
// blob: URL once loaded, revokes it on unmount/src change to avoid leaking
// memory.
const AuthedImg = ({ src, alt, className }: { src: string; alt: string; className?: string }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;
    fetchAuthedImageUrl(src).then(url => {
      if (cancelled) { if (url) URL.revokeObjectURL(url); return; }
      currentUrl = url;
      setBlobUrl(url);
    });
    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [src]);

  if (!blobUrl) return <div className={`${className ?? ''} animate-pulse bg-gray-100`} />;
  return <img src={blobUrl} alt={alt} className={className} />;
};

export default AuthedImg;
