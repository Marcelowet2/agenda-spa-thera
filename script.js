// ─── Firebase Configuration ───
const firebaseConfig = {
  apiKey: "AIzaSyA_nzi2S75enlCquOwHHiYpZxzEuDwQg2M",
  authDomain: "spa-thera.firebaseapp.com",
  projectId: "spa-thera",
  storageBucket: "spa-thera.firebasestorage.app",
  messagingSenderId: "187722971473",
  appId: "1:187722971473:web:4be8ff3b114802c97c3b70",
  measurementId: "G-7KQBMTXHLG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ─── Logging System ───
const logAction = async (type, action, details) => {
    if (!auth.currentUser) return;
    try {
        await db.collection('system_logs').add({
            type,
            action,
            details,
            date: new Date().toISOString(),
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (e) {
        console.error("Erro ao registrar log:", e);
    }
};


const CORRECT_PASS = "Neide6731";

// ─── Constants ───
const START_HOUR = 15;
const END_HOUR = 20;

let selectedDate = new Date().toISOString().split('T')[0];
let currentRenderId = 0;

// Paginação do Relatório
let reportFullData = [];
let reportPageSize = 20;
let reportCurrentPage = 1;

// ─── Security Layer ───
const checkAuth = async () => {
    const savedPass = localStorage.getItem('spa_pass');
    if (savedPass === CORRECT_PASS) {
        try {
            await auth.signInAnonymously();
            document.getElementById('login-overlay').style.display = 'none';
            renderAgenda();
        } catch (e) {
            console.error("Erro na autenticação:", e);
        }
    } else {
        document.getElementById('login-overlay').style.display = 'flex';
    }
};

const handleLogin = async () => {
    const input = document.getElementById('login-pass').value;
    const errorMsg = document.getElementById('login-error');
    
    if (input === CORRECT_PASS) {
        localStorage.setItem('spa_pass', input);
        errorMsg.style.display = 'none';
        await checkAuth();
    } else {
        errorMsg.style.display = 'block';
        document.getElementById('login-pass').value = '';
    }
};

// ─── Data Access (Firebase) ───

const loadAppointmentsForDate = async () => {
    try {
        const snapshot = await db.collection('appointments')
            .where('date', '==', selectedDate)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id.split('_')[1],
            value: doc.data().value
        }));
    } catch (error) {
        console.error("Sem permissão ou erro de rede.");
        return [];
    }
};

const saveAppointment = async (cellId, val) => {
    const docId = `${selectedDate}_${cellId}`;
    try {
        await db.collection('appointments').doc(docId).set({
            value: val,
            date: selectedDate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        if(auth.currentUser) alert("Erro ao salvar. Verifique sua conexão.");
    }
};

const clearDayData = async () => {
    if (!confirm('Deseja realmente limpar TODOS os agendamentos deste dia?')) return;
    try {
        const snapshot = await db.collection('appointments')
            .where('date', '==', selectedDate)
            .get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        logAction('delete', 'Limpeza de Agenda', `Todos os dados do dia ${selectedDate} foram excluídos.`);
        renderAgenda();
    } catch (error) {
        console.error("Erro ao limpar dados:", error);
    }
};

// ─── UI Rendering ───
let activeSlotKey = null;

const renderAgenda = async () => {
    if (!auth.currentUser) return; // Proteção extra

    const renderId = ++currentRenderId;
    const savedData = await loadAppointmentsForDate();
    
    // Se uma nova renderização começou enquanto esta buscava dados, abortamos esta
    if (renderId !== currentRenderId) return;

    const body = document.getElementById('agenda-body');
    body.innerHTML = '';
    
    const dataMap = new Map(savedData.map(item => [item.id, item.value]));

    const START_MINUTES = START_HOUR * 60;
    const END_MINUTES   = END_HOUR   * 60;
    const STEP          = 30;

    for (let totalMin = START_MINUTES; totalMin <= END_MINUTES; totalMin += STEP) {
        const h   = Math.floor(totalMin / 60);
        const min = totalMin % 60;
        const hourLabel = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
        const slotKey   = `${h}h${String(min).padStart(2, '0')}`;

        const tr = document.createElement('tr');
        const columnKeys = ['nome', 'servico', 'tempo', 'valor', 'quarto'];
        const slotData = {};
        columnKeys.forEach(k => slotData[k] = dataMap.get(`${slotKey}-${k}`) || '');

        const tdHour = document.createElement('td');
        tdHour.textContent = hourLabel;
        tdHour.classList.add('hour-cell');
        tr.appendChild(tdHour);

        tr.classList.add('agenda-summary-row');
        const tdSummary = document.createElement('td');
        tdSummary.colSpan = 5;
        
        const hasData = slotData.nome || slotData.servico;
        tdSummary.innerHTML = `
            <div class="summary-content ${hasData ? 'has-info' : 'empty'}">
                <div class="summary-main">
                    <div class="client-info">
                        <span class="client-name">${slotData.nome || '<i>Disponível</i>'}</span>
                        <span class="service-name">${slotData.servico ? '<span class="diamond">✦</span> ' + slotData.servico : ''}</span>
                    </div>
                </div>
                ${hasData ? `
                <div class="summary-badges">
                    ${slotData.quarto ? '<span class="badge badge-quarto">Q.' + slotData.quarto + '</span>' : ''}
                    ${slotData.valor ? (isCortesia(slotData.valor) ? 
                        '<span class="badge badge-cortesia">🎁 CORTESIA</span>' : 
                        '<span class="badge badge-valor">R$ ' + slotData.valor + '</span>') : ''}
                </div>
                ` : '<span class="status-disponivel">Livre</span>'}
                <div class="edit-indicator">
                    <span class="edit-icon">✎</span>
                </div>
            </div>
        `;
        
        tr.addEventListener('click', () => openEditSheet(slotKey, hourLabel, slotData));
        tr.appendChild(tdSummary);
        
        if (isCortesia(slotData.valor)) tr.classList.add('row-cortesia');
        body.appendChild(tr);
    }
    
    // Control number update
    const controlDoc = await db.collection('settings').doc(`control_${selectedDate}`).get();
    document.getElementById('control-number').value = controlDoc.exists ? controlDoc.data().value : '';
};

// ─── Shared Logic ───
const openEditSheet = (slotKey, hourLabel, data) => {
    activeSlotKey = slotKey;
    document.getElementById('sheet-hour-title').textContent = hourLabel;
    document.getElementById('sheet-nome').value = data.nome || '';
    document.getElementById('sheet-servico').value = data.servico || '';
    document.getElementById('sheet-tempo').value = data.tempo || '';
    document.getElementById('sheet-valor').value = data.valor || '';
    document.getElementById('sheet-quarto').value = data.quarto || '';
    document.getElementById('edit-sheet').classList.add('open');
};

const closeEditSheet = () => {
    document.getElementById('edit-sheet').classList.remove('open');
    activeSlotKey = null;
};

const saveSheetData = async () => {
    if (!activeSlotKey) return;
    
    const saveBtn = document.getElementById('sheet-save-btn');
    const fields = {
        nome: document.getElementById('sheet-nome').value,
        servico: document.getElementById('sheet-servico').value,
        tempo: document.getElementById('sheet-tempo').value,
        valor: document.getElementById('sheet-valor').value,
        quarto: document.getElementById('sheet-quarto').value
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    try {
        const promises = Object.entries(fields).map(([key, val]) => saveAppointment(`${activeSlotKey}-${key}`, val));
        await Promise.all(promises);
        
        // Log único e completo do agendamento
        const hourStr = document.getElementById('sheet-hour-title').textContent;
        const logDetails = `Cliente: ${fields.nome || '-'} | Serviço: ${fields.servico || '-'} | Valor: ${fields.valor || '0,00'} | Quarto: ${fields.quarto || '-'}`;
        logAction('agenda', `Agendamento Confirmado (${selectedDate} às ${hourStr})`, logDetails);

        await renderAgenda();
        closeEditSheet();
    } catch (e) {
        console.error(e);
        alert("Erro ao salvar dados.");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Confirmar e Salvar';
    }
};

const generateReport = async () => {
    if (!auth.currentUser) return;
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    if (!start || !end) { alert('Selecione as datas.'); return; }

    const resultsDiv = document.getElementById('report-results');
    const reportBody = document.getElementById('report-body');
    const emptyDiv = document.getElementById('report-empty');
    
    resultsDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    reportBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Buscando na nuvem...</td></tr>';

    try {
        const snapshot = await db.collection('appointments')
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

        if (snapshot.empty) { 
            emptyDiv.style.display = 'block'; 
            emptyDiv.innerHTML = '<p>Nenhum dado encontrado no Firebase para este período.</p>';
            return; 
        }
        
        const appointments = {};
        snapshot.docs.forEach(doc => {
            const docId = doc.id;
            const [date, cellPart] = docId.split('_');
            if (!cellPart) return;
            const [slotKey, field] = cellPart.split('-');
            const key = `${date}_${slotKey}`;
            if (!appointments[key]) {
                appointments[key] = { date: date, hour: slotKey.replace('h', ':'), nome: '', valor: '' };
            }
            appointments[key][field] = doc.data().value;
        });

        const rows = Object.values(appointments).filter(a => 
            (a.nome && String(a.nome).trim() !== '') || 
            (a.valor !== undefined && a.valor !== null && String(a.valor).trim() !== '')
        );

        reportFullData = rows.sort((a,b)=>a.date.localeCompare(b.date)||a.hour.localeCompare(b.hour));
        reportCurrentPage = 1;

        let totalVal = 0, countC = 0;
        reportFullData.forEach(app => {
            const isC = isCortesia(app.valor);
            if (!isC && app.valor) {
                let clean = app.valor.toString().replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                totalVal += parseFloat(clean) || 0;
            }
            if (isC) countC++;
        });

        document.getElementById('total-cortesias').textContent = `${countC} atendimento(s)`;
        document.getElementById('total-bruto').textContent = totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('total-liquido').textContent = (totalVal * 0.7).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        renderReportPage(1);
        resultsDiv.style.display = 'block';
    } catch (e) { 
        console.error(e);
        alert("Erro técnico ao gerar relatório: " + e.message); 
    }
};

const renderReportPage = (page) => {
    reportCurrentPage = page;
    const body = document.getElementById('report-body');
    body.innerHTML = '';

    const startIdx = (page - 1) * reportPageSize;
    const endIdx = startIdx + reportPageSize;
    const pageData = reportFullData.slice(startIdx, endIdx);

    pageData.forEach(app => {
        const isC = isCortesia(app.valor);
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${app.date.split('-').reverse().join('/')}</td>
            <td>${app.hour}</td>
            <td>${app.nome || '-'}</td>
            <td>${app.servico || '-'}</td>
            <td>${isC ? '<span class="badge-cortesia">CORTESIA</span>' : 'R$ ' + (app.valor || '0,00')}</td>
            <td>${isC ? 'Cortesia' : 'Atendimento'}</td>
        `;
        if (isC) tr.classList.add('row-cortesia');
        body.appendChild(tr);
    });

    const totalPages = Math.ceil(reportFullData.length / reportPageSize);
    const pagination = document.getElementById('report-pagination');
    
    if (totalPages > 1) {
        pagination.style.display = 'flex';
        document.getElementById('page-info').textContent = `Página ${page} de ${totalPages}`;
        document.getElementById('prev-page-btn').disabled = (page === 1);
        document.getElementById('next-page-btn').disabled = (page === totalPages);
    } else {
        pagination.style.display = 'none';
    }
};

const isCortesia = (v) => {
    if (v === 0 || v === "0") return true;
    if (!v) return false;
    const s = String(v).toLowerCase().trim();
    if (['cortesia', 'gratis', 'grátis'].includes(s)) return true;
    
    // Tenta converter para número e checar se é zero (remove R$, espaços e ajusta decimais)
    const clean = s.replace(/r\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(clean);
    return num === 0;
};

// ─── Gift Card Logic (Ultra-Reliable v7.2 - SVG Embedded) ───

const updateGiftPreview = () => {
    const canvas = document.getElementById('gift-canvas');
    const ctx = canvas.getContext('2d');
    const modelSelect = document.getElementById('gift-model');
    const model = modelSelect ? modelSelect.value : "1";
    
    let svgTemplate = '';
    let renderLogic = null;

    if (model === "1") {
        svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
            <defs>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#fdfbf7;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#f5f0e6;stop-opacity:1" />
                </linearGradient>
                <filter id="shadow" x="0" y="0" width="200%" height="200%">
                  <feDropShadow dx="2" dy="2" stdDeviation="3" flood-color="#b08d57" flood-opacity="0.3"/>
                </filter>
            </defs>
            <rect width="1200" height="800" fill="url(#bgGrad)"/>
            <path d="M600,400 Q650,300 600,200 Q550,300 600,400 Z" fill="#b08d57" opacity="0.05" transform="scale(3) translate(-400,-150)"/>
            <path d="M600,400 Q700,350 800,400 Q700,450 600,400 Z" fill="#b08d57" opacity="0.05" transform="scale(3) translate(-400,-150)"/>
            <rect x="30" y="30" width="1140" height="740" fill="none" stroke="#b08d57" stroke-width="4" rx="10"/>
            <rect x="45" y="45" width="1110" height="710" fill="none" stroke="#b08d57" stroke-width="1" opacity="0.6" rx="5"/>
            <circle cx="30" cy="30" r="15" fill="#b08d57"/>
            <circle cx="1170" cy="30" r="15" fill="#b08d57"/>
            <circle cx="30" cy="770" r="15" fill="#b08d57"/>
            <circle cx="1170" cy="770" r="15" fill="#b08d57"/>
            <text x="600" y="140" font-family="'Tenor Sans', sans-serif" font-size="28" fill="#b08d57" text-anchor="middle" letter-spacing="15">S P A</text>
            <text x="600" y="220" font-family="'Cormorant Garamond', serif" font-size="110" fill="#3d362a" text-anchor="middle" font-weight="bold" filter="url(#shadow)">TheraSpa</text>
            <text x="600" y="280" font-family="serif" font-style="italic" font-size="32" fill="#b08d57" text-anchor="middle">Voucher de Bem-estar &amp; Relaxamento</text>
            <g stroke="#b08d57" stroke-width="1" opacity="0.4">
                <line x1="480" y1="410" x2="1050" y2="410"/>
                <line x1="480" y1="500" x2="1050" y2="500"/>
                <line x1="480" y1="590" x2="1050" y2="590"/>
                <line x1="480" y1="680" x2="1050" y2="680"/>
            </g>
            <text x="460" y="405" font-family="'Montserrat', sans-serif" font-size="20" fill="#b08d57" text-anchor="end" letter-spacing="3">PARA</text>
            <text x="460" y="495" font-family="'Montserrat', sans-serif" font-size="20" fill="#b08d57" text-anchor="end" letter-spacing="3">DE</text>
            <text x="460" y="585" font-family="'Montserrat', sans-serif" font-size="20" fill="#b08d57" text-anchor="end" letter-spacing="3">MASSAGEM</text>
            <text x="460" y="675" font-family="'Montserrat', sans-serif" font-size="20" fill="#b08d57" text-anchor="end" letter-spacing="3">VALIDADE</text>
            <circle cx="1050" cy="150" r="60" fill="none" stroke="#b08d57" stroke-width="1" stroke-dasharray="5,5"/>
            <text x="1050" y="155" font-family="serif" font-size="14" fill="#b08d57" text-anchor="middle">ORIGINAL</text>
        </svg>`;
        renderLogic = (ctx, to, from, type, formattedDate) => {
            ctx.fillStyle = "#3d362a";
            ctx.textAlign = "left";
            ctx.font = "italic 38px serif";
            const textX = 480;
            ctx.fillText(to.toUpperCase(), textX, 403);
            ctx.fillText(from.toUpperCase(), textX, 493);
            const typeLines = type.split('\n');
            typeLines.forEach((line, i) => ctx.fillText(line, textX, 583 + (i * 38)));
            ctx.fillText(formattedDate, textX, 673);
        };
    } else if (model === "2") {
        svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
            <defs>
                <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="3" dy="4" stdDeviation="4" flood-color="#000000" flood-opacity="0.25"/>
                </filter>
            </defs>
            <rect width="1200" height="800" fill="#fdfdfd"/>
            <rect width="700" height="800" fill="#889d79"/>
            
            <!-- Spa Lotus Background -->
            <g fill="#ffffff" opacity="0.08" transform="translate(350, 520) scale(1.6)">
                <path d="M0,0 C-30,-60 -30,-120 0,-150 C30,-120 30,-60 0,0 Z" />
                <path d="M0,0 C-40,-40 -80,-80 -100,-70 C-80,-20 -40,10 0,0 Z" />
                <path d="M0,0 C-20,-50 -60,-100 -60,-120 C-30,-90 -10,-40 0,0 Z" />
                <path d="M0,0 C40,-40 80,-80 100,-70 C80,-20 40,10 0,0 Z" />
                <path d="M0,0 C20,-50 60,-100 60,-120 C30,-90 10,-40 0,0 Z" />
            </g>

            <!-- Tipografia Criativa e de Alto Padrão -->
            <text x="350" y="380" font-family="'Montserrat', sans-serif" font-weight="400" font-size="75" fill="#1a1f14" text-anchor="middle" letter-spacing="35" transform="translate(18, 0)" filter="url(#textShadow)">VALE</text>
            <text x="350" y="490" font-family="'Cormorant Garamond', serif" font-weight="700" font-size="110" fill="#1a1f14" text-anchor="middle" letter-spacing="6" transform="translate(3, 0)" filter="url(#textShadow)">PRESENTE</text>
            
            <!-- Fita de Seda Translúcida (Traço Suave e Sofisticado) -->
            <g opacity="0.9">
                <path d="M-50,580 C 150,580 200,680 350,680 C 500,680 550,550 750,580" fill="none" stroke="#f4ecd8" stroke-width="5"/>
                <path d="M-50,595 C 170,595 220,665 350,665 C 480,665 530,565 750,595" fill="none" stroke="#f4ecd8" stroke-width="2.5" opacity="0.7"/>
                <path d="M-50,610 C 190,610 240,650 350,650 C 460,650 510,580 750,610" fill="none" stroke="#f4ecd8" stroke-width="1.5" opacity="0.4"/>
            </g>
            
            <text x="350" y="730" font-family="'Montserrat', sans-serif" font-size="16" fill="#ffffff" text-anchor="middle" letter-spacing="1">PARA QUEM MERECE EQUILIBRAR CORPO E ALMA.</text>
            <text x="350" y="760" font-family="'Montserrat', sans-serif" font-size="16" fill="#ffffff" text-anchor="middle" letter-spacing="1">PRESENTEIE-SE COM A REVOLUÇÃO DO BEM ESTAR.</text>
        </svg>`;
        renderLogic = (ctx, to, from, type, formattedDate) => {
            ctx.fillStyle = "#1e2417";
            ctx.textAlign = "center";
            ctx.font = "40px 'Tenor Sans', sans-serif";
            const typeLines = (type || "MASSAGEM").toUpperCase().split('\n');
            let startY = 110;
            typeLines.forEach((line, i) => {
                ctx.fillText(line, 950, startY + (i * 45));
            });
            
            ctx.textAlign = "left";
            ctx.font = "20px 'Montserrat', sans-serif";
            ctx.fillText("DE:", 750, 270);
            ctx.fillRect(750, 360, 400, 2);
            ctx.fillText("PARA:", 750, 450);
            ctx.fillRect(750, 540, 400, 2);
            
            ctx.font = "36px 'Cormorant Garamond', serif";
            ctx.textAlign = "center";
            ctx.fillText(from, 950, 335);
            ctx.fillText(to, 950, 515);
            
            ctx.font = "18px 'Montserrat', sans-serif";
            ctx.fillText("VÁLIDO ATÉ " + formattedDate, 950, 680);
            
            ctx.font = "16px 'Montserrat', sans-serif";
            ctx.fillText("ENTRE EM CONTATO PELO TELEFONE: (45) 99996-6530", 950, 740);
            ctx.fillText("E AGENDE SEU HORÁRIO", 950, 770);

            const logoImg = new Image();
            logoImg.onload = () => {
                // Dynamically scale logo to preserve aspect ratio (prevents squishing)
                const aspectRatio = logoImg.width / logoImg.height;
                let logoWidth = 240;
                let logoHeight = logoWidth / aspectRatio;
                
                // Cap height so it doesn't overlap text
                if (logoHeight > 180) {
                    logoHeight = 180;
                    logoWidth = logoHeight * aspectRatio;
                }
                
                // Center it horizontally
                const x = 350 - (logoWidth / 2);
                const y = 40 + (180 - logoHeight) / 2;
                
                ctx.drawImage(logoImg, x, y, logoWidth, logoHeight);
            };
            if (typeof logoBrancaBase64 !== 'undefined') {
                logoImg.src = logoBrancaBase64;
            } else {
                logoImg.src = "assets/logo-branca.png";
            }
        };
    } else if (model === "3") {
        svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
            <rect width="1200" height="800" fill="#151515"/>
            <rect x="40" y="40" width="1120" height="720" fill="none" stroke="#d4af37" stroke-width="2"/>
            <rect x="50" y="50" width="1100" height="700" fill="none" stroke="#d4af37" stroke-width="1" opacity="0.5"/>
            
            <text x="600" y="160" font-family="'Tenor Sans', sans-serif" font-size="30" fill="#d4af37" text-anchor="middle" letter-spacing="15">THERA SPA</text>
            <text x="600" y="260" font-family="'Cormorant Garamond', serif" font-size="100" fill="#ffffff" text-anchor="middle" font-weight="bold">Gift Card</text>
            
            <path d="M 300 320 L 900 320" stroke="#d4af37" stroke-width="1" opacity="0.6"/>
            
            <text x="400" y="440" font-family="'Montserrat', sans-serif" font-size="18" fill="#d4af37" text-anchor="end" letter-spacing="2">DE:</text>
            <text x="400" y="520" font-family="'Montserrat', sans-serif" font-size="18" fill="#d4af37" text-anchor="end" letter-spacing="2">PARA:</text>
            <text x="400" y="600" font-family="'Montserrat', sans-serif" font-size="18" fill="#d4af37" text-anchor="end" letter-spacing="2">SERVIÇO:</text>
            <text x="400" y="680" font-family="'Montserrat', sans-serif" font-size="18" fill="#d4af37" text-anchor="end" letter-spacing="2">VALIDADE:</text>
        </svg>`;
        renderLogic = (ctx, to, from, type, formattedDate) => {
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "left";
            ctx.font = "italic 36px 'Cormorant Garamond', serif";
            const tx = 430;
            ctx.fillText(from, tx, 440);
            ctx.fillText(to, tx, 520);
            const typeLines = type.split('\n');
            typeLines.forEach((line, i) => ctx.fillText(line, tx, 600 + (i * 36)));
            ctx.fillText(formattedDate, tx, 680);
            
            ctx.fillStyle = "#d4af37";
            ctx.fillRect(430, 450, 450, 1);
            ctx.fillRect(430, 530, 450, 1);
            ctx.fillRect(430, 610, 450, 1);
            ctx.fillRect(430, 690, 450, 1);
        };
    } else if (model === "4") {
        svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
            <rect width="1200" height="800" fill="#fbf5f5"/>
            <circle cx="600" cy="400" r="300" fill="#f3e8e8"/>
            <rect x="30" y="30" width="1140" height="740" fill="none" stroke="#b76e79" stroke-width="4" rx="20"/>
            
            <text x="600" y="180" font-family="'Tenor Sans', sans-serif" font-size="40" fill="#b76e79" text-anchor="middle" letter-spacing="12">THERA SPA</text>
            <text x="600" y="240" font-family="'Montserrat', sans-serif" font-size="16" fill="#885860" text-anchor="middle" letter-spacing="4">VALE PRESENTE DE BEM-ESTAR</text>
            
            <path d="M 400 280 L 800 280" stroke="#b76e79" stroke-width="2"/>
        </svg>`;
        renderLogic = (ctx, to, from, type, formattedDate) => {
            ctx.fillStyle = "#6d464c";
            ctx.textAlign = "center";
            ctx.font = "24px 'Montserrat', sans-serif";
            ctx.fillText("ESPECIALMENTE PARA", 600, 360);
            
            ctx.font = "bold italic 50px 'Cormorant Garamond', serif";
            ctx.fillText(to, 600, 420);
            
            ctx.font = "20px 'Montserrat', sans-serif";
            ctx.fillText("COM CARINHO DE: " + from, 600, 500);
            
            ctx.fillStyle = "#b76e79";
            const typeLines = type.toUpperCase().split('\n');
            typeLines.forEach((line, i) => ctx.fillText(line, 600, 600 + (i * 30)));
            
            ctx.fillStyle = "#6d464c";
            ctx.font = "18px 'Montserrat', sans-serif";
            ctx.fillText("VÁLIDO ATÉ " + formattedDate, 600, 680);
        };
    } else if (model === "5") {
        svgTemplate = `
        <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
            <rect width="1200" height="800" fill="#e8f0f4"/>
            <path d="M 0 0 L 1200 800 L 1200 0 Z" fill="#dce6eb"/>
            <rect x="50" y="50" width="1100" height="700" fill="none" stroke="#4b7894" stroke-width="2"/>
            
            <text x="600" y="160" font-family="'Tenor Sans', sans-serif" font-size="45" fill="#2d4f66" text-anchor="middle" letter-spacing="15">THERA SPA</text>
            <path d="M 500 200 L 700 200" stroke="#4b7894" stroke-width="1"/>
            
            <text x="300" y="380" font-family="'Montserrat', sans-serif" font-size="18" fill="#4b7894" text-anchor="end" letter-spacing="2">DE</text>
            <text x="300" y="480" font-family="'Montserrat', sans-serif" font-size="18" fill="#4b7894" text-anchor="end" letter-spacing="2">PARA</text>
            <text x="300" y="580" font-family="'Montserrat', sans-serif" font-size="18" fill="#4b7894" text-anchor="end" letter-spacing="2">MASSAGEM</text>
            <text x="300" y="680" font-family="'Montserrat', sans-serif" font-size="18" fill="#4b7894" text-anchor="end" letter-spacing="2">VALIDADE</text>
        </svg>`;
        renderLogic = (ctx, to, from, type, formattedDate) => {
            ctx.fillStyle = "#1e3747";
            ctx.textAlign = "left";
            ctx.font = "italic 45px 'Cormorant Garamond', serif";
            
            const tx = 340;
            ctx.fillText(from, tx, 385);
            ctx.fillText(to, tx, 485);
            ctx.font = "35px 'Tenor Sans', sans-serif";
            const typeLines = type.split('\n');
            typeLines.forEach((line, i) => ctx.fillText(line, tx, 585 + (i * 35)));
            ctx.font = "28px 'Montserrat', sans-serif";
            ctx.fillText(formattedDate, tx, 685);
            
            ctx.fillStyle = "#4b7894";
            ctx.fillRect(tx, 400, 500, 1);
            ctx.fillRect(tx, 500, 500, 1);
            ctx.fillRect(tx, 600, 500, 1);
            ctx.fillRect(tx, 700, 500, 1);
        };
    }

    const img = new Image();
    const svgBlob = new Blob([svgTemplate], {type: 'image/svg+xml;charset=utf-8'});
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const to = document.getElementById('gift-to').value || "...";
        const from = document.getElementById('gift-from').value || "...";
        const type = document.getElementById('gift-type').value || "...";
        const expiry = document.getElementById('gift-expiry').value;
        const formattedDate = expiry ? expiry.split('-').reverse().join('/') : "...";

        if (renderLogic) {
            renderLogic(ctx, to, from, type, formattedDate);
        }

        document.getElementById('gift-preview-container').style.display = 'block';
        URL.revokeObjectURL(url);
    };
    img.src = url;
};

const saveGiftImage = () => {
    const canvas = document.getElementById('gift-canvas');
    const toName = document.getElementById('gift-to').value || "Cliente";
    const dataURL = canvas.toDataURL("image/png");
    const link = document.createElement('a');
    link.download = `Vale_Massagem_${toName}.png`;
    link.href = dataURL;
    link.click();
};

const saveGiftPDF = () => {
    const canvas = document.getElementById('gift-canvas');
    const toName = document.getElementById('gift-to').value || "Cliente";
    
    try {
        const { jsPDF } = window.jspdf;
        // Cria PDF no tamanho do canvas (1200x800 px)
        const pdf = new jsPDF('l', 'px', [1200, 800]);
        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        pdf.addImage(imgData, 'JPEG', 0, 0, 1200, 800);
        pdf.save(`Vale_Massagem_${toName}.pdf`);
        
        logAction('voucher', 'Voucher Gerado (PDF)', `Para: ${toName} | De: ${document.getElementById('gift-from').value} | Tipo: ${document.getElementById('gift-type').value}`);
    } catch (e) {
        console.error("Erro no PDF:", e);
        alert("Erro ao gerar PDF. Experimente salvar como Imagem.");
    }
};

const downloadReportPDF = () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    
    const startDate = document.getElementById('report-start').value || '...';
    const endDate = document.getElementById('report-end').value || '...';
    const totalBruto = document.getElementById('total-bruto').textContent;
    const totalLiquido = document.getElementById('total-liquido').textContent;
    const totalCortesias = document.getElementById('total-cortesias').textContent;

    // --- MODERN SLATE & GOLD DESIGN SYSTEM ---
    const SLATE = [44, 44, 44];
    const GOLD = [176, 141, 87];
    const GREEN = [46, 125, 50];
    const RED = [200, 0, 0];

    // Função interna para o ícone de presente
    const drawGift = (x, y) => {
        pdf.setDrawColor(RED[0], RED[1], RED[2]);
        pdf.setLineWidth(0.8);
        pdf.rect(x, y - 7, 7, 7);
        pdf.line(x + 3.5, y - 7, x + 3.5, y);
        pdf.line(x, y - 3.5, x + 7, y - 3.5);
        pdf.line(x + 1, y - 9, x + 3.5, y - 7);
        pdf.line(x + 6, y - 9, x + 3.5, y - 7);
    };

    // 1. HEADER DE IMPACTO (DARK MODE)
    pdf.setFillColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.rect(0, 0, 595, 120, 'F');
    
    pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setFont("times", "bold");
    pdf.setFontSize(28);
    pdf.text("SPA THERA", 40, 65);
    
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "bold");
    pdf.text("RELATÓRIO FINANCEIRO EXECUTIVO", 40, 85);
    
    pdf.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.rect(420, 50, 135, 40, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(8);
    pdf.text("PERÍODO SELECIONADO", 430, 65);
    pdf.setFontSize(9);
    pdf.text(`${startDate.split('-').reverse().join('/')} - ${endDate.split('-').reverse().join('/')}`, 430, 80);

    // 2. CORPO DO RELATÓRIO
    let y = 160;
    pdf.setFillColor(240, 240, 240);
    pdf.rect(40, y - 15, 515, 22, 'F');
    
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.text("DETALHE DO ATENDIMENTO", 45, y);
    pdf.text("DATA/HORA", 350, y);
    pdf.text("VALOR", 550, y, { align: "right" });
    
    y += 25;

    if (reportFullData.length === 0) {
        pdf.setFont("helvetica", "italic");
        pdf.setTextColor(150, 150, 150);
        pdf.text("Nenhum registro encontrado para este período.", 45, y + 10);
    } else {
        reportFullData.forEach((app, index) => {
            if (y > 750) {
                pdf.addPage();
                y = 50;
            }

            pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
            pdf.setLineWidth(1.5);
            pdf.line(40, y - 10, 40, y + 15);

            pdf.setFont("times", "bold");
            pdf.setFontSize(11);
            pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
            pdf.text((app.nome || '-').toUpperCase(), 50, y);
            
            pdf.setFont("helvetica", "normal");
            pdf.setFontSize(9);
            pdf.setTextColor(100, 100, 100);
            pdf.text(app.servico || '-', 50, y + 12);
            
            pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
            pdf.text(`${app.date.split('-').reverse().join('/')} às ${app.hour}`, 350, y + 5);
            
            const isC = isCortesia(app.valor);
            if (isC) {
                pdf.setTextColor(RED[0], RED[1], RED[2]);
                pdf.setFont("helvetica", "bold");
                drawGift(485, y + 5);
                pdf.text("CORTESIA", 550, y + 5, { align: "right" });
            } else {
                pdf.setFont("helvetica", "bold");
                pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
                pdf.text('R$ ' + (app.valor || '0,00'), 550, y + 5, { align: "right" });
            }
            
            pdf.setDrawColor(240, 240, 240);
            pdf.setLineWidth(0.5);
            pdf.line(40, y + 20, 555, y + 20);
            y += 35;
        });
    }

    // 3. RESUMO FINANCEIRO (KPI BOARD)
    y += 30;
    if (y > 650) { pdf.addPage(); y = 60; }

    pdf.setDrawColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setLineWidth(0.5);
    pdf.rect(40, y, 515, 130);
    
    pdf.setFillColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.rect(40, y, 150, 25, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text("SUMÁRIO EXECUTIVO", 50, y + 16);
    
    const totalAtendimentos = reportFullData.length;

    y += 40;
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("TOTAL DE ATENDIMENTOS:", 60, y);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${totalAtendimentos}`, 210, y);
    
    y += 25;
    pdf.setFont("helvetica", "normal");
    pdf.text("VOLUME DE CORTESIAS:", 60, y);
    pdf.setTextColor(RED[0], RED[1], RED[2]);
    pdf.text(totalCortesias, 210, y);
    
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.text("FATURAMENTO BRUTO:", 300, y - 25);
    pdf.text(totalBruto, 420, y - 25);
    
    y += 30;
    // Linha de separação final
    pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setLineWidth(0.5);
    pdf.line(300, y - 10, 540, y - 10);

    pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(11);
    pdf.text("RESULTADO LÍQUIDO (-30%):", 300, y + 5);
    
    // Valor Líquido em Verde (Sem box, direto no fundo)
    pdf.setFontSize(14);
    pdf.setTextColor(GREEN[0], GREEN[1], GREEN[2]);
    pdf.text(totalLiquido, 540, y + 5, { align: "right" });
    
    pdf.setFontSize(7);
    pdf.setTextColor(180, 180, 180);
    pdf.text("RELATÓRIO GERADO PARA USO EXCLUSIVO DA ADMINISTRAÇÃO SPA THERA", 297, 810, { align: "center" });

    const startFormatted = startDate.split('-').reverse().join('-');
    const endFormatted = endDate.split('-').reverse().join('-');
    pdf.save(`Thera Spa relatorio financeiro ${startFormatted} ate ${endFormatted}.pdf`);
};

// ─── Events ───
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.getElementById('login-pass').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    const dp = document.getElementById('date-picker');
    dp.value = selectedDate;
    dp.addEventListener('change', (e) => { selectedDate = e.target.value; renderAgenda(); });

    document.getElementById('control-number').addEventListener('input', (e) => {
        if(auth.currentUser) db.collection('settings').doc(`control_${selectedDate}`).set({ value: e.target.value });
    });

    document.getElementById('clear-btn').addEventListener('click', clearDayData);
    document.getElementById('report-btn').addEventListener('click', () => document.getElementById('report-modal').classList.add('open'));
    document.getElementById('gift-card-btn').addEventListener('click', () => document.getElementById('gift-card-modal').classList.add('open'));
    document.getElementById('modal-close').addEventListener('click', () => document.getElementById('report-modal').classList.remove('open'));
    document.getElementById('gift-close').addEventListener('click', () => document.getElementById('gift-card-modal').classList.remove('open'));
    
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    
    // Paginação do Relatório
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (reportCurrentPage > 1) renderReportPage(reportCurrentPage - 1);
    });
    document.getElementById('next-page-btn').addEventListener('click', () => {
        const totalPages = Math.ceil(reportFullData.length / reportPageSize);
        if (reportCurrentPage < totalPages) renderReportPage(reportCurrentPage + 1);
    });
    document.getElementById('sheet-save-btn').addEventListener('click', saveSheetData);
    document.getElementById('report-modal').addEventListener('click', (e) => { if(e.target.id === 'report-modal') e.target.classList.remove('open'); });
    document.getElementById('gift-card-modal').addEventListener('click', (e) => { if(e.target.id === 'gift-card-modal') e.target.classList.remove('open'); });
    document.getElementById('history-modal').addEventListener('click', (e) => { if(e.target.id === 'history-modal') e.target.classList.remove('open'); });
    document.getElementById('edit-sheet').addEventListener('click', (e) => { if(e.target.id === 'edit-sheet') closeEditSheet(); });
    document.getElementById('save-pdf-btn').addEventListener('click', downloadReportPDF);
    document.getElementById('preview-gift-btn').addEventListener('click', updateGiftPreview);
    document.getElementById('save-gift-img').addEventListener('click', saveGiftImage);
    document.getElementById('save-gift-pdf').addEventListener('click', saveGiftPDF);

    // Gatilho do Histórico: Clique no cadeado do rodapé
    document.getElementById('secret-admin-trigger').addEventListener('click', () => {
        document.getElementById('history-modal').classList.add('open');
        loadHistory('all');
    });
    // Expenses
    document.getElementById('expenses-btn').addEventListener('click', openExpensesModal);
    document.getElementById('expenses-close').addEventListener('click', closeExpensesModal);
    document.getElementById('save-expense-btn').addEventListener('click', saveExpense);
    document.getElementById('filter-expenses-btn').addEventListener('click', loadExpenses);
    document.getElementById('save-exp-pdf-btn').addEventListener('click', downloadExpensesPDF);
    
    const expensesModal = document.getElementById('expenses-modal');
    expensesModal.addEventListener('click', (e) => {
        if (e.target === expensesModal) closeExpensesModal();
    });
});

// --- GESTÃO DE GASTOS ---

const openExpensesModal = () => {
    document.getElementById('expenses-modal').classList.add('open');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('exp-date').value = today;
    document.getElementById('exp-filter-start').value = today.substring(0, 8) + '01';
    document.getElementById('exp-filter-end').value = today;
    loadExpenses();
};

const closeExpensesModal = () => {
    document.getElementById('expenses-modal').classList.remove('open');
};

const saveExpense = async () => {
    const desc = document.getElementById('exp-desc').value.trim();
    const valorRaw = document.getElementById('exp-valor').value.trim();
    const date = document.getElementById('exp-date').value;
    const category = document.getElementById('exp-category').value;

    if (!desc || !valorRaw || !date) {
        alert("Preencha todos os campos do gasto.");
        return;
    }

    const valor = parseFloat(valorRaw.replace(',', '.'));
    if (isNaN(valor)) {
        alert("Valor inválido.");
        return;
    }

    const btn = document.getElementById('save-expense-btn');
    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
        await db.collection('expenses').add({
            desc,
            category,
            valor,
            date,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        await db.collection('history').add({
            tipo: 'gasto',
            detalhes: `Novo gasto: ${desc} - R$ ${valor.toFixed(2)}`,
            data: new Date().toISOString()
        });

        document.getElementById('exp-desc').value = "";
        document.getElementById('exp-valor').value = "";
        loadExpenses();
    } catch (error) {
        console.error("Erro ao salvar gasto:", error);
        alert("Erro ao salvar gasto.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Adicionar Gasto";
    }
};

const loadExpenses = async () => {
    const start = document.getElementById('exp-filter-start').value;
    const end = document.getElementById('exp-filter-end').value;
    const body = document.getElementById('expenses-body');
    
    // UI Elements
    const faturamentoEl = document.getElementById('exp-faturamento-liq');
    const totalGastosEl = document.getElementById('exp-total-gastos');
    const lucroFinalEl = document.getElementById('exp-lucro-final');

    body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Buscando dados consolidados...</td></tr>';

    try {
        // 1. Buscar Gastos
        const snapshot = await db.collection('expenses')
            .where('date', '>=', start)
            .where('date', '<=', end)
            .orderBy('date', 'desc')
            .get();

        // 2. Buscar Faturamento (Appointments) para comparação
        const appSnapshot = await db.collection('appointments')
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

        let totalGanhosBruto = 0;
        appSnapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            // No Firebase, os valores estão salvos com chaves como '2024-05-12_15h00-valor'
            if (id.includes('-valor')) {
                const val = data.value;
                if (val && !isCortesia(val)) {
                    let clean = val.toString().replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                    totalGanhosBruto += parseFloat(clean) || 0;
                }
            }
        });

        const faturamentoLiquido = totalGanhosBruto * 0.7;

        body.innerHTML = '';
        let totalGastos = 0;
        const expenses = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            totalGastos += data.valor;
            expenses.push({ id: doc.id, ...data });
        });

        if (expenses.length === 0) {
            body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Nenhum gasto encontrado no período.</td></tr>';
        } else {
            expenses.forEach(data => {
                const perc = totalGastos > 0 ? (data.valor / totalGastos) * 100 : 0;
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #eee";
                tr.innerHTML = `
                    <td style="padding:10px;">${data.date.split('-').reverse().join('/')}</td>
                    <td style="padding:10px;"><span style="font-size:0.75rem; background:#eee; padding:2px 8px; border-radius:10px; color:#666;">${data.category || 'Outros'}</span></td>
                    <td style="padding:10px;">${data.desc}</td>
                    <td style="padding:10px; text-align:right; font-weight:600; color:#c0392b;">R$ ${data.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
                    <td style="padding:10px; text-align:right; font-size: 0.8rem; color: #777;">${perc.toFixed(1)}%</td>
                    <td style="padding:10px; text-align:center;">
                        <button onclick="deleteExpense('${data.id}', '${data.desc}')" style="background:none; border:none; color:#e74c3c; cursor:pointer; font-size:1.1rem;">&times;</button>
                    </td>
                `;
                body.appendChild(tr);
            });
        }

        const lucroFinal = faturamentoLiquido - totalGastos;

        // Atualiza a UI de Performance
        if (faturamentoEl) faturamentoEl.textContent = faturamentoLiquido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        if (totalGastosEl) totalGastosEl.textContent = totalGastos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        if (lucroFinalEl) {
            lucroFinalEl.textContent = lucroFinal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            // Cores dinâmicas para o lucro
            lucroFinalEl.style.color = lucroFinal >= 0 ? 'var(--primary-gold)' : '#c0392b';
        }

    } catch (error) {
        console.error("Erro ao carregar dados consolidados:", error);
        body.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:red;">Erro ao carregar dados. Verifique sua conexão.</td></tr>';
    }
};

const deleteExpense = async (id, desc) => {
    if (!confirm(`Deseja realmente excluir o gasto: "${desc}"?`)) return;

    try {
        await db.collection('expenses').doc(id).delete();
        loadExpenses();
    } catch (error) {
        alert("Erro ao excluir gasto.");
    }
};

const downloadExpensesPDF = () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'pt', 'a4');
    
    const start = document.getElementById('exp-filter-start').value.split('-').reverse().join('/');
    const end = document.getElementById('exp-filter-end').value.split('-').reverse().join('/');
    
    const SLATE = [44, 44, 44];
    const GOLD = [176, 141, 87];
    const RED = [192, 57, 43];

    // Header
    pdf.setFillColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.rect(0, 0, 600, 110, 'F');
    
    pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setLineWidth(2);
    pdf.line(40, 45, 40, 85);

    pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setFontSize(26);
    pdf.setFont("helvetica", "bold");
    pdf.text("SPA THERA", 55, 68);
    
    pdf.setTextColor(200, 200, 200);
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text("RELATÓRIO DETALHADO DE GASTOS", 55, 85);

    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text(`PERÍODO: ${start} até ${end}`, 550, 85, { align: "right" });

    let y = 150;
    pdf.setFillColor(248, 248, 248);
    pdf.rect(40, y - 15, 515, 20, 'F');
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.text("DATA", 50, y);
    pdf.text("CATEGORIA", 110, y);
    pdf.text("DESCRIÇÃO", 210, y);
    pdf.text("VALOR", 500, y, { align: "right" });
    pdf.text("%", 540, y, { align: "right" });
    
    pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.setLineWidth(1);
    pdf.line(40, y + 8, 555, y + 8);
    
    y += 25;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(80, 80, 80);
    pdf.setFontSize(8);
    
    const rows = document.getElementById('expenses-body').querySelectorAll('tr');
    let total = 0;
    const catSummary = {};

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        if (y > 750) { pdf.addPage(); y = 60; }
        
        const date = cells[0].textContent;
        const cat = cells[1].textContent;
        const desc = cells[2].textContent;
        const valStr = cells[3].textContent;
        const perc = cells[4].textContent;

        pdf.text(date, 50, y);
        pdf.text(cat, 110, y);
        pdf.text(desc.substring(0, 45), 210, y);
        pdf.text(valStr, 500, y, { align: "right" });
        pdf.text(perc, 540, y, { align: "right" });
        
        const valNumeric = parseFloat(valStr.replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
        if (!isNaN(valNumeric)) {
            total += valNumeric;
            catSummary[cat] = (catSummary[cat] || 0) + valNumeric;
        }
        
        pdf.setDrawColor(240, 240, 240);
        pdf.line(40, y + 5, 555, y + 5);
        y += 20;
    });

    // --- Resumo por Categoria ---
    y += 20;
    if (y > 600) { pdf.addPage(); y = 60; }
    
    pdf.setFillColor(250, 250, 250);
    pdf.rect(40, y, 200, (Object.keys(catSummary).length * 20) + 30, 'F');
    pdf.setDrawColor(230, 230, 230);
    pdf.rect(40, y, 200, (Object.keys(catSummary).length * 20) + 30);
    
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.text("DISTRIBUIÇÃO POR CATEGORIA", 50, y + 15);
    y += 30;
    
    pdf.setFont("helvetica", "normal");
    Object.entries(catSummary).sort((a,b) => b[1] - a[1]).forEach(([cat, val]) => {
        const p = ((val / total) * 100).toFixed(1);
        pdf.text(`${cat}:`, 50, y);
        pdf.text(`${p}%`, 230, y, { align: "right" });
        y += 18;
    });

    // --- Sumário de Performance Financeira ---
    y += 30;
    if (y > 650) { pdf.addPage(); y = 60; }

    const fatLiq = document.getElementById('exp-faturamento-liq').textContent;
    const lucroFin = document.getElementById('exp-lucro-final').textContent;

    pdf.setDrawColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setLineWidth(0.5);
    pdf.rect(40, y, 515, 110);
    
    pdf.setFillColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.rect(40, y, 180, 25, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(9);
    pdf.text("DESEMPENHO FINANCEIRO", 50, y + 16);
    
    y += 45;
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("FATURAMENTO LÍQUIDO (MASSAGENS):", 60, y);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.text(fatLiq, 540, y, { align: "right" });
    
    y += 25;
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setFont("helvetica", "normal");
    pdf.text("TOTAL DE GASTOS OPERACIONAIS:", 60, y);
    pdf.setTextColor(RED[0], RED[1], RED[2]);
    pdf.setFont("helvetica", "bold");
    pdf.text(`(-) R$ ${total.toLocaleString('pt-BR', {minimumFractionDigits:2})}`, 540, y, { align: "right" });
    
    y += 20;
    pdf.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.line(300, y, 540, y);
    
    y += 15;
    pdf.setTextColor(SLATE[0], SLATE[1], SLATE[2]);
    pdf.setFontSize(12);
    pdf.text("LUCRO FINAL:", 300, y);
    pdf.setFontSize(16);
    pdf.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    pdf.text(lucroFin, 540, y, { align: "right" });

    const filename = `Thera Spa relatorio de GASTOS ${start.replace(/\//g, '-')} ate ${end.replace(/\//g, '-')}.pdf`;
    pdf.save(filename);
};

const loadHistory = async (filter) => {
    const list = document.getElementById('history-list');
    list.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Carregando registros...</p>';
    
    // Atualiza visual dos botões de filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    // Tenta achar o botão clicado para destacar (opcional)

    try {
        // Buscamos os últimos 100 logs sem filtro direto no Firebase para evitar erro de Índice
        const snapshot = await db.collection('system_logs').orderBy('timestamp', 'desc').limit(100).get();
        
        if (snapshot.empty) {
            list.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Nenhum registro encontrado.</p>';
            return;
        }
        
        let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Filtramos localmente no JavaScript
        if (filter === 'agenda') {
            logs = logs.filter(l => l.type === 'agenda' || l.type === 'delete');
        } else if (filter === 'voucher') {
            logs = logs.filter(l => l.type === 'voucher');
        }

        if (logs.length === 0) {
            list.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Nenhum registro nesta categoria.</p>';
            return;
        }

        list.innerHTML = '';
        logs.forEach(data => {
            const date = data.timestamp ? data.timestamp.toDate() : new Date(data.date);
            const timeStr = date.toLocaleString('pt-BR');
            
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <div class="history-header">
                    <span class="history-badge badge-${data.type}">${data.type}</span>
                    <span class="history-time">${timeStr}</span>
                </div>
                <div class="history-action">${data.action}</div>
                <div class="history-details">${data.details}</div>
            `;
            list.appendChild(item);
        });
    } catch (e) {
        console.error("Erro no Histórico:", e);
        list.innerHTML = `<p style="color:red; padding:20px; text-align:center;">Erro ao carregar: ${e.message}</p>`;
    }
};

const closeSheet = (id) => {
    document.getElementById(id).classList.remove('open');
};
