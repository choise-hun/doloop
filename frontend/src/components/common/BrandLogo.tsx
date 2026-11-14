import React from 'react';

export const BRAND_NAME = 'RE:DO';
export type BrandLogoVariant = 'wordmark' | 'stack' | 'mark';

export interface BrandLogoProps {
  variant?: BrandLogoVariant;
  className?: string;
}

const PATH_R =
  'M0 0H50C70 0 82 13 82 30C82 44 74 53 63 57L84 100H55L37 62H26V100H0Z M26 24H48C54 24 57 27 57 32C57 36 54 38 48 38H26Z';
const PATH_E = 'M0 0H70V24H26V38H70V62H26V76H70V100H0Z';
const PATH_D = 'M0 0H40A50 50 0 0 1 40 100H0Z M26 24H40A26 26 0 0 1 40 76H26Z';
const PATH_O =
  'M50 0A50 50 0 0 1 50 100A50 50 0 0 1 50 0Z M50 24A26 26 0 0 0 50 76A26 26 0 0 0 50 24Z';

interface VariantLayout {
  viewBox: string;
  rTransform: string;
  eTransform: string | null;
  colonX: number;
  dTransform: string | null;
  oTransform: string | null;
}

const LAYOUTS: Record<BrandLogoVariant, VariantLayout> = {
  wordmark: {
    viewBox: '0 0 416 100',
    rTransform: 'translate(0 0)',
    eTransform: 'translate(96 0)',
    colonX: 178,
    dTransform: 'translate(214 0)',
    oTransform: 'translate(316 0)',
  },
  stack: {
    viewBox: '0 0 202 210',
    rTransform: 'translate(0 0)',
    eTransform: 'translate(96 0)',
    colonX: 178,
    dTransform: 'translate(0 110)',
    oTransform: 'translate(102 110)',
  },
  mark: {
    viewBox: '0 0 120 100',
    rTransform: 'translate(0 0)',
    eTransform: null,
    colonX: 96,
    dTransform: null,
    oTransform: null,
  },
};

export function BrandLogo({ variant = 'wordmark', className }: BrandLogoProps): React.ReactElement {
  const layout = LAYOUTS[variant];
  return (
    <svg
      viewBox={layout.viewBox}
      role="img"
      aria-label={BRAND_NAME}
      className={className}
      fill="currentColor"
      fillRule="evenodd"
    >
      <path transform={layout.rTransform} d={PATH_R} />
      {layout.eTransform ? <path transform={layout.eTransform} d={PATH_E} /> : null}
      <rect x={layout.colonX} y={14} width={24} height={24} />
      <rect x={layout.colonX} y={62} width={24} height={24} />
      {layout.dTransform ? <path transform={layout.dTransform} d={PATH_D} /> : null}
      {layout.oTransform ? <path transform={layout.oTransform} d={PATH_O} /> : null}
    </svg>
  );
}
