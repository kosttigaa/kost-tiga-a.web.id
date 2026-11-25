import { useState } from 'react';
import {
  LayoutDashboard,
  BedDouble,
  Users,
  Receipt,
  CreditCard,
  Wrench,
  UserPlus,
  Download,
  Database,
  FileSpreadsheet,
  LogOut,
} from 'lucide-react';
import { EXPORT_OPTIONS } from '../../constants/kost';
import Logo3A from '../common/Logo3A';

const TAB_CONFIG = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'rooms', label: 'Kamar', icon: BedDouble },
  { id: 'tenants', label: 'Penghuni', icon: Users },
  { id: 'bills', label: 'Tagihan', icon: Receipt },
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
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Segmented Pill Navigation Bar */}
          <nav
            aria-label="Navigasi admin"
            className="flex w-full min-w-0 max-w-full items-center gap-1 overflow-x-auto no-scrollbar rounded-2xl border border-[#e8e1d1] bg-[#eeeadf]/80 p-1.5 shadow-[0_1px_3px_rgba(36,45,41,0.03)]"
          >
            {TAB_CONFIG.filter(({ id }) => allowedTabs.includes(id)).map(({ id, label, icon: Icon }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-[13px] font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'bg-[#1f3028] text-[#fffdf8] shadow-xs'
                      : 'text-[#4a534e] hover:bg-white/80 hover:text-[#242d29]'
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'opacity-95' : 'opacity-70'}`} />
                  <span>{label}</span>
                  {id === 'rooms' && (
                    <span
                      className={`inline-flex items-center justify-center leading-none rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                        isActive ? 'bg-white/20 text-white' : 'bg-[#d8c391] text-[#1f3028]'
                      }`}
                    >
                      {roomsCount}
                    </span>
                  )}
                  {id === 'bills' && overdueCount > 0 && (
                    <span
                      className={`inline-flex items-center justify-center leading-none rounded-full px-1.5 py-0.5 text-[10px] font-extrabold shadow-xs ${
                        isActive ? 'bg-rose-500 text-white' : 'bg-rose-600 text-white'
                      }`}
                    >
                      {overdueCount}
                    </span>
                  )}
                  {id === 'registrations' && pendingRegistrationsCount > 0 && (
                    <span className="inline-flex items-center justify-center leading-none rounded-full bg-amber-500 text-white px-1.5 py-0.5 text-[10px] font-extrabold shadow-xs">
                      {pendingRegistrationsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Action Buttons: Ekspor & Keluar */}
          <div className="flex items-center justify-end gap-2 self-end lg:self-auto shrink-0 w-full lg:w-auto">
            {isAdmin && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportOpen(open => !open)}
                  aria-haspopup="menu"
                  aria-expanded={isExportOpen}
                  className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[#e8e1d1] bg-white px-3.5 text-[13px] font-bold text-[#3c4540] hover:border-[#d8cba9] hover:bg-[#eeeadf] hover:text-[#242d29] shadow-xs transition-all cursor-pointer"
                >
                  <Download className="h-4 w-4 shrink-0 text-[#526b5b]" />
                  <span>Ekspor</span>
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
                            <FileSpreadsheet className="h-4 w-4 text-[#2e6930]" />
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
              className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-[#e8e1d1] bg-white px-3.5 text-[13px] font-bold text-[#3c4540] hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 shadow-xs transition-all cursor-pointer"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-70" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

