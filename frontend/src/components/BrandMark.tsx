// Escudo com "visto": o mesmo desenho do ícone do app Android, em SVG.
export default function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label="Arezzo Device Manager" style={{ flexShrink: 0 }}>
      <rect width="48" height="48" rx="12" fill="#263238" />
      <path d="M24 8 L36 13 L36 24 C36 31.8 31 38 24 40.5 C17 38 12 31.8 12 24 L12 13 Z" fill="#26A69A" />
      <path d="M18 23.5 L22.5 28 L30.5 19.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
