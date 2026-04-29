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

const CORRECT_PASS = "Neide6731";

// ─── Constants ───
const START_HOUR = 15;
const END_HOUR = 20;

let selectedDate = new Date().toISOString().split('T')[0];

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
        renderAgenda();
    } catch (error) {
        console.error("Erro ao limpar dados:", error);
    }
};

// ─── UI Rendering ───
let activeSlotKey = null;

const renderAgenda = async () => {
    if (!auth.currentUser) return; // Proteção extra

    const body = document.getElementById('agenda-body');
    body.innerHTML = '';
    
    const savedData = await loadAppointmentsForDate();
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
                    ${slotData.valor ? '<span class="badge badge-valor">R$ ' + slotData.valor + '</span>' : ''}
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
    const fields = {
        nome: document.getElementById('sheet-nome').value,
        servico: document.getElementById('sheet-servico').value,
        tempo: document.getElementById('sheet-tempo').value,
        valor: document.getElementById('sheet-valor').value,
        quarto: document.getElementById('sheet-quarto').value
    };
    const promises = Object.entries(fields).map(([key, val]) => saveAppointment(`${activeSlotKey}-${key}`, val));
    await Promise.all(promises);
    renderAgenda();
    closeEditSheet();
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
            const [date, cellPart] = docId.split('_'); // '2024-04-28', '15h00-valor'
            if (!cellPart) return;
            
            const [slotKey, field] = cellPart.split('-'); // '15h00', 'valor'
            const key = `${date}_${slotKey}`;
            
            if (!appointments[key]) {
                appointments[key] = { date: date, hour: slotKey.replace('h', ':'), nome: '', valor: '' };
            }
            appointments[key][field] = doc.data().value;
        });

        const rows = Object.values(appointments).filter(a => (a.nome && a.nome.trim() !== '') || (a.valor && a.valor.trim() !== ''));
        
        if (rows.length === 0) {
            emptyDiv.style.display = 'block';
            return;
        }

        reportBody.innerHTML = '';
        let totalVal = 0, countC = 0;

        rows.sort((a,b)=>a.date.localeCompare(b.date)||a.hour.localeCompare(b.hour)).forEach(app => {
            const isC = isCortesia(app.valor);
            let valNumeric = 0;
            
            if (!isC && app.valor) {
                // Limpeza agressiva de R$, pontos e vírgulas
                let clean = app.valor.toString().replace(/R\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                valNumeric = parseFloat(clean) || 0;
            }
            
            if (isC) countC++;
            totalVal += valNumeric;

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
            reportBody.appendChild(tr);
        });

        document.getElementById('total-cortesias').textContent = `${countC} atendimento(s)`;
        document.getElementById('total-bruto').textContent = totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('total-liquido').textContent = (totalVal * 0.7).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        resultsDiv.style.display = 'block';
    } catch (e) { 
        console.error(e);
        alert("Erro técnico ao gerar relatório: " + e.message); 
    }
};

const isCortesia = (v) => v && ['0','0,00','cortesia','gratis','grátis'].includes(v.toLowerCase().trim());

// ─── Gift Card Logic ───

const updateGiftPreview = () => {
    const from = document.getElementById('gift-from').value || '...';
    const to = document.getElementById('gift-to').value || '...';
    const type = document.getElementById('gift-type').value || '...';
    const expiry = document.getElementById('gift-expiry').value;
    
    document.getElementById('view-gift-from').textContent = from;
    document.getElementById('view-gift-to').textContent = to;
    document.getElementById('view-gift-type').textContent = type;
    
    const formattedDate = expiry ? expiry.split('-').reverse().join('/') : '...';
    document.getElementById('view-gift-expiry').textContent = formattedDate;
    
    document.getElementById('gift-preview-container').style.display = 'block';
};

const saveGiftPDF = () => {
    const element = document.getElementById('gift-card-design');
    const toName = document.getElementById('gift-to').value || 'Cliente';
    
    const opt = {
        margin:       10,
        filename:     `Vale_Massagem_${toName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, allowTaint: true },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    try {
        html2pdf().set(opt).from(element).save();
    } catch (e) {
        alert("Erro ao gerar PDF. Experimente o botão 'Baixar Imagem'.");
    }
};

const saveGiftImage = () => {
    const element = document.getElementById('gift-card-design');
    const toName = document.getElementById('gift-to').value || 'Cliente';

    html2canvas(element, { useCORS: true, allowTaint: true, scale: 2 }).then(canvas => {
        const link = document.createElement('a');
        link.download = `Vale_Massagem_${toName}.png`;
        link.href = canvas.toDataURL();
        link.click();
    });
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
    document.getElementById('modal-close').addEventListener('click', () => document.getElementById('report-modal').classList.remove('open'));
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('sheet-save-btn').addEventListener('click', saveSheetData);
    document.getElementById('edit-sheet').addEventListener('click', (e) => { if(e.target.id === 'edit-sheet') closeEditSheet(); });

    // Gift Card Events
    document.getElementById('gift-card-btn').addEventListener('click', () => {
        document.getElementById('gift-card-modal').classList.add('open');
    });

    document.getElementById('gift-close').addEventListener('click', () => {
        document.getElementById('gift-card-modal').classList.remove('open');
    });

    document.getElementById('preview-gift-btn').addEventListener('click', updateGiftPreview);
    document.getElementById('save-gift-pdf').addEventListener('click', saveGiftPDF);
    document.getElementById('save-gift-img').addEventListener('click', saveGiftImage);
});
