import { Printer, Download } from 'lucide-react';
import Logo3A from '../common/Logo3A';
import { formatDate, formatRupiah, getRoomLocation, formatTransactionNote } from '../../utils/formatters';

export default function ReceiptModal({
  receiptTrx,
  roomByNumber,
  onClose,
  onDownloadPdf,
}) {
  if (!receiptTrx) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-2.5 sm:p-4 print:p-0 print:bg-transparent print:static"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden p-4 sm:p-6 border border-slate-200 print:border-none print:shadow-none print:p-0 print:max-w-none max-h-[94vh] overflow-y-auto">
        <div id="receipt-area" className="border-2 border-dashed border-[#bca878] p-6 rounded-2xl bg-[#fffdf8]">
          <div className="text-center pb-4 border-b border-dashed border-slate-300">
            <div className="flex justify-center mb-2">
              <Logo3A size="lg" className="brand-logo-print" />
            </div>
            <h3 className="font-extrabold text-slate-900 text-lg font-heading tracking-tight">KOST TIGA A</h3>
            <p className="text-xs text-slate-500 font-medium">Jatimakmur, Pondok Gede, Bekasi</p>
            <p className="text-xs text-slate-500">08990004926</p>
          </div>

          <div className="py-4 space-y-2.5 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>No. Kuitansi:</span>
              <span className="font-mono font-bold text-slate-900">{receiptTrx.id}</span>
            </div>
            <div className="flex justify-between">
              <span>Tanggal Pembayaran:</span>
              <span className="font-medium text-slate-800">{formatDate(receiptTrx.date)}</span>
            </div>
            <div className="flex justify-between">
              <span>Diterima dari:</span>
              <span className="font-bold text-slate-900">{receiptTrx.tenantName}</span>
            </div>
            <div className="flex justify-between">
              <span>Untuk Sewa:</span>
              <span className="font-bold text-slate-900">{getRoomLocation(receiptTrx.roomNumber, roomByNumber)}</span>
            </div>
            <div className="flex justify-between">
              <span>Keterangan:</span>
              <span className="text-slate-700 text-right max-w-[180px]">{formatTransactionNote(receiptTrx, roomByNumber)}</span>
            </div>
          </div>

          <div className="py-3 my-2 border-t border-b border-dashed border-slate-300 flex justify-between items-center bg-[#eeeadf]/60 px-3 rounded-lg">
            <span className="text-sm font-bold text-slate-800 uppercase">Jumlah Bayar:</span>
            <span className="text-lg font-black text-[#1f3028]">{formatRupiah(receiptTrx.amount)}</span>
          </div>

          <div className="pt-4 flex justify-between items-end text-[11px] text-slate-500">
            <div>
              <p className="italic font-bold text-[#354c3f]">Status: LUNAS SAH</p>
              <p className="text-[10px] text-slate-400">Dicetak digital otomatis</p>
            </div>
            <div className="text-center">
              <p className="mb-8">Pengelola Kost,</p>
              <p className="font-bold text-slate-900 border-t border-slate-400 pt-1">Kost Tiga A</p>
            </div>
          </div>
        </div>

        <div className="mt-4 sm:mt-5 flex flex-wrap gap-2 justify-end print:hidden">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial justify-center px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer text-center"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex-1 sm:flex-initial justify-center px-4 py-2 bg-[#354c3f] hover:bg-[#1f3028] text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow cursor-pointer text-center"
          >
            <Printer className="w-4 h-4" /> Cetak
          </button>
          <button
            type="button"
            onClick={onDownloadPdf}
            className="flex-1 sm:flex-initial justify-center px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-xl flex items-center gap-2 shadow cursor-pointer text-center"
          >
            <Download className="w-4 h-4" /> Simpan PDF
          </button>
        </div>
      </div>
    </div>
  );
}

