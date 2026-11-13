import {
  Ruler,
  Bath,
  Bed,
  Sparkles,
  AirVent,
  NotebookPen,
  DoorClosed,
  CookingPot,
  Sun,
  Footprints,
  Wifi,
  Droplets,
  Key,
  CircleParking,
  Cctv,
} from 'lucide-react';

export function FacilityIcon({ name = '', className = 'w-3.5 h-3.5 text-[#526b5b] shrink-0' }) {
  const lower = name.toLowerCase().trim();

  if (lower.includes('3 x 4') || lower.includes('ruler') || lower.includes('ukuran')) {
    return <Ruler className={className} />;
  }
  if (lower.includes('mandi') || lower.includes('km') || lower.includes('bath') || lower.includes('toilet')) {
    return <Bath className={className} />;
  }
  if (lower.includes('kasur') || lower.includes('bed') || lower.includes('tidur')) {
    return <Bed className={className} />;
  }
  if (lower.includes('bantal') || lower.includes('guling') || lower.includes('pillow')) {
    return <Sparkles className={className} />;
  }
  if (lower.includes('ac') || lower.includes('vent') || lower.includes('pendingin')) {
    return <AirVent className={className} />;
  }
  if (lower.includes('meja') || lower.includes('kursi') || lower.includes('desk') || lower.includes('belajar')) {
    return <NotebookPen className={className} />;
  }
  if (lower.includes('lemari') || lower.includes('pakaian') || lower.includes('wardrobe')) {
    return <DoorClosed className={className} />;
  }
  if (lower.includes('dapur') || lower.includes('masak') || lower.includes('kulkas')) {
    return <CookingPot className={className} />;
  }
  if (lower.includes('jemur') || lower.includes('sun') || lower.includes('balkon')) {
    return <Sun className={className} />;
  }
  if (lower.includes('sepatu') || lower.includes('footprint') || lower.includes('rak')) {
    return <Footprints className={className} />;
  }
  if (lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet')) {
    return <Wifi className={className} />;
  }
  if (lower.includes('air') || lower.includes('water') || lower.includes('pdam') || lower.includes('bersih')) {
    return <Droplets className={className} />;
  }
  if (lower.includes('gerbang') || lower.includes('akses') || lower.includes('kunci') || lower.includes('key')) {
    return <Key className={className} />;
  }
  if (lower.includes('parkir') || lower.includes('motor') || lower.includes('mobil') || lower.includes('parking')) {
    return <CircleParking className={className} />;
  }
  if (lower.includes('cctv') || lower.includes('kamera') || lower.includes('security')) {
    return <Cctv className={className} />;
  }
  return <Sparkles className={className} />;
}

export default function FacilityBadge({ name }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-[#eeeadf] text-[#242d29] border border-[#e8e1d1] text-[11px] px-2 py-0.5 rounded-md font-medium">
      <FacilityIcon name={name} className="w-3.5 h-3.5 text-[#526b5b] shrink-0" />
      <span>{name}</span>
    </span>
  );
}
