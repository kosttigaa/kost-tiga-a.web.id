import { useState } from 'react';
import {
  LayoutDashboard,
  BedDouble,
  Users,
  CreditCard,
  Wrench,
  UserPlus,
  Download,
  Database,
  FileText,
} from 'lucide-react';
import { EXPORT_OPTIONS } from '../../constants/kost';
import Logo3A from '../common/Logo3A';

const TAB_CONFIG = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'rooms', label: 'Kamar', icon: BedDouble },
  { id: 'tenants', label: 'Penghuni', icon: Users },
  { id: 'registrations', label: 'Pendaftar', icon: UserPlus },
  { id: 'finance', label: 'Keuangan', icon: CreditCard },
  { id: 'complaints', label: 'Keluhan', icon: Wrench },
];

export default function HeaderNav({
  isAdmin,
  allowedTabs,
  activeTab,
  setActiveTab,
  syncState,
  roomsCount,
  overdueCount,
  pendingRegistrationsCount,
  onExport,
  onLogout,
}) {
  const [isExportOpen, setIsExportOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-[#e8e1d1] bg-[rgba(255,253,248,0.92)] backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Logo3A size="md" />
            <h1 className="text-base font-extrabold text-[#242d29] font-heading tracking-tight">
              Kost Tiga A
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <span
              role="status"
              className={`hidden text-[11px] font-semibold sm:inline ${syncState === 'error' ? 'text-rose-600' : 'text-[#6d716a]'}`}
            >
              {syncState === 'saving' && 'Menyimpan…'}
              {syncState === 'saved' && 'Tersimpan di server'}
              {syncState === 'error' && 'Gagal menyimpan, mencoba lagi…'}
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.04em] text-[#515651] bg-[#eeeadf] px-2.5 py-1 rounded-full border border-[#e8e1d1]">
              PANEL PRIVAT
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-6 md:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav aria-label="Navigasi admin" className="flex flex-wrap items-center gap-2">
            {TAB_CONFIG.filter(({ id }) => allowedTabs.includes(id)).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`inline-flex min-h-[38px] items-center gap-2 rounded-lg border px-4 text-[13px] font-bold transition-all cursor-pointer ${
                  activeTab === id
                    ? 'border-[#1f3028] bg-[#1f3028] text-[#fffdf8] shadow-sm'
                    : 'border-[#e8e1d1] bg-white text-[#3c4540] hover:border-[#d8cba9] hover:bg-[#eeeadf] hover:text-[#242d29]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                <span>{label}</span>
                {id === 'rooms' && (
                  <span
                    className={`rounded-full px-1.5 py-0.2 text-[10px] font-extrabold ${
                      activeTab === id ? 'bg-white/20 text-white' : 'bg-[#d8c391] text-[#1f3028]'
                    }`}
                  >
                    {roomsCount}
                  </span>
                )}
                {id === 'tenants' && overdueCount > 0 && (
                  <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] text-rose-700 font-bold border border-rose-200">
                    {overdueCount}
                  </span>
                )}
                {id === 'registrations' && pendingRegistrationsCount > 0 && (
                  <span className="rounded-full bg-amber-500 text-white px-1.5 py-0.2 text-[10px] font-extrabold shadow-sm">
                    {pendingRegistrationsCount}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {isAdmin && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportOpen(open => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isExportOpen}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-[#e8e1d1] bg-white px-3.5 text-[13px] font-bold text-[#3c4540] hover:border-[#d8cba9] hover:bg-[#eeeadf] hover:text-[#242d29] transition-all cursor-pointer"
                >
                  <Download className="h-4 w-4" /> Ekspor
                </button>
                {isExportOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setIsExportOpen(false)} />
                    <div role="menu" className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-xl border border-[#e8e1d1] bg-white py-1 shadow-xl">
                      {EXPORT_OPTIONS.map((option) => (
                        <button
                          key={option.name}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setIsExportOpen(false);
                            onExport(option);
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-[#3c4540] hover:bg-[#eeeadf] cursor-pointer"
                        >
                          {option.name === 'database' ? (
                            <Database className="h-4 w-4 text-[#354c3f]" />
                          ) : (
                            <FileText className="h-4 w-4 text-[#6d716a]" />
                          )}
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-[#e8e1d1] bg-white px-4 text-[13px] font-bold text-[#3c4540] hover:border-[#d8cba9] hover:bg-[#eeeadf] hover:text-[#242d29] transition-all cursor-pointer"
            >
              Keluar
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

