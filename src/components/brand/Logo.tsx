import React from 'react';

export interface LogoIconProps {
  className?: string;
  size?: number;
  altText?: string;
  variant?: 'clean' | 'original-crop';
}

// Ícone da marca (o nome "Fato ou Farsa" não faz parte da imagem)
export const LogoIcon: React.FC<LogoIconProps> = ({
  className = '',
  size = 40,
  altText = 'Fato ou Farsa',
  variant = 'clean',
}) => {
  const src =
    variant === 'original-crop'
      ? '/assets/brand/fato_ou_farsa_icon.png'
      : '/assets/brand/fato_ou_farsa_icon_clean.png';

  return (
    <img
      src={src}
      alt={altText}
      style={{ height: `${size}px`, width: 'auto' }}
      className={`shrink-0 object-contain select-none transition-transform ${className}`}
      loading="eager"
      decoding="async"
    />
  );
};

export interface LogoProps {
  iconSize?: number;
  className?: string;
  variant?: 'clean' | 'original-crop';
}

export const Logo: React.FC<LogoProps> = ({ iconSize = 42, className = '', variant = 'clean' }) => (
  <LogoIcon size={iconSize} className={className} variant={variant} />
);

export default Logo;
