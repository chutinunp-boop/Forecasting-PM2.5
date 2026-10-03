// ===== พิกัดสถานี (ประมาณจากภาพตัวอย่าง — แก้ให้ตรงกับสถานีจริงได้) =====
const STATIONS = {
  '73t': {name: 'สถานี 73t', lat: 20.44, lng: 99.88},
  '70t': {name: 'สถานี 70t', lat: 19.20, lng: 99.88},
  '97t': {name: 'สถานี 97t', lat: 16.41, lng: 101.16},
  '98t': {name: 'สถานี 98t', lat: 15.37, lng: 100.02}
};
// เกณฑ์ระดับคุณภาพอากาศจากค่าฝุ่น PM2.5 (ตารางที่ 7: AQI US / µg/m³ / สี)
const LEVELS = [
  {max: 12,  color: '#0b9a1d', label: 'ดี (0–12)'},
  {max: 35,  color: '#ffcc00', label: 'ปานกลาง (12–35)', dark: true},
  {max: 55,  color: '#ff9933', label: 'เริ่มมีผลกระทบต่อสุขภาพ (35–55)'},
  {max: 150, color: '#f5211f', label: 'มีผลกระทบต่อสุขภาพ (55–150)'},
  {max: 250, color: '#7030a0', label: 'มีผลกระทบรุนแรง (150–250)'},
  {max: 1e9, color: '#4b2068', label: 'อันตรายมาก (≥250)'}
];
const level = v => v == null ? {color: '#aaa'} : LEVELS.find(l => v <= l.max);
const $ = id => document.getElementById(id);

// ===== เวลา =====
const p2 = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:00`;
const shift = (k, h) => { const d = new Date(k + ':00'); d.setHours(d.getHours() + h); return fmt(d); };
const show = k => { const d = new Date(k + ':00'); return `${d.getDate()}/${d.getMonth()+1} ${p2(d.getHours())}:00`; };
// เฉพาะรอบพยากรณ์ที่ทำนายได้ครบ 12 ชม. (รอบท้ายสัปดาห์ที่เป้าหมายเกินช่วงข้อมูลจะถูกตัดออก)
const HMAX = 12;
// รอบพยากรณ์ทุกชั่วโมง (24 รอบต่อวัน): แต่ละรอบใช้ข้อมูลจริงย้อนหลัง 24 ชม. นับถึงชั่วโมงนั้น -> ทำนายล่วงหน้า 12 ชม.
const ORIGINS = Object.keys(DATA['70t'].forecast).filter(o => Object.keys(DATA['70t'].forecast[o]).length >= HMAX).sort();
const getActual = (s, k) => DATA[s].actual[k] ?? DATA[s].persistence[k] ?? null;

// ===== state =====
const S = {h: 1, basis: 'fc', o: 0};   // o = ลำดับรอบพยากรณ์ (ทุกชั่วโมง), h = ล่วงหน้ากี่ชม. (1-12)
const val = (s, basis = S.basis) => { const o = ORIGINS[S.o], k = shift(o, S.h);
  return basis === 'fc' ? (DATA[s].forecast[o]?.[S.h] ?? null) : basis === 'act' ? getActual(s, k) : (DATA[s].persistence[o] ?? null); };

// ===== แผนที่ Leaflet + OpenStreetMap =====
const map = L.map('map', {minZoom: 5, maxZoom: 12});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'}).addTo(map);
const provLayer = L.featureGroup().addTo(map);
GEO.forEach(p => {   // เส้นขอบ 17 จังหวัดพื้นที่ศึกษา
  const poly = L.polygon(p.r.map(poly => poly.map(ring => ring.map(c => [c[1], c[0]]))), {color: p.north ? '#1b7a3d' : '#7a7a7a',
    weight: p.north ? 2 : .6, opacity: p.north ? .9 : .5, fillColor: '#1b7a3d', fillOpacity: p.north ? .13 : 0, interactive: p.north}).addTo(provLayer);
  if (p.north) poly.bindTooltip(p.n, {sticky: true});
});
function pin(v, s) {
  const l = level(v), dark = !!l.dark;
  return L.divIcon({className: '', iconSize: [44, 62], iconAnchor: [22, 22],
    html: `<div class="pin" style="background:${l.color};color:${dark ? '#222' : '#fff'}">${v == null ? '–' : Math.round(v)}</div><div class="plabel">${s}</div>`});
}
const stM = {};
for (const s in STATIONS) stM[s] = L.marker([STATIONS[s].lat, STATIONS[s].lng], {icon: pin(null, s)}).addTo(map).on('click', () => openPop(s));
map.fitBounds(provLayer.getBounds(), {padding: [10, 10]});   // ซูมให้พอดีพื้นที่ศึกษา 17 จังหวัด

// ===== แผงควบคุม =====
const chips = (id, items, key, cur) => { const box = $(id); box.innerHTML = '';
  items.forEach(([v, t]) => { const b = document.createElement('button'); b.className = 'chip'; b.textContent = t;
    b.onclick = () => { S[key] = v; refresh(); }; b.dataset.v = v; box.appendChild(b); }); };
chips('bChips', [['fc', 'ค่าทำนาย'], ['act', 'ค่าจริง'], ['pers', 'ค่า persistence']], 'basis');
$('legend').innerHTML = LEVELS.map(l => `<div><i style="background:${l.color}"></i>${l.label}</div>`).join('');
const sl = $('slider'); sl.min = 1; sl.max = HMAX; sl.step = 1; sl.value = S.h;          // ล่วงหน้า +1..+12 ชม.
sl.oninput = () => { S.h = +sl.value; refresh(); };
const osl = $('oSlider'); osl.min = 0; osl.max = ORIGINS.length - 1; osl.step = 1; osl.value = S.o;   // เลือกรอบพยากรณ์ (ทุกชั่วโมง)
osl.oninput = () => { S.o = +osl.value; refresh(); };

function refresh() {
  const o = ORIGINS[S.o];
  $('oLabel').textContent = show(o);
  $('tLabel').textContent = `+${S.h} ชม. → ${show(shift(o, S.h))}`;
  document.querySelectorAll('#bChips .chip').forEach(b => b.classList.toggle('on', b.dataset.v === S.basis));
  for (const s in STATIONS) stM[s].setIcon(pin(val(s), s));
  const f = v => v == null ? '–' : v.toFixed(1);
  $('tbl').innerHTML = '<tr><th>สถานี</th><th>ทำนาย</th><th>จริง</th><th>คลาดเคลื่อน</th></tr>' +
    Object.keys(STATIONS).sort().map(s => { const a = val(s, 'fc'), b = val(s, 'act');
      return `<tr><td>${s}</td><td>${f(a)}</td><td>${f(b)}</td><td>${a != null && b != null ? (a - b).toFixed(1) : '–'}</td></tr>`; }).join('');
}

// ===== popup กราฟ =====
let chart = null;
function closePop() { chart?.destroy(); chart = null; $('pop').hidden = true; }
function openPop(s) {   // กราฟ: 24 ชม. ย้อนหลัง (input จริง) + พยากรณ์ล่วงหน้า 12 ชม. ของรอบที่เลือก
  const el = $('pop'), o = ORIGINS[S.o];
  el.hidden = false;
  el.innerHTML = `<h3>${STATIONS[s].name}<button class="x">×</button></h3>
  <div class="row">รอบพยากรณ์ <b>${show(o)}</b> · input = ค่าจริงย้อนหลัง 24 ชม. → ทำนาย +1 ถึง +12 ชม.</div>
  <div class="row"><label><input type="checkbox" data-ser="a" checked> ค่าจริง</label><label><input type="checkbox" data-ser="f" checked> ค่าทำนาย</label><label><input type="checkbox" data-ser="p"> persistence</label></div>
  <div class="chart"><canvas></canvas></div><div class="stat"></div>`;
  el.querySelector('.x').onclick = closePop;
  const stat = el.querySelector('.stat');
  function draw() {
    const on = Object.fromEntries([...el.querySelectorAll('[data-ser]')].map(c => [c.dataset.ser, c.checked]));
    const L = []; for (let i = -23; i <= 12; i++) L.push(shift(o, i));      // i=0 คือชั่วโมงที่ตื่น (00:00)
    const a = L.map(k => getActual(s, k));
    const f = L.map((k, i) => i === 23 ? DATA[s].persistence[o] : i > 23 ? DATA[s].forecast[o]?.[i - 23] ?? null : null);
    const p = L.map((k, i) => i >= 23 ? DATA[s].persistence[o] ?? null : null);
    const ds = [['ค่าจริง', a, '#1d1d1d', on.a, []], ['ค่าทำนาย', f, '#d6302b', on.f, []], ['persistence', p, '#999', on.p, [5, 4]]]
      .map(([label, data, c, vis, dash]) => ({label, data, borderColor: c, hidden: !vis, borderDash: dash, borderWidth: 1.8, tension: .25, pointRadius: 3}));
    chart?.destroy();
    chart = new Chart(el.querySelector('canvas'), {type: 'line', data: {labels: L.map(show), datasets: ds},
      options: {responsive: true, maintainAspectRatio: false, interaction: {mode: 'index', intersect: false},
        scales: {y: {beginAtZero: true, title: {display: true, text: 'PM2.5 (µg/m³)'}}, x: {ticks: {maxTicksLimit: 7}}}, plugins: {legend: {position: 'bottom'}}}});
    const e = L.map((k, i) => i > 23 && a[i] != null && f[i] != null ? Math.abs(a[i] - f[i]) : null).filter(x => x != null);
    stat.textContent = e.length ? `ค่าคลาดเคลื่อนเฉลี่ย 12 ชม. (MAE): ${(e.reduce((x, y) => x + y, 0) / e.length).toFixed(1)} µg/m³ (n=${e.length})` : 'ยังไม่มีค่าจริงให้เทียบ';
  }
  el.querySelectorAll('[data-ser]').forEach(c => c.onchange = draw);
  draw();
}

let timer = null;
const stopPlay = () => { clearInterval(timer); timer = null; $('play').textContent = '▶'; };
$('play').onclick = () => {   // เล่นภาพเคลื่อนไหว +1 -> +12 ชม. ของรอบพยากรณ์ที่เลือก
  if (timer) { stopPlay(); return; }
  if (S.h >= HMAX) { S.h = 1; sl.value = S.h; refresh(); }
  $('play').textContent = '❚❚';
  timer = setInterval(() => { if (S.h >= HMAX) { stopPlay(); return; } S.h++; sl.value = S.h; refresh(); }, 800);
};
refresh(); setTimeout(() => map.invalidateSize(), 200);