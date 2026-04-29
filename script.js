// Configuration
const START_HOUR = 15;
const END_HOUR = 20;
const DB_NAME = 'SpaTheraDB';
const STORE_NAME = 'appointments';

let db;
let selectedDate = new Date().toISOString().split('T')[0];

// Initialize Database
const initDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 2);

        request.onupgradeneeded = (event) => {
            db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = (event) => {
            console.error('Database error:', event.target.error);
            reject(event.target.error);
        };
    });
};

// Data Operations
const saveAppointment = (id, value) => {
    if (!db) return;
    const key = `${selectedDate}_${id}`;
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put({ id: key, value });
};

const loadAppointmentsForDate = () => {
    return new Promise((resolve) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const results = request.result.filter(item => item.id.startsWith(`${selectedDate}_`));
            resolve(results);
        };
        
        request.onerror = () => resolve([]);
    });
};

const clearCurrentDay = () => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
        const toDelete = request.result.filter(item => item.id.startsWith(`${selectedDate}_`));
        toDelete.forEach(item => store.delete(item.id));
        renderAgenda();
    };
};

// ─── Cortesia Helper ───
const isCortesia = (raw) => {
    if (!raw || raw.trim() === '') return false;
    const trimmed = raw.trim().toLowerCase();
    if (trimmed === 'cortesia') return true;
    // Zero values: 0, 0.00, 0,00, R$ 0,00 etc.
    const num = parseFloat(trimmed.replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.').trim());
    return !isNaN(num) && num === 0;
};

const applyCortesiaClass = (tr, valorValue) => {
    if (isCortesia(valorValue)) {
        tr.classList.add('row-cortesia');
    } else {
        tr.classList.remove('row-cortesia');
    }
};

// UI Generation
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

const saveSheetData = () => {
    if (!activeSlotKey) return;
    
    const fields = {
        nome: document.getElementById('sheet-nome').value,
        servico: document.getElementById('sheet-servico').value,
        tempo: document.getElementById('sheet-tempo').value,
        valor: document.getElementById('sheet-valor').value,
        quarto: document.getElementById('sheet-quarto').value
    };
    
    Object.entries(fields).forEach(([key, val]) => {
        saveAppointment(`${activeSlotKey}-${key}`, val);
    });
    
    renderAgenda();
    closeEditSheet();
};

const renderAgenda = async () => {
    const body = document.getElementById('agenda-body');
    body.innerHTML = '';
    
    const savedData = await loadAppointmentsForDate();
    const dataMap = new Map(savedData.map(item => [item.id.replace(`${selectedDate}_`, ''), item.value]));

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
        
        // Get data for this slot
        const slotData = {};
        columnKeys.forEach(k => slotData[k] = dataMap.get(`${slotKey}-${k}`) || '');

        const tdHour = document.createElement('td');
        tdHour.textContent = hourLabel;
        tdHour.classList.add('hour-cell');
        tr.appendChild(tdHour);

        // New Luxury Timeline Row
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
};

const loadControlNumber = async () => {
    const data = await loadAppointmentsForDate();
    const record = data.find(r => r.id === `${selectedDate}_control-number`);
    const input = document.getElementById('control-number');
    input.value = record ? record.value : '';
};

const initControlNumber = () => {
    const input = document.getElementById('control-number');
    input.addEventListener('input', (e) => {
        saveAppointment('control-number', e.target.value);
    });
};

const updateDateUI = () => {
    const picker = document.getElementById('date-picker');
    const label = document.getElementById('date-label');
    
    picker.value = selectedDate;
    
    // Format date for the small label above the date picker
    const [year, month, day] = selectedDate.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const weekday = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    
    label.textContent = weekday.charAt(0).toUpperCase() + weekday.slice(1);
};

const initDatePicker = () => {
    const picker = document.getElementById('date-picker');
    
    picker.addEventListener('change', (e) => {
        selectedDate = e.target.value;
        updateDateUI();
        renderAgenda();
        loadControlNumber();
    });
    
    updateDateUI();
};

// ─── Report Logic ───

const getAllAppointmentsInRange = (startDate, endDate) => {
    return new Promise((resolve) => {
        if (!db) return resolve([]);
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const results = request.result.filter(item => {
                const dateKey = item.id.split('_')[0]; // "YYYY-MM-DD"
                return dateKey >= startDate && dateKey <= endDate;
            });
            resolve(results);
        };

        request.onerror = () => resolve([]);
    });
};

const parseValue = (raw) => {
    if (!raw || raw.trim() === '') return null;
    // Remove R$, spaces, dots (thousands), then replace comma with dot
    const cleaned = raw.replace(/R\$\s*/gi, '').replace(/\./g, '').replace(',', '.').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
};

const formatBRL = (value) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateDisplay = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR');
};

const generateReport = async () => {
    const startDate = document.getElementById('report-start').value;
    const endDate = document.getElementById('report-end').value;
    const resultsDiv = document.getElementById('report-results');
    const emptyDiv = document.getElementById('report-empty');
    const reportBody = document.getElementById('report-body');

    if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim.');
        return;
    }
    if (startDate > endDate) {
        alert('A data de início deve ser anterior ou igual à data fim.');
        return;
    }

    const allRecords = await getAllAppointmentsInRange(startDate, endDate);

    // Build map: prefix -> row data
    const allByPrefix = {};
    allRecords.forEach(r => {
        const underscoreIdx = r.id.indexOf('_');
        const dateKey = r.id.substring(0, underscoreIdx);
        const field = r.id.substring(underscoreIdx + 1); // e.g. "15h00-nome"
        const dashIdx = field.indexOf('-');
        const slotPart = field.substring(0, dashIdx);   // "15h00"
        const col = field.substring(dashIdx + 1);        // "nome"
        const prefix = `${dateKey}_${slotPart}`;
        // Convert slotKey back to readable hour: "15h00" -> "15:00"
        const hourDisplay = slotPart.replace('h', ':');
        if (!allByPrefix[prefix]) allByPrefix[prefix] = { date: dateKey, hour: hourDisplay };
        allByPrefix[prefix][col] = r.value;
    });

    // Rows that have any valor entry (including cortesia)
    const rows = Object.values(allByPrefix).filter(row => {
        const v = row['valor'];
        return v && v.trim() !== '';
    });

    reportBody.innerHTML = '';
    resultsDiv.style.display = 'none';
    emptyDiv.style.display = 'none';

    if (rows.length === 0) {
        emptyDiv.style.display = 'block';
        return;
    }

    // Sort by date then hour
    rows.sort((a, b) => a.date.localeCompare(b.date) || a.hour.localeCompare(b.hour));

    let total = 0;
    let cortesiaCount = 0;

    rows.forEach(row => {
        const valorRaw = row['valor'] || '';
        const cortesia = isCortesia(valorRaw);
        const num = cortesia ? 0 : (parseValue(valorRaw) ?? 0);

        if (cortesia) {
            cortesiaCount++;
        } else {
            total += num;
        }

        const valorCell = cortesia
            ? `<span class="badge-cortesia">Cortesia</span>`
            : `<span style="font-weight:600; color:#2e7d32;">${formatBRL(num)}</span>`;

        const tr = document.createElement('tr');
        if (cortesia) tr.style.background = 'rgba(255,182,193,0.08)';
        tr.innerHTML = `
            <td>${formatDateDisplay(row.date)}</td>
            <td>${row.hour || '-'}</td>
            <td>${row['nome'] || '-'}</td>
            <td>${row['servico'] || '-'}</td>
            <td>${valorCell}</td>
            <td>${cortesia ? '<span class="badge-cortesia">Cortesia</span>' : '<span style="color:#2e7d32; font-size:0.8rem;">Pago</span>'}</td>
        `;
        reportBody.appendChild(tr);
    });

    const totalLiquido = total * 0.70;
    const plural = cortesiaCount === 1 ? 'atendimento' : 'atendimentos';

    document.getElementById('total-cortesias').textContent = `${cortesiaCount} ${plural}`;
    document.getElementById('total-bruto').textContent = formatBRL(total);
    document.getElementById('total-liquido').textContent = formatBRL(totalLiquido);

    resultsDiv.style.display = 'block';
};

const downloadReportPDF = () => {
    const element = document.getElementById('report-export-area');
    const startDate = document.getElementById('report-start').value;
    const endDate = document.getElementById('report-end').value;

    const resultsDiv = document.getElementById('report-results');
    if (resultsDiv.style.display === 'none') {
        alert('Por favor, gere o relatório primeiro.');
        return;
    }
    
    // Configuração de alto contraste e nitidez máxima
    const opt = {
        margin:       [10, 10, 10, 10],
        filename:     `Relatorio_Spa_Thera_${startDate}_a_${endDate}.pdf`,
        image:        { type: 'png' }, // PNG para evitar artefatos de compressão em textos
        html2canvas:  { 
            scale: 3, // Aumentado para 3 para nitidez extrema
            useCORS: true, 
            letterRendering: true,
            scrollX: 0,
            scrollY: 0,
            onclone: (clonedDoc) => {
                // Injeta um estilo "Premium Print" no documento clonado
                const style = clonedDoc.createElement('style');
                style.innerHTML = `
                    #report-export-area { 
                        background: white !important; 
                        padding: 40px !important; 
                        color: #2c2c2c !important;
                        font-family: 'Montserrat', sans-serif !important;
                    }
                    #report-export-area * { 
                        opacity: 1 !important; 
                        transform: none !important; 
                        animation: none !important; 
                        visibility: visible !important;
                        text-shadow: none !important;
                    }
                    .modal-header {
                        margin-bottom: 30px !important;
                        border-bottom: 2px solid #b08d57 !important;
                        padding-bottom: 20px !important;
                        text-align: left !important;
                    }
                    .modal-header h2 {
                        font-family: 'Playfair Display', serif !important;
                        font-size: 2.5rem !important;
                        color: #8a6d3b !important; /* Dourado mais escuro para leitura */
                        margin: 0 !important;
                    }
                    .modal-subtitle {
                        color: #666 !important;
                        font-size: 0.9rem !important;
                        margin-top: 5px !important;
                    }
                    #report-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        margin-top: 20px !important;
                    }
                    #report-table thead th {
                        font-family: 'Playfair Display', serif !important;
                        color: #8a6d3b !important;
                        border-bottom: 2px solid #8a6d3b !important;
                        padding: 15px !important;
                        text-align: left !important;
                        font-size: 0.85rem !important;
                    }
                    #report-table tbody td {
                        padding: 12px 15px !important;
                        border-bottom: 1px solid #eee !important;
                        color: #2c2c2c !important;
                        font-size: 0.9rem !important;
                    }
                    .report-summary {
                        margin-top: 30px !important;
                        border-top: 1px solid #b08d57 !important;
                        padding-top: 20px !important;
                        max-width: 350px !important;
                        margin-left: auto !important;
                    }
                    .summary-row {
                        display: flex !important;
                        justify-content: space-between !important;
                        padding: 10px 0 !important;
                    }
                    .summary-label {
                        color: #666 !important;
                        font-size: 0.85rem !important;
                        text-transform: uppercase !important;
                    }
                    .summary-value {
                        font-family: 'Playfair Display', serif !important;
                        font-size: 1.4rem !important;
                        font-weight: bold !important;
                        color: #2c2c2c !important;
                    }
                    .summary-value.gold {
                        color: #8a6d3b !important;
                        font-size: 1.8rem !important;
                    }
                    .badge-cortesia {
                        background: #fdf2f2 !important;
                        color: #c0392b !important;
                        border: 1px solid #c0392b !important;
                        padding: 2px 8px !important;
                        border-radius: 20px !important;
                        font-size: 0.7rem !important;
                        font-weight: bold !important;
                    }
                    .modal-filters, .modal-close {
                        display: none !important;
                    }
                `;
                clonedDoc.head.appendChild(style);
            }
        },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Inicia o processo de salvamento
    html2pdf().set(opt).from(element).save().catch(err => {
        console.error('Erro ao gerar PDF:', err);
        alert('Ocorreu um erro ao gerar o PDF. Tente novamente.');
    });
};

const openModal = () => {
    const modal = document.getElementById('report-modal');
    // Set default date range: first day of current month to today
    const today = new Date().toISOString().split('T')[0];
    const firstDay = today.substring(0, 8) + '01';
    document.getElementById('report-start').value = firstDay;
    document.getElementById('report-end').value = today;
    document.getElementById('report-results').style.display = 'none';
    document.getElementById('report-empty').style.display = 'none';
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
};

const closeModal = () => {
    const modal = document.getElementById('report-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
};

// ─── Initialization ───
document.addEventListener('DOMContentLoaded', async () => {
    initDatePicker();
    initControlNumber();
    try {
        await initDB();
        await renderAgenda();
        await loadControlNumber();
    } catch (err) {
        console.error('Failed to initialize app:', err);
    }

    document.getElementById('clear-btn').addEventListener('click', () => {
        if (confirm('Tem certeza que deseja limpar a agenda do dia selecionado?')) {
            clearCurrentDay();
        }
    });

    document.getElementById('print-btn').addEventListener('click', () => {
        window.print();
    });

    document.getElementById('report-btn').addEventListener('click', openModal);
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('generate-report-btn').addEventListener('click', generateReport);
    document.getElementById('save-pdf-btn').addEventListener('click', downloadReportPDF);

    // Edit Sheet Events
    document.getElementById('sheet-save-btn').addEventListener('click', saveSheetData);
    document.getElementById('edit-sheet').addEventListener('click', (e) => {
        if (e.target === document.getElementById('edit-sheet')) closeEditSheet();
    });

    // Handle Window Resize for dynamic UI update
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if ((lastWidth > 768 && window.innerWidth <= 768) || (lastWidth <= 768 && window.innerWidth > 768)) {
            renderAgenda();
        }
        lastWidth = window.innerWidth;
    });

    // Close modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });
});
