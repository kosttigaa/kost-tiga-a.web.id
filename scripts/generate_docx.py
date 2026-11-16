import zipfile
import html
import os

def create_detailed_docx(filename):
    def xml_escape(text):
        return html.escape(str(text))

    def run(text, bold=False, italic=False, color=None, size=None, font="Calibri"):
        rPr = []
        if font:
            rPr.append(f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>')
        if bold:
            rPr.append('<w:b/>')
        if italic:
            rPr.append('<w:i/>')
        if color:
            rPr.append(f'<w:color w:val="{color}"/>')
        if size:
            rPr.append(f'<w:sz w:val="{size}"/>')
        rPr_str = f"<w:rPr>{''.join(rPr)}</w:rPr>" if rPr else ""
        return f'<w:r>{rPr_str}<w:t xml:space="preserve">{xml_escape(text)}</w:t></w:r>'

    def p(text="", bold=False, italic=False, color="2C3531", size="22", font="Calibri",
          space_before=0, space_after=120, align="left"):
        pPr = [
            f'<w:jc w:val="{align}"/>',
            f'<w:spacing w:before="{space_before}" w:after="{space_after}" w:line="276" w:lineRule="auto"/>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        r_str = run(text, bold=bold, italic=italic, color=color, size=size, font=font) if text else ""
        return f'<w:p>{pPr_str}{r_str}</w:p>'

    def p_runs(runs_list, space_before=0, space_after=120, align="left"):
        pPr = [
            f'<w:jc w:val="{align}"/>',
            f'<w:spacing w:before="{space_before}" w:after="{space_after}" w:line="276" w:lineRule="auto"/>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        runs_str = "".join([run(**r) for r in runs_list])
        return f'<w:p>{pPr_str}{runs_str}</w:p>'

    def heading1(text):
        pPr = [
            '<w:spacing w:before="400" w:after="160"/>',
            '<w:pBdr><w:bottom w:val="single" w:sz="16" w:space="6" w:color="354C3F"/></w:pBdr>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        r_str = run(text, bold=True, color="20382B", size="32", font="Segoe UI")
        return f'<w:p>{pPr_str}{r_str}</w:p>'

    def heading2(text):
        pPr = [
            '<w:spacing w:before="280" w:after="120"/>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        r_str = run(text, bold=True, color="354C3F", size="26", font="Segoe UI")
        return f'<w:p>{pPr_str}{r_str}</w:p>'

    def heading3(text):
        pPr = [
            '<w:spacing w:before="200" w:after="80"/>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        r_str = run(text, bold=True, color="43634E", size="23", font="Segoe UI Semibold")
        return f'<w:p>{pPr_str}{r_str}</w:p>'

    def bullet(bold_prefix, text, level=0):
        indent = 400 + (level * 300)
        pPr = [
            '<w:pStyle w:val="ListParagraph"/>',
            f'<w:ind w:left="{indent}" w:hanging="240"/>',
            '<w:spacing w:before="20" w:after="70" w:line="260" w:lineRule="auto"/>'
        ]
        pPr_str = f"<w:pPr>{''.join(pPr)}</w:pPr>"
        symbol = "•  " if level == 0 else "–  "
        r_bullet = run(symbol, bold=True, color="354C3F", size="22")
        r_bold = run(bold_prefix + ": ", bold=True, color="1E2822", size="22") if bold_prefix else ""
        r_text = run(text, color="333333", size="22")
        return f'<w:p>{pPr_str}{r_bullet}{r_bold}{r_text}</w:p>'

    def prompt_box(title, text_lines, tag="PROMPT SIAP SALIN"):
        tbl_pr = [
            '<w:tblPr>',
            '<w:tblW w:w="9400" w:type="dxa"/>',
            '<w:jc w:val="center"/>',
            '<w:tblBorders>',
            '<w:top w:val="single" w:sz="6" w:space="0" w:color="CAD5CD"/>',
            '<w:left w:val="single" w:sz="30" w:space="0" w:color="354C3F"/>',
            '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="CAD5CD"/>',
            '<w:right w:val="single" w:sz="6" w:space="0" w:color="CAD5CD"/>',
            '</w:tblBorders>',
            '<w:tblCellMar>',
            '<w:top w:w="160" w:type="dxa"/>',
            '<w:left w:w="220" w:type="dxa"/>',
            '<w:bottom w:w="160" w:type="dxa"/>',
            '<w:right w:w="220" w:type="dxa"/>',
            '</w:tblCellMar>',
            '</w:tblPr>'
        ]
        
        tc_pr = [
            '<w:tcPr>',
            '<w:tcW w:w="9400" w:type="dxa"/>',
            '<w:shd w:val="clear" w:color="auto" w:fill="F5F8F6"/>',
            '</w:tcPr>'
        ]
        
        paragraphs = []
        p_head_pr = '<w:pPr><w:spacing w:before="40" w:after="90"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="C5D3CA"/></w:pBdr></w:pPr>'
        r_tag = run(f"[{tag}] ", bold=True, color="52735E", size="18", font="Consolas")
        r_head = run(title, bold=True, color="20382B", size="22", font="Segoe UI Semibold")
        paragraphs.append(f'<w:p>{p_head_pr}{r_tag}{r_head}</w:p>')
        
        for line in text_lines:
            p_line_pr = '<w:pPr><w:spacing w:before="0" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>'
            is_header = line.startswith('#') or line.startswith('//') or (line.endswith(':') and len(line) < 35 and not line.startswith(' '))
            font = "Consolas" if line.strip().startswith(('-', '*', '{', '}', '<', '>', '$', 'api', 'const', 'let', 'http', '[', 'npm', 'git', 'pm2')) else "Segoe UI"
            size = "19" if font == "Consolas" else "20"
            color = "1B2E22" if is_header else "28372D"
            r_line = run(line, bold=is_header, color=color, size=size, font=font)
            paragraphs.append(f'<w:p>{p_line_pr}{r_line}</w:p>')
            
        return f'<w:tbl>{"".join(tbl_pr)}<w:tr><w:tc>{"".join(tc_pr)}{"".join(paragraphs)}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr></w:p>'

    def note_box(title, text, tag="BEST PRACTICE"):
        tbl_pr = [
            '<w:tblPr>',
            '<w:tblW w:w="9400" w:type="dxa"/>',
            '<w:jc w:val="center"/>',
            '<w:tblBorders>',
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="E6DCBF"/>',
            '<w:left w:val="single" w:sz="24" w:space="0" w:color="B8933A"/>',
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E6DCBF"/>',
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="E6DCBF"/>',
            '</w:tblBorders>',
            '<w:tblCellMar>',
            '<w:top w:w="130" w:type="dxa"/>',
            '<w:left w:w="180" w:type="dxa"/>',
            '<w:bottom w:w="130" w:type="dxa"/>',
            '<w:right w:w="180" w:type="dxa"/>',
            '</w:tblCellMar>',
            '</w:tblPr>'
        ]
        tc_pr = [
            '<w:tcPr>',
            '<w:tcW w:w="9400" w:type="dxa"/>',
            '<w:shd w:val="clear" w:color="auto" w:fill="FCFBF7"/>',
            '</w:tcPr>'
        ]
        p_pr = '<w:pPr><w:spacing w:before="20" w:after="40" w:line="260" w:lineRule="auto"/></w:pPr>'
        r_tag = run(f"💡 [{tag}] ", bold=True, color="8A6B1A", size="20", font="Segoe UI Semibold")
        r_title = run(f"{title}: ", bold=True, color="544318", size="21", font="Segoe UI Semibold")
        r_text = run(text, italic=False, color="473B1B", size="21", font="Segoe UI")
        return f'<w:tbl>{"".join(tbl_pr)}<w:tr><w:tc>{"".join(tc_pr)}<w:p>{p_pr}{r_tag}{r_title}{r_text}</w:p></w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="140"/></w:pPr></w:p>'

    def trouble_box(title, problem, prompt_fix):
        tbl_pr = [
            '<w:tblPr>',
            '<w:tblW w:w="9400" w:type="dxa"/>',
            '<w:jc w:val="center"/>',
            '<w:tblBorders>',
            '<w:top w:val="single" w:sz="4" w:space="0" w:color="E8C6C6"/>',
            '<w:left w:val="single" w:sz="24" w:space="0" w:color="C0392B"/>',
            '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="E8C6C6"/>',
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="E8C6C6"/>',
            '</w:tblBorders>',
            '<w:tblCellMar>',
            '<w:top w:w="140" w:type="dxa"/>',
            '<w:left w:w="190" w:type="dxa"/>',
            '<w:bottom w:w="140" w:type="dxa"/>',
            '<w:right w:w="190" w:type="dxa"/>',
            '</w:tblCellMar>',
            '</w:tblPr>'
        ]
        tc_pr = [
            '<w:tcPr>',
            '<w:tcW w:w="9400" w:type="dxa"/>',
            '<w:shd w:val="clear" w:color="auto" w:fill="FDF8F8"/>',
            '</w:tcPr>'
        ]
        p_head_pr = '<w:pPr><w:spacing w:before="20" w:after="50"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="3" w:color="E5B8B8"/></w:pBdr></w:pPr>'
        r_head = run(f"⚠️ Skenario Kendala: {title}", bold=True, color="96281B", size="21", font="Segoe UI Semibold")
        
        p_prob_pr = '<w:pPr><w:spacing w:before="40" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr>'
        r_prob_lbl = run("Gejala / Masalah: ", bold=True, color="6B1D14", size="20")
        r_prob_txt = run(problem, color="4A201B", size="20")
        
        p_fix_pr = '<w:pPr><w:spacing w:before="60" w:after="40" w:line="240" w:lineRule="auto"/></w:pPr>'
        r_fix_lbl = run("Prompt Perbaikan ke AI:", bold=True, color="1F5E39", size="20")
        
        p_code_pr = '<w:pPr><w:spacing w:before="20" w:after="40" w:line="230" w:lineRule="auto"/></w:pPr>'
        r_code = run(f'"{prompt_fix}"', bold=False, color="1E3827", size="19", font="Consolas")
        
        return f'<w:tbl>{"".join(tbl_pr)}<w:tr><w:tc>{"".join(tc_pr)}<w:p>{p_head_pr}{r_head}</w:p><w:p>{p_prob_pr}{r_prob_lbl}{r_prob_txt}</w:p><w:p>{p_fix_pr}{r_fix_lbl}</w:p><w:p>{p_code_pr}{r_code}</w:p></w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="140"/></w:pPr></w:p>'

    def table_grid(headers, rows_data):
        tbl_pr = [
            '<w:tblPr>',
            '<w:tblW w:w="9400" w:type="dxa"/>',
            '<w:jc w:val="center"/>',
            '<w:tblBorders>',
            '<w:top w:val="single" w:sz="6" w:space="0" w:color="354C3F"/>',
            '<w:left w:val="single" w:sz="4" w:space="0" w:color="D5DDD7"/>',
            '<w:bottom w:val="single" w:sz="6" w:space="0" w:color="354C3F"/>',
            '<w:right w:val="single" w:sz="4" w:space="0" w:color="D5DDD7"/>',
            '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E0E6E2"/>',
            '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="E0E6E2"/>',
            '</w:tblBorders>',
            '</w:tblPr>'
        ]
        
        num_cols = len(headers)
        col_w = int(9400 / num_cols)
        
        # Header Row
        th_cells = []
        for h in headers:
            tc_pr = [
                '<w:tcPr>',
                f'<w:tcW w:w="{col_w}" w:type="dxa"/>',
                '<w:shd w:val="clear" w:color="auto" w:fill="354C3F"/>',
                '<w:tcMar><w:top w:w="120" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>',
                '</w:tcPr>'
            ]
            p_elem = f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>{run(h, bold=True, color="FFFFFF", size="20", font="Segoe UI Semibold")}</w:p>'
            th_cells.append(f'<w:tc>{"".join(tc_pr)}{p_elem}</w:tc>')
        
        tr_elements = [f'<w:tr>{"".join(th_cells)}</w:tr>']
        
        # Data Rows
        for r_idx, row in enumerate(rows_data):
            td_cells = []
            bg_color = "F9FAF9" if r_idx % 2 == 1 else "FFFFFF"
            for c_idx, cell in enumerate(row):
                tc_pr = [
                    '<w:tcPr>',
                    f'<w:tcW w:w="{col_w}" w:type="dxa"/>',
                    f'<w:shd w:val="clear" w:color="auto" w:fill="{bg_color}"/>',
                    '<w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>',
                    '</w:tcPr>'
                ]
                is_code = cell.startswith('`') and cell.endswith('`')
                text_clean = cell.strip('`')
                font = "Consolas" if is_code else "Segoe UI"
                size = "19" if is_code else "20"
                p_elem = f'<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr>{run(text_clean, bold=False, color="242D28", size=size, font=font)}</w:p>'
                td_cells.append(f'<w:tc>{"".join(tc_pr)}{p_elem}</w:tc>')
            tr_elements.append(f'<w:tr>{"".join(td_cells)}</w:tr>')
            
        return f'<w:tbl>{"".join(tbl_pr)}{"".join(tr_elements)}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="140"/></w:pPr></w:p>'

    body = []

    # Title Banner
    body.append(p("PANDUAN LENGKAP & BLUEPRINT PROMPT AI", bold=True, color="20382B", size="44", font="Segoe UI", space_before=120, space_after=40))
    body.append(p("Arsitektur, Rekayasa Prompt Bertahap, dan Best Practices Pembuatan Aplikasi Web Kost Tiga A", bold=True, color="354C3F", size="26", font="Segoe UI", space_before=0, space_after=120))
    body.append(p_runs([
        {"text": "Aplikasi Target: ", "bold": True, "color": "666666", "size": "20"},
        {"text": "Sistem Promosi & Manajemen Kost Putri 3A (Athaya, Alya, Andayani)  |  ", "color": "333333", "size": "20"},
        {"text": "Edisi: ", "bold": True, "color": "666666", "size": "20"},
        {"text": "Lengkap & Mendalam (Production Ready)", "bold": True, "color": "2B5238", "size": "20"}
    ], space_before=0, space_after=260))

    # Bab 1
    body.append(heading1("BAB 1: Filosofi & Pola Interaksi Engineering bersama AI"))
    body.append(p(
        "Membangun aplikasi tingkat produksi (production-ready) yang mencakup antarmuka publik berkecepatan tinggi, formulir interaktif berkas PDF, dashboard SPA reaktif multi-role, basis data SQLite, hingga otomasi deployment ke server Linux membutuhkan paradigma komunikasi terstruktur."
    ))
    body.append(p(
        "Kesalahan paling umum yang sering dilakukan developer adalah menuliskan 'One Mega Prompt' (satu prompt panjang yang meminta seluruh web jadi seketika). Pola ini selalu menghasilkan kode yang dangkal, komponen yang disederhanakan secara berlebihan (mocked data), dependensi yang tidak terkelola, dan potensi celah keamanan (vulnerabilities)."
    ))
    
    body.append(heading2("1.1 Pola Kolaborasi: Architect-Lead vs Autonomous Implementer"))
    body.append(bullet("Peran Anda (Human Architect)", "Menentukan batas lingkup (boundaries), skema data, aturan keamanan, preferensi desain UI/UX, dan kriteria penerimaan (Acceptance Criteria)."))
    body.append(bullet("Peran AI (Senior Engineer)", "Menghasilkan implementasi kode bersih, modular, aman, bebas kerentanan, menjalankan pengujian lokal, dan memverifikasi fungsionalitas sebelum melakukan commit."))

    body.append(heading2("1.2 Struktur Prompt Efektif (Framework C-A-S-D)"))
    body.append(bullet("C - Context (Konteks)", "Nama bisnis, jumlah cabang, target pengguna (calon penghuni, penjaga, admin)."))
    body.append(bullet("A - Architecture & Stack (Teknologi)", "Menetapkan stack spesifik (Node.js, SQLite, React, Vite, Tailwind CSS) agar AI tidak mengimpor framework yang tidak diinginkan."))
    body.append(bullet("S - Specific Constraints (Batasan)", "Contoh: Tanpa ORM berat, npm audit 0, format Rupiah (Rp), zona waktu WIB (Asia/Jakarta), proteksi file database .db."))
    body.append(bullet("D - Definition of Done (Kriteria Selesai)", "Uji di localhost:3000, build lolos tanpa error, semua unit test hijau, dan verifikasi respons HTTP."))

    body.append(note_box(
        "Aturan Emas: Verifikasi Lokal Mandiri",
        "Selalu sertakan kalimat: 'Implementasikan dan jalankan di server lokal terlebih dahulu agar dapat saya review secara visual. Jangan lakukan push atau deploy ke VPS sebelum ada konfirmasi eksplisit dari saya.'"
    ))

    # Bab 2
    body.append(heading1("BAB 2: Cetak Biru (Blueprint) & Master Prompt"))
    body.append(p(
        "Sebelum menuliskan baris kode pertama, AI harus diberikan 'Master System Prompt' untuk mengunci pemahaman arsitektur menyeluruh dari sistem yang akan dibangun."
    ))

    body.append(heading2("2.1 Matriks Hak Akses (Role-Based Access Control)"))
    roles_table_headers = ["Fitur / Modul", "Pengunjung Publik", "Peran Penjaga", "Peran Admin"]
    roles_table_rows = [
        ["Landing Page & Galeri", "Lihat Penuh", "Lihat Penuh", "Lihat Penuh"],
        ["Pendaftaran Online", "Kirim & Unduh PDF", "Lihat Rekap", "Kelola & Verifikasi KTP"],
        ["Status Kamar", "Hanya Ketersediaan", "Ubah Status Operasional", "Kelola Tarif & Fasilitas"],
        ["Data Penghuni", "Tidak Ada Akses", "Lihat Nama & Kontak WA", "Edit Penuh & Kirim Tagihan"],
        ["Catat Transaksi", "Tidak Ada Akses", "Catat Transaksi Awal Check-In", "Pencatatan Penuh & Edit"],
        ["Laporan Keuangan & Laba", "Tidak Ada Akses", "Dibatasi (No Access)", "Akses Penuh & Ringkasan Laba"],
        ["Ekspor Data & Database", "Tidak Ada Akses", "Tidak Ada Akses", "Ekspor XLSX & Backup .db"]
    ]
    body.append(table_grid(roles_table_headers, roles_table_rows))

    body.append(heading2("2.2 Master Prompt (Spesifikasi Fondasi)"))
    master_prompt_content = [
        "Saya ingin membuat sistem aplikasi web manajemen dan promosi kost bernama \"Kost Tiga A\".",
        "Kost ini mengelola 3 properti cabang kost putri di lokasi berbeda: Athaya, Alya, dan Andayani.",
        "",
        "ARSITEKTUR & RUANG LINGKUP UTAMA:",
        "1. Landing Page Publik (Ultra-Fast & SEO Friendly):",
        "   - Pure Vanilla HTML5/CSS3/JavaScript (tanpa framework runtime client agar performa skor Lighthouse 95+).",
        "   - Tampilan bernuansa mewah, hangat, dan bersih: warna dominan Forest Green (#354C3F), aksen Beige (#E8E1D1), dan Warm White.",
        "   - Katalog kamar (tipe AC & Non-AC), daftar fasilitas, galeri foto, video room tour, dan indikator ketersediaan real-time.",
        "   - Formulir pendaftaran calon penghuni: input data identitas, nomor WhatsApp, kontak darurat wali, upload foto KTP,",
        "     persetujuan tata tertib, dan langsung mengunduh file Bukti Pendaftaran PDF resmi.",
        "   - Tombol reservasi WhatsApp yang terhubung langsung dengan pelacakan analitik klik per hari.",
        "",
        "2. Dashboard Operasional (Single Page Application - React):",
        "   - Menggunakan React 19 + Vite + Tailwind CSS + Lucide Icons + jsPDF.",
        "   - Multi-Role Authentication: Admin (akses keuangan, tarif kamar, approve pendaftar, ekspor laporan) dan Penjaga (operasional harian kamar, penghuni, keluhan).",
        "   - Modul Kamar: Status kamar (Tersedia, Terisi, Perbaikan), fasilitas default AC/Non-AC, harga sewa per bulan.",
        "   - Modul Penghuni: Rekap sewa, tanggal masuk, tanggal jatuh tempo, status bayar (Lunas, Pending, Overdue), dan tombol 1-klik kirim pesan WhatsApp pengingat tagihan.",
        "   - Modul Finansial: Arus kas masuk (income) dan keluar (expense), kategori operasional, perhitungan laba bersih, dan cetak kuitansi PDF resmi.",
        "   - Modul Keluhan: Penanganan komplain fasilitas, tingkat prioritas (Low, Medium, High), dan estimasi biaya perbaikan.",
        "   - Modul Pendaftar: Review berkas pendaftaran calon penghuni, verifikasi KTP, dan tombol 1-klik untuk langsung memindahkan pendaftar menjadi penghuni aktif.",
        "   - Ekspor Laporan: Menghasilkan file Excel resmi (.xlsx) asli berbasis OpenXML dan backup database SQLite (.db).",
        "",
        "3. Backend & Keamanan:",
        "   - Node.js (Express & native HTTP server) dengan basis data lokal SQLite (better-sqlite3).",
        "   - Autentikasi token berbasis HMAC SHA-256 yang aman dan stateless.",
        "   - Proteksi brute-force login berbasis IP address dan strict Content Security Policy (CSP).",
        "   - Single-Port Architecture: Port 3000 melayani landing page, fallback React Dashboard SPA, dan reverse-proxy ke API backend.",
        "",
        "Buatkan langkah implementasi terstruktur, dimulai dari inisialisasi struktur folder proyek dan skema database SQLite terlebih dahulu."
    ]
    body.append(prompt_box("Master System Prompt — Inisialisasi Arsitektur Proyek", master_prompt_content))

    # Bab 3
    body.append(heading1("BAB 3: Rekayasa Prompt Mendalam per Fase Pengembangan"))
    body.append(p("Berikut adalah rincian instruksi prompt spesifik per komponen teknis:"))

    # 3.1
    body.append(heading2("Fase 1: Landing Page Publik & Formulir Pendaftaran Mandiri"))
    body.append(p("Tujuan: Menciptakan halaman promosi dengan konversi tinggi dan pengumpulan data calon penghuni secara terstruktur."))
    
    prompt_fase1_1 = [
        "Buatkan halaman landing page publik (index.html) untuk Kost Putri Tiga A:",
        "- Terapkan desain visual warm minimalist dengan warna utama #354C3F, teks utama #242D28, dan latar belakang krem lembut #FDFCFA.",
        "- Bagian halaman:",
        "  1. Hero Header: Logo Kost 3A, judul sambutan hangat, tagline, dan tombol 'Lihat Kamar' & 'Daftar Sekarang'.",
        "  2. Profil 3 Cabang: Kost Athaya, Kost Alya, dan Kost Andayani beserta keunggulan lokasi masing-masing.",
        "  3. Video & Galeri Kamar: Player video responsif untuk tur kamar serta galeri foto kamar AC dan Non-AC.",
        "  4. Komparasi Tipe Kamar: Tabel fasilitas lengkap (Kamar mandi dalam, AC, kasur, lemari, WiFi, meja-kursi) dan tarif bulanan.",
        "  5. Fasilitas Bersama: Dapur bersama, kulkas, parkir motor, keamanan CCTV, dan area jemur.",
        "  6. Peta Lokasi Google Maps dan jam operasional kunjungan survei.",
        "- Optimalkan performa: tulis CSS secara terstruktur dan efisien tanpa dependensi framework eksternal."
    ]
    body.append(prompt_box("Prompt 1.1 — Antarmuka Visual Landing Page", prompt_fase1_1))

    prompt_fase1_2 = [
        "Tambahkan formulir pendaftaran calon penghuni interaktif pada landing page:",
        "- Field formulir:",
        "  * Pilihan Cabang Kost (Dropdown: Athaya / Alya / Andayani)",
        "  * Nama Lengkap, Nomor Induk Kependudukan (NIK 16 digit), Alamat Asal Kota/Provinsi",
        "  * Nomor WhatsApp Aktif (format 08xx)",
        "  * Nama Orang Tua / Wali dan Nomor WhatsApp Wali",
        "  * Kendaraan yang dibawa (Motor / Sepeda / Tidak Membawa)",
        "  * Upload Foto KTP (validasi tipe gambar JPEG/PNG/WebP, maksimal 5MB)",
        "  * Kotak persetujuan Tata Tertib Kost (wajib dicentang sebelum submit)",
        "- Integrasikan pembuatan Bukti Pendaftaran PDF otomatis di sisi browser menggunakan library jsPDF:",
        "  * PDF berisikan kop surat resmi Kost Tiga A, nomor registrasi unik, data identitas, timestamp WIB, dan barcode/QR stempel digital.",
        "  * File PDF otomatis diunduh oleh calon penghuni setelah pendaftaran berhasil disimpan ke server.",
        "- Endpoint penampung data: POST /api/register yang menyimpan berkas upload ke folder data/uploads dan mencatatnya ke database."
    ]
    body.append(prompt_box("Prompt 1.2 — Formulir Pendaftaran Online & Generator PDF", prompt_fase1_2))

    prompt_fase1_3 = [
        "Buatkan sistem pelacakan klik tombol reservasi WhatsApp dan analitik pengunjung:",
        "- Buatkan endpoint POST /api/click yang mencatat setiap kali pengunjung menekan tombol 'Tanya via WhatsApp' atau 'Hubungi Pengelola'.",
        "- Simpan data log secara efisien dalam format berkas terstruktur per hari.",
        "- Pastikan sistem mencatat timestamp dalam zona waktu Indonesia Barat (WIB / Asia/Jakarta).",
        "- Sediakan fungsi agregasi untuk menghitung jumlah pengunjung unik (unique visitors) dan jumlah konversi klik WhatsApp harian."
    ]
    body.append(prompt_box("Prompt 1.3 — Tracking Analitik WhatsApp & Pengunjung", prompt_fase1_3))

    # 3.2
    body.append(heading2("Fase 2: Skema Basis Data SQLite & Layanan Backend API"))
    body.append(p("Tujuan: Mengonfigurasi basis data relasional SQLite berkecepatan tinggi dengan proteksi autentikasi tangguh."))

    schema_headers = ["Nama Tabel", "Kolom Utama", "Keterangan Relasi & Tipe Data"]
    schema_rows = [
        ["rooms", "`number`, `locationId`, `type`, `price`, `status`, `tenantId`, `facilities`", "Data fisik 30 kamar, relasi ke tenantId saat terisi."],
        ["tenants", "`name`, `phone`, `ktp`, `roomNumber`, `entryDate`, `dueDate`, `paymentStatus`, `deposit`", "Data penghuni aktif, pelacakan jatuh tempo sewa."],
        ["transactions", "`date`, `type`, `category`, `amount`, `roomNumber`, `tenantName`, `note`", "Arus kas masuk (sewa) & kas keluar (listrik, air, perbaikan)."],
        ["complaints", "`roomNumber`, `tenantName`, `issue`, `date`, `status`, `priority`, `costEst`", "Keluhan fasilitas, estimasi biaya, dan status pengerjaan."],
        ["registrations", "`kost`, `fullName`, `nik`, `phone`, `guardianPhone`, `ktpImage`, `pdfFile`, `status`", "Arsip pendaftaran calon penghuni dari web publik."]
    ]
    body.append(table_grid(schema_headers, schema_rows))

    prompt_fase2_1 = [
        "Buatkan modul database SQLite menggunakan 'better-sqlite3' (file db.js):",
        "- Aktifkan WAL Mode (Write-Ahead Logging) untuk konkurensi tinggi dan performa read/write cepat.",
        "- Definisikan skema tabel terstruktur untuk: rooms, tenants, transactions, complaints, dan registrations.",
        "- Terapkan fungsi readAll() yang mengembalikan seluruh dataset dalam format JSON siap konsumsi oleh frontend.",
        "- Terapkan fungsi applyChanges(changes, options) yang mendukung mekanisme sinkronisasi data (inserts, updates, deletes) dalam satu transaksi database (atomic transaction).",
        "- Pastikan ada aturan pembatasan hak: jika role pengguna adalah 'penjaga', tolak perubahan pada transaksi finansial selain insert transaksi baru (pembayaran awal check-in)."
    ]
    body.append(prompt_box("Prompt 2.1 — Modul Database SQLite Atomic Transactions", prompt_fase2_1))

    prompt_fase2_2 = [
        "Bangun server REST API Node.js menggunakan Express (file server.js):",
        "- Konfigurasi variabel lingkungan (.env): PORT=5000, ADMIN_PASSWORD, PENJAGA_PASSWORD, SESSION_SECRET.",
        "- Endpoint POST /api/login:",
        "  * Validasi username dan password menggunakan crypto.timingSafeEqual untuk mencegah serangan timing-attack.",
        "  * Terapkan proteksi brute-force login: batasi maksimal 10 kegagalan login per alamat IP dalam jendela waktu 15 menit.",
        "  * Hasilkan token sesi bertandatangan HMAC SHA-256 yang memuat role ('admin' atau 'penjaga') dan waktu kedaluwarsa 30 hari.",
        "- Middleware requireAuth dan requireAdmin untuk memvalidasi header 'Authorization: Bearer <token>'.",
        "- Endpoint GET /api/data: Mengembalikan data kamar, penghuni, keluhan, dan transaksi (khusus admin).",
        "- Endpoint POST /api/sync: Menerima payload perubahan dari dashboard dan mengeksekusinya ke database secara atomic."
    ]
    body.append(prompt_box("Prompt 2.2 — Layanan API & Autentikasi HMAC Token", prompt_fase2_2))

    prompt_fase2_3 = [
        "Konfigurasikan integrasi Single-Port Architecture pada server utama port 3000:",
        "- Server utama melayani landing page statis publik di root '/'.",
        "- Ketika rute diawali dengan '/dashboard':",
        "  * Sajikan berkas produksi React SPA dari folder 'dashboard/dist/index.html' (SPA client-side routing fallback).",
        "- Ketika rute diawali dengan '/api' atau '/dashboard/api':",
        "  * Lakukan reverse-proxy transparan ke layanan backend API yang berjalan di port 5000.",
        "- Terapkan header keamanan otomatis: Content-Security-Policy (CSP), X-Content-Type-Options: nosniff, dan Cache-Control no-store pada data dinamis."
    ]
    body.append(prompt_box("Prompt 2.3 — Single-Port Routing & Reverse Proxy", prompt_fase2_3))

    # 3.3
    body.append(heading2("Fase 3: Dashboard React SPA (Multi-Role Management)"))
    body.append(p("Tujuan: Membangun dashboard manajemen operasional yang responsif, intuitif, dan memudahkan pekerjaan sehari-hari."))

    prompt_fase3_1 = [
        "Inisialisasi aplikasi dashboard React menggunakan Vite dan Tailwind CSS di folder /dashboard:",
        "- Pasang pustaka pendukung: lucide-react (ikon UI) dan jspdf (cetak kuitansi).",
        "- Bangun sistem state manajemen terpusat dengan dukungan sinkronisasi berkala (polling tiap 15 detik).",
        "- Layar Login:",
        "  * Pilihan peran login (Admin / Penjaga).",
        "  * Form username dan password dengan indikator error yang informatif.",
        "- Navigasi Utama (HeaderNav):",
        "  * Logo Kost 3A, indikator status sinkronisasi server, badge role pengguna, tab navigasi, dropdown menu ekspor, dan tombol logout.",
        "  * Batasi tab navigasi berdasarkan role: Penjaga hanya melihat tab Kamar, Penghuni, Keluhan, dan Pendaftar; Admin melihat seluruh tab termasuk Dashboard Finansial."
    ]
    body.append(prompt_box("Prompt 3.1 — Setup React Dashboard & State Sync", prompt_fase3_1))

    prompt_fase3_2 = [
        "Bangun Tab Overview (Dashboard Finansial & Operasional untuk Admin):",
        "- Kartu Metrik KPI Atas:",
        "  1. Tingkat Hunian (Occupancy Rate %) dengan visual progress bar dinamis.",
        "  2. Total Kamar Terisi vs Kamar Kosong vs Kamar Perbaikan.",
        "  3. Total Pemasukan Bulan Ini (Rp), Total Pengeluaran (Rp), dan Laba Bersih (Net Profit).",
        "  4. Jumlah Tagihan Sewa Jatuh Tempo (Overdue) dan Jumlah Keluhan Terbuka.",
        "- Panel Aksi Cepat: Tombol 'Check-In Penghuni Baru', 'Catat Kas Masuk/Keluar', dan 'Input Keluhan'.",
        "- Widget Notifikasi Jatuh Tempo: Menampilkan nama penghuni, nomor kamar, dan jumlah tunggakan dengan tombol pintas kirim WhatsApp reminder."
    ]
    body.append(prompt_box("Prompt 3.2 — Tab Overview & Ringkasan Finansial", prompt_fase3_2))

    prompt_fase3_3 = [
        "Bangun Tab Manajemen Kamar (RoomsView) dan Tab Penghuni (TenantsView):",
        "1. Modul Kamar:",
        "   - Filter kamar per lokasi cabang: Kost Athaya (prefix 1xx), Kost Alya (prefix 2xx), Kost Andayani (prefix 3xx).",
        "   - Kartu visual tiap kamar dengan warna status: Hijau (Tersedia), Biru (Terisi), Kuning (Perbaikan).",
        "   - Modal edit kamar: ubah harga sewa, pilih fasilitas default (AC/Non-AC), dan catatan kondisi kamar.",
        "2. Modul Penghuni:",
        "   - Tabel lengkap: Nama, Nomor Kamar, Nomor WhatsApp, Tanggal Masuk, Tanggal Jatuh Tempo, dan Status Pembayaran (Badge: Lunas / Pending / Overdue).",
        "   - Fitur WhatsApp Reminder 1-Klik:",
        "     * Saat tombol ditekan, otomatis membuka tautan wa.me dengan pesan otomatis:",
        "       'Halo Kak [Nama], pengingat tagihan sewa kamar [Nomor Kamar] di Kost Tiga A sebesar Rp [Nominal] jatuh tempo pada [Tanggal]. Pembayaran dapat ditransfer ke rekening ... Terima kasih!'",
        "   - Modal Check-In: Input data penghuni baru dan otomatis memperbarui status kamar menjadi 'Terisi'."
    ]
    body.append(prompt_box("Prompt 3.3 — Modul Kamar, Penghuni & WhatsApp Reminder", prompt_fase3_3))

    prompt_fase3_4 = [
        "Bangun Tab Manajemen Pendaftar (RegistrationsView) dan Tab Keluhan (ComplaintsView):",
        "1. Modul Pendaftar:",
        "   - Tabel pendaftar online yang masuk dari formulir landing page publik.",
        "   - Kolom: Tanggal daftar, Pilihan Kost, Nama Lengkap, NIK, No WA, Asal, Nama Wali, dan Preview Foto KTP.",
        "   - Aksi: Tombol 'Lihat Berkas PDF Pendaftaran' dan tombol 'Setujui & Jadikan Penghuni' yang langsung membuka modal pemilihan kamar kosong.",
        "2. Modul Keluhan:",
        "   - Pelacakan aduan kerusakan fasilitas dari penghuni.",
        "   - Tingkat prioritas (Low, Medium, High) dan estimasi biaya perbaikan.",
        "   - Status pengerjaan: Terbuka (Open) -> Sedang Dikerjakan (In Progress) -> Selesai (Resolved)."
    ]
    body.append(prompt_box("Prompt 3.4 — Modul Verifikasi Pendaftar & Keluhan", prompt_fase3_4))

    # 3.4
    body.append(heading2("Fase 4: Cetak Kuitansi Pembayaran & Ekspor Excel Asli (.xlsx)"))
    body.append(p("Tujuan: Menyediakan fitur pelaporan dokumen resmi yang rapi dan dapat dibuka langsung di Microsoft Excel tanpa peringatan error."))

    prompt_fase4_1 = [
        "Buatkan komponen Modal Cetak Kuitansi Pembayaran Resmi menggunakan jsPDF:",
        "- Format kuitansi siap cetak ukuran A5 atau format struk profesional:",
        "  * Header: Logo Kost Tiga A, Alamat, dan Kontak Pengelola.",
        "  * Nomor Kuitansi otomatis: Format 'KW/3A/YYYYMM/XXXX'.",
        "  * Telah Diterima Dari: Nama Penghuni.",
        "  * Uang Sejumlah: Nominal angka dan fungsi konversi terbilang otomatis (contoh: 'Satu Juta Lima Ratus Ribu Rupiah').",
        "  * Untuk Pembayaran: Keterangan sewa kamar (misal: 'Sewa Kamar 102 Kost Athaya Periode November 2026').",
        "  * Bagian tanda tangan: Tanggal cetak, stempel digital lunas, dan nama pengelola kost.",
        "- Opsi pratinjau langsung di modal dan tombol 'Unduh PDF Kuitansi'."
    ]
    body.append(prompt_box("Prompt 4.1 — Generator Kuitansi Pembayaran Resmi (PDF)", prompt_fase4_1))

    prompt_fase4_2 = [
        "Buatkan modul backend untuk mengekspor data ke file Excel asli (.xlsx) tanpa menggunakan library berat yang memiliki celah keamanan:",
        "- Gunakan library ringan 'fflate' (zero dependency, zero vulnerability) untuk menghasilkan format resmi OpenXML (.xlsx).",
        "- Struktur file zip OpenXML yang dihasilkan:",
        "  1. [Content_Types].xml (registrasi sheet.main, worksheet, dan styles).",
        "  2. _rels/.rels dan xl/_rels/workbook.xml.rels.",
        "  3. xl/workbook.xml dan xl/styles.xml.",
        "  4. xl/worksheets/sheet1.xml berisikan data baris tabel.",
        "- Aturan styling & format cell penting:",
        "  * Header tabel diberi background warna hijau Kost #354C3F dengan teks tebal warna putih.",
        "  * Kolom angka uang (nominal, harga, estimasi biaya) diformat dengan numFmtId='164' (#,##0) agar di Excel langsung dikenali sebagai angka numerik dan dapat di-SUM.",
        "  * Kolom NIK (16 digit) dan Nomor Telepon/WhatsApp (awalan 08...) diformat eksplisit sebagai teks string ('@' format) agar awalan angka nol '0' tidak hilang dan tidak terpotong menjadi notasi ilmiah (scientific notation).",
        "- Pasang di endpoint GET /api/export/:name (kamar.xlsx, penghuni.xlsx, keuangan.xlsx, keluhan.xlsx, pendaftar.xlsx) dengan MIME type 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'.",
        "- Pastikan saat dibuka di Microsoft Excel, file terbuka lancar tanpa memunculkan dialog 'The file format and extension don't match'."
    ]
    body.append(prompt_box("Prompt 4.2 — Generator OpenXML Excel Asli (.xlsx)", prompt_fase4_2))

    # 3.5
    body.append(heading2("Fase 5: Pengujian, Keamanan & Hardening Sistem"))
    body.append(p("Tujuan: Memastikan kestabilan fungsionalitas dan keamanan sebelum aplikasi dipublikasikan."))

    prompt_fase5_1 = [
        "Tuliskan rangkaian unit test komprehensif menggunakan native Node.js Test Runner (node --test):",
        "- Buatkan berkas test/server.test.js yang menguji 24 skenario utama:",
        "  1. Layanan halaman statis landing page publik dan kompresi konten.",
        "  2. Validasi byte ranges untuk streaming video room tour.",
        "  3. Pengujian keamanan: blokir akses ke direktori terlarang (/data, /.git, /scripts).",
        "  4. Validasi ETag dan caching headers.",
        "  5. Pelacakan klik WhatsApp dengan batasan rate-limiting.",
        "  6. Proteksi autentikasi admin dan penjaga dengan HMAC token.",
        "  7. Pengujian endpoint pendaftaran online calon penghuni dan arsip PDF.",
        "  8. Pengujian endpoint ekspor data spreadsheet.",
        "  9. Pengujian penyajian SPA React Dashboard pada rute /dashboard/*.",
        "- Pastikan seluruh tes dapat dijalankan dengan perintah 'npm test' dan lolos 100% hijau."
    ]
    body.append(prompt_box("Prompt 5.1 — Rangkaian Pengujian Otomatis (Unit Testing)", prompt_fase5_1))

    prompt_fase5_2 = [
        "Lakukan audit keamanan dan hardening pada seluruh aplikasi:",
        "- Jalankan 'npm audit' di root dan folder dashboard/server untuk memastikan tidak ada celah keamanan (found 0 vulnerabilities).",
        "- Terapkan sanitasi input pada pencatatan CSV/Excel untuk mencegah serangan CSV Formula Injection (=, +, -, @).",
        "- Pastikan file upload KTP hanya disimpan di direktori data/uploads yang terisolasi dan hanya dapat diunduh oleh sesi terautentikasi.",
        "- Konfigurasikan CSP strict dengan SHA-256 script hashing otomatis saat server dijalankan."
    ]
    body.append(prompt_box("Prompt 5.2 — Hardening Keamanan & Validasi Celah Keamanan", prompt_fase5_2))

    # 3.6
    body.append(heading2("Fase 6: Otomasi Deployment ke Production VPS"))
    body.append(p("Tujuan: Menciptakan alur kerja penyebaran kode (deployment) yang aman, cepat, dan zero-downtime."))

    prompt_fase6_1 = [
        "Buatkan skrip otomasi deployment berbasis PowerShell (deploy.ps1) untuk VPS Linux:",
        "- Prasyarat & Validasi Awal:",
        "  * Periksa apakah SSH Key admin tersedia di path lokal.",
        "  * Cek 'git status --porcelain', batalkan deploy bila masih ada perubahan yang belum di-commit.",
        "  * Otomatis perbarui tanggal dan jam pada label 'Terakhir diperbarui' dalam format WIB di seluruh halaman web.",
        "- Tahap Build Lokal:",
        "  * Masuk ke folder dashboard dan jalankan 'npm ci' serta 'npm run build'.",
        "- Tahap Sinkronisasi & Transfer:",
        "  * Lakukan 'git push origin main' ke repository GitHub.",
        "  * Kirim berkas kode site ke VPS melalui arsip tar SSH tanpa mengecualikan file konfigurasi lokal.",
        "  * Buat arsip tar.gz dari dashboard/dist, upload ke VPS via SCP, dan ekstrak ke direktori /var/www/kost-tiga-a.web.id/dashboard/dist.",
        "- Tahap Eksekusi Remote di VPS:",
        "  * Jalankan 'npm ci --omit=dev' pada backend server dashboard di VPS.",
        "  * Restart proses aplikasi di PM2: 'pm2 restart kost-tiga-a && pm2 restart dashboard-kost --update-env'.",
        "  * Lakukan curl health-check ke http://127.0.0.1:3000 dan endpoint API untuk memastikan server aktif merespons 200 OK."
    ]
    body.append(prompt_box("Prompt 6.1 — Skrip PowerShell Deploy Otomatis (deploy.ps1)", prompt_fase6_1))

    # Bab 4
    body.append(heading1("BAB 4: Kamus Troubleshooting — Prompt Perbaikan Error"))
    body.append(p(
        "Ketika berkolaborasi dengan AI, terkadang muncul kendala teknis tak terduga. Gunakan prompt koreksi terarah berikut untuk menyelesaikan masalah umum dengan cepat:"
    ))

    body.append(trouble_box(
        "Peringatan 'File Format and Extension Don't Match' di Excel",
        "File hasil download berekstensi .xls tetapi saat dibuka di Microsoft Excel muncul pop-up peringatan keamanan karena isi file sebenarnya adalah tabel HTML.",
        "Format ekspor .xls yang dihasilkan saat ini memicu peringatan format mismatch di Excel karena isinya masih berupa HTML table. Tolong perbaiki dengan menghasilkan file OpenXML Spreadsheet (.xlsx) asli menggunakan library ringan fflate. Pastikan MIME type diubah menjadi 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' dan ekstensi file menjadi .xlsx."
    ))

    body.append(trouble_box(
        "Angka Nol Depan Hilang pada Nomor WhatsApp atau NIK Terpotong",
        "Nomor telepon 08123456789 berubah menjadi 8123456789 atau NIK 16 digit berubah menjadi 3.5021E+15 di Excel.",
        "Di file ekspor Excel, tolong tetapkan tipe kolom untuk NIK dan Nomor Telepon secara eksplisit sebagai teks string dengan format styling '@' (mso-number-format:'\\@'). Jangan simpan sebagai angka numerik agar awalan angka 0 tidak hilang dan NIK 16 digit tidak berubah menjadi notasi ilmiah."
    ))

    body.append(trouble_box(
        "Halaman Dashboard Mengalami 404 Not Found Saat Refresh Browser",
        "Pada React SPA, saat halaman direfresh pada rute seperti /dashboard/rooms, server mengembalikan error 404 karena rute tersebut tidak memiliki berkas fisik di server.",
        "Terapkan SPA Client-Side Routing Fallback di server.js: Untuk setiap request GET yang jalurnya diawali dengan '/dashboard' dan bukan berkas statis (seperti .js, .css, .png), server harus menyajikan berkas 'dashboard/dist/index.html' agar React Router dapat menangani rute tersebut di sisi klien."
    ))

    body.append(trouble_box(
        "EPERM: Operation Not Permitted saat Build Vite di Windows",
        "Perintah npm run build gagal dengan pesan error EPERM / file locked pada node_modules/lightningcss atau file aset.",
        "Error EPERM ini disebabkan ada proses background lokal yang sedang menjalankan 'vite dev server' dan mengunci binary asli. Tolong hentikan proses dev server yang sedang berjalan terlebih dahulu, lalu jalankan kembali 'npm run build'."
    ))

    # Bab 5
    body.append(heading1("BAB 5: Kesimpulan & Daftar Periksa (Checklist) Produksi"))
    body.append(p(
        "Gunakan daftar periksa berikut sebagai acuan verifikasi sebelum meluncurkan aplikasi ke lingkungan produksi:"
    ))
    
    checklist_headers = ["Area Pemeriksaan", "Kriteria Kualitas", "Status Verifikasi"]
    checklist_rows = [
        ["Desain & Responsivitas", "Tampilan rapi di Mobile (layar HP), Tablet, dan Desktop.", "Wajib Lolos"],
        ["Formulir Pendaftaran", "Upload KTP berhasil, validasi ukuran file, bukti PDF terunduh.", "Wajib Lolos"],
        ["Hak Akses Role", "Penjaga tidak bisa melihat laporan laba bersih dan mutasi kas Admin.", "Wajib Lolos"],
        ["Pelacakan Tagihan", "Status jatuh tempo akurat dan tombol reminder WhatsApp berfungsi.", "Wajib Lolos"],
        ["Laporan Excel", "File .xlsx asli, terunduh lancar, tanpa peringatan error di MS Excel.", "Wajib Lolos"],
        ["Kuitansi PDF", "Kuitansi tercetak rapi dengan nomor seri dan konversi terbilang.", "Wajib Lolos"],
        ["Keamanan Sistem", "npm audit menunjukkan 0 vulnerabilities, CSP aktif, rate-limit jalan.", "Wajib Lolos"],
        ["Otomasi Deploy", "deploy.ps1 berhasil melakukan build, transfer, dan restart PM2.", "Wajib Lolos"]
    ]
    body.append(table_grid(checklist_headers, checklist_rows))

    body.append(p("", space_before=100, space_after=100))
    body.append(p("© 2026 Kost Tiga A. Dokumen Cetak Biru Rekayasa Prompt AI untuk Pengembangan Web.", italic=True, color="666666", size="18", align="center"))

    # Assemble Document XML
    doc_body = "".join(body)
    document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {doc_body}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>'''

    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>'''

    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>'''

    doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>'''

    styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/>
        <w:sz w:val="22"/>
        <w:color w:val="2C3531"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr>
      <w:spacing w:line="276" w:lineRule="auto" w:after="120"/>
    </w:pPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListParagraph">
    <w:name w:val="List Paragraph"/>
    <w:basedOn w:val="Normal"/>
    <w:pPr>
      <w:ind w:left="400"/>
      <w:spacing w:after="80"/>
    </w:pPr>
  </w:style>
</w:styles>'''

    os.makedirs(os.path.dirname(os.path.abspath(filename)), exist_ok=True)
    with zipfile.ZipFile(filename, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', content_types)
        z.writestr('_rels/.rels', root_rels)
        z.writestr('word/_rels/document.xml.rels', doc_rels)
        z.writestr('word/document.xml', document_xml)
        z.writestr('word/styles.xml', styles_xml)

    print(f"File DOCX Detail berhasil dibuat: {filename}")

if __name__ == '__main__':
    paths = [
        r"c:\Users\Iwan\Documents\kost-tiga-a\kost-tiga-a.web.id\Panduan-Prompt-AI-Kost-Tiga-A.docx",
        r"c:\Users\Iwan\Documents\kost-tiga-a\kost-tiga-a.web.id\Panduan-Prompt-AI-Kost-Tiga-A-Lengkap.docx",
        r"c:\Users\Iwan\Documents\kost-tiga-a\Panduan-Prompt-AI-Kost-Tiga-A-Lengkap.docx",
        r"c:\Users\Iwan\Documents\kost-tiga-a\Panduan-Prompt-AI-Kost-Tiga-A.docx",
    ]
    for p in paths:
        try:
            create_detailed_docx(p)
        except PermissionError:
            print(f"File sedang dibuka di aplikasi lain: {p} (lewati)")
