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

// ─── Constants ───
const START_HOUR = 15;
const END_HOUR = 20;

let selectedDate = new Date().toISOString().split('T')[0];

// ─── Data Access (Firebase) ───

const loadAppointmentsForDate = async () => {
    try {
        const snapshot = await db.collection('appointments')
            .where('date', '==', selectedDate)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id.split('_')[1], // Extracts '15h00-nome' from '2024-04-28_15h00-nome'
            value: doc.data().value
        }));
    } catch (error) {
        console.error("Erro ao carregar dados do Firebase:", error);
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
        console.error("Erro ao salvar no Firebase:", error);
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

// ─── Mobile Sheet Logic ───
let activeSlotKey = null;

const openEditSheet = (slotKey, hourLabel, data) => {
    activeSlotKey = slotKey;
    document.getElementById('sheet-hour-title').textContent = hourLabel;
    
    document.getElementById('sheet-nome').value = data.nome || '';
    document.getElementById('sheet-servico').value = data.servico || '';
    document.getElementById('sheet-tempo').value = data.tempo || '';
    document.getElementById('sheet-valor').value = data.valor || '';
    document.getElementById('sheet-quarto').value = data.quarto || '';
    
    const sheet = document.getElementById('edit-sheet');
    sheet.classList.add('open');
    sheet.setAttribute('aria-hidden', 'false');
};

const closeEditSheet = () => {
    document.getElementById('edit-sheet').classList.remove('open');
    document.getElementById('edit-sheet').setAttribute('aria-hidden', 'true');
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
    
    const promises = Object.entries(fields).map(([key, val]) => {
        return saveAppointment(`${activeSlotKey}-${key}`, val);
    });
    
    await Promise.all(promises);
    renderAgenda();
    closeEditSheet();
};

// UI Generation
const renderAgenda = async () => {
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
    
    // Update control number
    const controlDoc = await db.collection('settings').doc(`control_${selectedDate}`).get();
    document.getElementById('control-number').value = controlDoc.exists ? controlDoc.data().value : '';
};

const applyCortesiaClass = (row, valor) => {
    if (isCortesia(valor)) {
        row.classList.add('row-cortesia');
    } else {
        row.classList.remove('row-cortesia');
    }
};

const isCortesia = (valor) => {
    if (!valor) return false;
    const v = valor.toLowerCase().trim();
    return v === '0' || v === '0,00' || v === 'cortesia' || v === 'gratis' || v === 'grátis';
};

// ─── Financial Report ───

const generateReport = async () => {
    const start = document.getElementById('report-start').value;
    const end = document.getElementById('report-end').value;
    
    if (!start || !end) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
    }

    const resultsDiv = document.getElementById('report-results');
    const emptyDiv = document.getElementById('report-empty');
    const reportBody = document.getElementById('report-body');
    
    resultsDiv.style.display = 'none';
    emptyDiv.style.display = 'none';
    reportBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Calculando...</td></tr>';

    try {
        const snapshot = await db.collection('appointments')
            .where('date', '>=', start)
            .where('date', '<=', end)
            .get();

        if (snapshot.empty) {
            emptyDiv.style.display = 'block';
            return;
        }

        const allData = snapshot.docs.map(doc => ({
            fullId: doc.id,
            date: doc.data().date,
            value: doc.data().value
        }));

        // Group by Date and Slot to reconstruct appointments
        const appointments = {};
        allData.forEach(item => {
            const [date, cellId] = item.fullId.split('_');
            const slotKey = cellId.split('-')[0];
            const field = cellId.split('-')[1];
            
            const key = `${date}_${slotKey}`;
            if (!appointments[key]) appointments[key] = { date: date, hour: slotKey.replace('h', ':') };
            appointments[key][field] = item.value;
        });

        const rows = Object.values(appointments).filter(a => a.nome || a.valor);
        
        if (rows.length === 0) {
            emptyDiv.style.display = 'block';
            return;
        }

        reportBody.innerHTML = '';
        let totalVal = 0;
        let countCortesia = 0;

        rows.sort((a, b) => a.date.localeCompare(b.date) || a.hour.localeCompare(b.hour)).forEach(app => {
            const tr = document.createElement('tr');
            const isC = isCortesia(app.valor);
            
            let cleanVal = 0;
            if (!isC && app.valor) {
                cleanVal = parseFloat(app.valor.replace('R$', '').replace('.', '').replace(',', '.').trim()) || 0;
            }
            if (isC) countCortesia++;
            totalVal += cleanVal;

            tr.innerHTML = `
                <td>${app.date.split('-').reverse().join('/')}</td>
                <td>${app.hour}</td>
                <td>${app.nome || '-'}</td>
                <td>${app.servico || '-'}</td>
                <td>${isC ? '<span class="badge-cortesia">CORTESIA</span>' : 'R$ ' + (app.valor || '0,00')}</td>
                <td>${isC ? 'Cortesia' : 'Normal'}</td>
            `;
            if (isC) tr.classList.add('row-cortesia');
            reportBody.appendChild(tr);
        });

        document.getElementById('total-cortesias').textContent = `${countCortesia} atendimento(s)`;
        document.getElementById('total-bruto').textContent = totalVal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        document.getElementById('total-liquido').textContent = (totalVal * 0.7).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        resultsDiv.style.display = 'block';
    } catch (error) {
        console.error("Erro no relatório:", error);
        alert("Erro ao gerar relatório.");
    }
};

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('date-picker');
    datePicker.value = selectedDate;

    datePicker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        renderAgenda();
    });

    document.getElementById('control-number').addEventListener('input', (e) => {
        db.collection('settings').doc(`control_${selectedDate}`).set({ value: e.target.value });
    });

    document.getElementById('clear-btn').addEventListener('click', clearDayData);
    document.getElementById('report-btn').addEventListener('click', () => {
        document.getElementById('report-modal').classList.add('open');
    });
    
    document.getElementById('modal-close').addEventListener('click', () => {
        document.getElementById('report-modal').classList.remove('open');
    });

    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('sheet-save-btn').addEventListener('click', saveSheetData);
    
    document.getElementById('edit-sheet').addEventListener('click', (e) => {
        if (e.target.id === 'edit-sheet') closeEditSheet();
    });

    document.getElementById('report-modal').addEventListener('click', (e) => {
        if (e.target.id === 'report-modal') {
            document.getElementById('report-modal').classList.remove('open');
        }
    });

    renderAgenda();
});
