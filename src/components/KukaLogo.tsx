import React, { useEffect, useState } from 'react';
import { DEFAULT_STORE_LOGO_URL } from '../data/seedCatalog';

interface KukaLogoProps {
  compact?: boolean;
  logoUrl?: string;
  storeName?: string;
  className?: string;
}

export const KukaLogo: React.FC<KukaLogoProps> = ({
  compact = false,
  logoUrl,
  storeName = 'KUKA TRADERS',
  className = '',
}) => {
  const effectiveUrl = (logoUrl ?? DEFAULT_STORE_LOGO_URL).trim() || DEFAULT_STORE_LOGO_URL;
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [effectiveUrl]);

  if (effectiveUrl && !imgError) {
    return (
      <span className={`inline-flex items-center whitespace-nowrap shrink-0 select-none ${className}`}>
        <img
          src={effectiveUrl}
          alt={storeName || 'KUKA TRADERS'}
          onError={() => setImgError(true)}
          className={`${compact ? 'h-8' : 'h-9 sm:h-10'} w-auto max-w-[180px] object-contain`}
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none ${className}`}>
      <svg
        width="32"
        height="32"
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="64" height="64" rx="14" fill="#F36B16" />
        <path
          d="M17 27H47L43.5 49H20.5L17 27Z"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinejoin="round"
        />
        <path
          d="M24 27V21C24 16.5817 27.5817 13 32 13C36.4183 13 40 16.5817 40 21V27"
          stroke="#FFFFFF"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M32 33C32 33 27.5 36.2 27.5 40C27.5 42.4853 29.5147 44.5 32 44.5C34.4853 44.5 36.5 42.4853 36.5 40C36.5 36.2 32 33 32 33Z"
          fill="#FFFFFF"
        />
      </svg>
      {!compact && (
        <span className="font-display text-lg font-extrabold tracking-tight text-stone-900">
          {storeName === 'KUKA TRADERS' ? (
            <>
              KUKA <span className="text-[#F36B16]">TRADERS</span>
            </>
          ) : (
            storeName
          )}
        </span>
      )}
    </span>
  );
};
