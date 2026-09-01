/** Halaman pengaturan presensi, terpisah dari kendali inti Beregam. */
export const HALAMAN_PRESENSI = String.raw`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pengingat Presensi - Beregam</title>
<style>
  :root { --bg:#0f172a;--card:#1e293b;--line:#334155;--text:#e2e8f0;--muted:#94a3b8;--blue:#38bdf8;--green:#22c55e;--red:#ef4444;--amber:#f59e0b; }
  @media(prefers-color-scheme:light){:root{--bg:#f1f5f9;--card:#fff;--line:#cbd5e1;--text:#0f172a;--muted:#64748b}}
  *{box-sizing:border-box} body{margin:0;padding:18px;background:var(--bg);color:var(--text);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
  .wrap{max-width:1160px;margin:auto}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}.top h1{font-size:24px;margin:0}.muted{color:var(--muted);font-size:13px}a{color:var(--blue);text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
  .grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,.9fr);gap:15px;margin-top:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px}.wide{grid-column:1/-1}h2{font-size:16px;margin:0 0 12px}h3{font-size:14px;margin:16px 0 8px}.row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:5px 0}.pills{display:flex;gap:7px;flex-wrap:wrap}.pill{border:1px solid var(--line);border-radius:999px;padding:4px 9px;font-size:12px}.ok{color:var(--green)}.bad{color:var(--red)}.warn{color:var(--amber)}
  button{font:inherit;border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:8px;padding:8px 13px;cursor:pointer}button:hover:not(:disabled){border-color:var(--blue)}button:disabled{opacity:.5;cursor:not-allowed}.primary{background:var(--blue);border-color:var(--blue);color:#04121e;font-weight:700}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  label.option{display:flex;align-items:flex-start;gap:9px;padding:8px 0;cursor:pointer}input[type=checkbox],input[type=radio]{width:17px;height:17px;margin-top:3px;accent-color:var(--blue)}textarea{width:100%;min-height:150px;resize:vertical;background:var(--bg);color:var(--text);border:1px solid var(--line);border-radius:9px;padding:11px;font:14px/1.5 system-ui}.count{text-align:right;color:var(--muted);font-size:12px}.preview{white-space:pre-wrap;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px;min-height:120px;overflow-wrap:anywhere}
  .people{border:1px solid var(--line);border-radius:9px;max-height:430px;overflow:auto}.person{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 11px;border-bottom:1px solid var(--line)}.person:last-child{border-bottom:0}.number{font-variant-numeric:tabular-nums;font-weight:650}.role{font-size:12px;color:var(--muted)}.self{opacity:.6}.missing{border-left:3px solid var(--amber)}
  table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600}.message{max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.notice{margin-top:12px;border-left:3px solid var(--blue);padding:9px 12px;background:color-mix(in srgb,var(--blue) 9%,transparent);border-radius:0 8px 8px 0}.error{border-left-color:var(--red)}
  @media(max-width:800px){body{padding:12px}.grid{grid-template-columns:1fr}.card{padding:14px}.wide{grid-column:auto}.table-wrap{overflow-x:auto}.message{max-width:220px}}
</style>
</head>
<body><main class="wrap">
  <div class="top"><div><h1>Pengingat Presensi</h1><div class="muted">Modul lokal terpisah - perubahan tersimpan tanpa restart worker</div></div><a href="/">← Kembali ke Panel Beregam</a></div>
  <div id="notice"></div>
  <div class="grid">
    <section class="card">
      <h2>Status & jadwal</h2>
      <div class="row"><span>Grup</span><strong id="group">memuat...</strong></div>
      <div class="row"><span>Peserta terbaca</span><strong id="participant-count">-</strong></div>
      <label class="option"><input id="enabled" type="checkbox"><span><strong>Aktifkan pengingat otomatis</strong><br><span class="muted">Saklar utama bot Beregam tetap berlaku.</span></span></label>
      <h3>Senin-Kamis</h3><div class="pills"><span class="pill">Datang 07:25</span><span class="pill">Datang 07:29</span><span class="pill">Pulang 16:00</span><span class="pill">16:05</span><span class="pill">16:10</span><span class="pill">16:30</span></div>
      <h3>Jumat</h3><div class="pills"><span class="pill">Datang 07:25</span><span class="pill">Datang 07:29</span><span class="pill">Pulang 16:30</span><span class="pill">16:35</span><span class="pill">16:40</span><span class="pill">17:00</span></div>
    </section>

    <section class="card">
      <h2>Penerima mention</h2>
      <label class="option"><input name="mode" type="radio" value="semua"><span><strong>Semua anggota aktif</strong><br><span class="muted">Anggota baru otomatis ikut ditandai.</span></span></label>
      <label class="option"><input name="mode" type="radio" value="pilihan"><span><strong>Nomor yang dipilih</strong><br><span class="muted">Hanya nomor tercentang yang ditandai.</span></span></label>
      <div class="actions"><button id="select-all">Pilih semua</button><button id="clear-all">Kosongkan</button><button id="refresh">Segarkan anggota</button></div>
      <div class="muted" style="margin:10px 0">Terpilih: <strong id="selected-count">0</strong> nomor</div>
      <div class="people" id="people"><div class="person">memuat...</div></div>
    </section>

    <section class="card">
      <h2>Pesan presensi datang</h2>
      <textarea id="arrival" maxlength="2000"></textarea><div class="count"><span id="arrival-count">0</span>/2000</div>
      <h3>Pratinjau</h3><div class="preview" id="arrival-preview"></div>
    </section>
    <section class="card">
      <h2>Pesan presensi pulang</h2>
      <textarea id="departure" maxlength="2000"></textarea><div class="count"><span id="departure-count">0</span>/2000</div>
      <h3>Pratinjau</h3><div class="preview" id="departure-preview"></div>
    </section>

    <section class="card wide">
      <div class="top"><div><h2 style="margin:0">Simpan pengaturan</h2><div class="muted" id="updated">Belum pernah disimpan</div></div><button class="primary" id="save">Simpan Perubahan</button></div>
    </section>

    <section class="card wide">
      <h2>Riwayat pengiriman</h2>
      <div class="table-wrap"><table><thead><tr><th>Waktu WIB</th><th>Jenis</th><th>Status</th><th>Mention</th><th>Pesan</th></tr></thead><tbody id="history"></tbody></table></div>
    </section>
  </div>
</main>
<script>
const $ = function(id){ return document.getElementById(id); };
let data = null;
let selected = new Set();

function notice(message, error){
  var box = $("notice");
  if(!message){ box.replaceChildren(); return; }
  var item=document.createElement("div"); item.className="notice"+(error?" error":""); item.textContent=message; box.replaceChildren(item);
}
function roleName(role){ return role==="superadmin"?"Superadmin":role==="admin"?"Admin":"Anggota"; }
function formatWib(value){ try{return new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"medium",timeStyle:"short"}).format(new Date(value));}catch{return "-";} }
function mode(){ var item=document.querySelector('input[name="mode"]:checked'); return item?item.value:"semua"; }

function updateCounts(){
  $("selected-count").textContent=String(selected.size);
  $("arrival-count").textContent=String($("arrival").value.length);
  $("departure-count").textContent=String($("departure").value.length);
  $("arrival-preview").textContent=$("arrival").value+"\n\n📣 @peserta-terpilih";
  $("departure-preview").textContent=$("departure").value+"\n\n📣 @peserta-terpilih";
}

function renderPeople(){
  var root=$("people"); root.replaceChildren();
  var people=(data&&data.peserta)||[];
  var current=new Set(people.map(function(p){return p.nomor;}));
  people.forEach(function(person){
    var row=document.createElement("label"); row.className="person"+(person.diriSendiri?" self":"");
    var input=document.createElement("input"); input.type="checkbox"; input.checked=selected.has(person.nomor); input.disabled=person.diriSendiri;
    input.onchange=function(){ if(input.checked)selected.add(person.nomor);else selected.delete(person.nomor);updateCounts(); };
    var info=document.createElement("div"); var number=document.createElement("div"); number.className="number"; number.textContent="+"+person.nomor;
    var meta=document.createElement("div"); meta.className="role"; meta.textContent=roleName(person.peran)+(person.diriSendiri?" · akun bot":""); info.append(number,meta);
    var status=document.createElement("span"); status.className="ok"; status.textContent="Aktif"; row.append(input,info,status); root.append(row);
  });
  Array.from(selected).filter(function(n){return !current.has(n);}).forEach(function(numberValue){
    var row=document.createElement("div");row.className="person missing";var marker=document.createElement("span");marker.textContent="!";
    var info=document.createElement("div");var number=document.createElement("div");number.className="number";number.textContent="+"+numberValue;var meta=document.createElement("div");meta.className="role";meta.textContent="Nomor tersimpan tetapi tidak lagi terbaca di grup";info.append(number,meta);
    var remove=document.createElement("button");remove.textContent="Hapus";remove.onclick=function(){selected.delete(numberValue);renderPeople();updateCounts();};row.append(marker,info,remove);root.append(row);
  });
  if(!root.children.length){var empty=document.createElement("div");empty.className="person";empty.textContent="Belum ada peserta yang dapat dibaca.";root.append(empty);}
}

function renderHistory(){
  var root=$("history");root.replaceChildren();var rows=(data&&data.riwayat)||[];
  rows.forEach(function(item){var tr=document.createElement("tr");[formatWib(item.waktu),item.jenis==="datang"?"Datang":"Pulang",item.status+(!item.adaMessageId&&item.status==="terkirim"?" (tanpa ID)":""),String(item.jumlahMention),item.pesan].forEach(function(value,index){var td=document.createElement("td");td.textContent=value;if(index===2)td.className=item.status==="terkirim"?"ok":"bad";if(index===4){td.className="message";td.title=value;}tr.append(td);});root.append(tr);});
  if(!rows.length){var tr=document.createElement("tr");var td=document.createElement("td");td.colSpan=5;td.className="muted";td.textContent="Belum ada riwayat pengiriman.";tr.append(td);root.append(tr);}
}

async function load(showMessage){
  try{var response=await fetch("/api/presensi",{cache:"no-store"});var result=await response.json();if(!response.ok)throw new Error(result.pesan||"Data gagal dimuat.");data=result;selected=new Set(result.konfigurasi.nomorDipilih||[]);
    $("enabled").checked=result.konfigurasi.aktif;document.querySelector('input[name="mode"][value="'+result.konfigurasi.modeMention+'"]').checked=true;
    $("arrival").value=result.konfigurasi.pesanDatang;$("departure").value=result.konfigurasi.pesanPulang;$("group").textContent=result.grup.nama;$("group").className=result.grup.ok?"ok":"bad";
    $("participant-count").textContent=String(result.peserta.filter(function(p){return !p.diriSendiri;}).length);$("updated").textContent=result.konfigurasi.updatedAt?"Terakhir disimpan "+formatWib(result.konfigurasi.updatedAt):"Belum pernah disimpan - memakai pengaturan bawaan";
    renderPeople();renderHistory();updateCounts();if(showMessage)notice("Daftar anggota berhasil disegarkan.",false);else if(!result.grup.ok)notice(result.grup.pesan||"Grup tidak dapat dibaca.",true);else notice("",false);
  }catch(error){notice(error instanceof Error?error.message:"Data gagal dimuat.",true);}
}

$("arrival").oninput=updateCounts;$("departure").oninput=updateCounts;
$("select-all").onclick=function(){((data&&data.peserta)||[]).filter(function(p){return !p.diriSendiri;}).forEach(function(p){selected.add(p.nomor);});renderPeople();updateCounts();};
$("clear-all").onclick=function(){selected.clear();renderPeople();updateCounts();};
$("refresh").onclick=function(){load(true);};
$("save").onclick=async function(){var button=$("save");button.disabled=true;notice("Menyimpan...",false);try{var response=await fetch("/api/presensi/config",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({aktif:$("enabled").checked,modeMention:mode(),nomorDipilih:Array.from(selected),pesanDatang:$("arrival").value,pesanPulang:$("departure").value})});var result=await response.json();if(!response.ok||!result.ok)throw new Error(result.pesan||"Gagal menyimpan.");data.konfigurasi=result.konfigurasi;$("updated").textContent="Terakhir disimpan "+formatWib(result.konfigurasi.updatedAt);notice("Pengaturan tersimpan. Worker akan memakainya pada jadwal berikutnya tanpa restart.",false);}catch(error){notice(error instanceof Error?error.message:"Gagal menyimpan.",true);}finally{button.disabled=false;}};
load(false);
</script></body></html>`;

