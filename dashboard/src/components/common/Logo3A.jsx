export default function Logo3A({ size = 'md', className = '' }) {
  const sizeMap = {
    sm: 'w-7 h-7',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const selectedSize = sizeMap[size] || sizeMap.md;

  return (
    <img
      src="/apple-touch-icon.png"
      alt="Logo 3A"
      className={`inline-block shrink-0 select-none object-contain transition-transform hover:scale-105 ${selectedSize} ${className}`}
      draggable={false}
    />
  );
}
