/* ==========================================
   MedICU Dashboard Application Logic (Pure JS)
   ========================================== */

// 1. Cấu hình các biến toàn cục và môi trường
const BACKEND_URL = window.env?.BACKEND_URL || 
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
        ? "http://localhost:8000" 
        : "https://python-be-icu-dashboard.onrender.com");
let patientsData = [];
let charts = {
    pieChart: null,
    barChart: null,
    lineChart: null
};
let advancedCharts = {
    timeSeriesChart: null,
    forecastChart: null
};
let riskPatientsRaw = [];

// 2. Điểm khởi đầu của chương trình (DOMContentLoaded)
document.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
    loadDashboardData();
});

// 3. Khởi tạo các trạng thái ban đầu của giao diện
function initApp() {
    // Hiển thị ngày hiện tại
    const dateSpan = document.getElementById('current-date');
    if (dateSpan) {
        const today = new Date();
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        dateSpan.textContent = today.toLocaleDateString('vi-VN', options);
    }
    
    // Gán ngày mặc định cho form thêm bệnh nhân là hôm nay
    const dateInput = document.getElementById('p-date');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Cấu hình URL động cho nút tải file mẫu Excel từ backend
    const btnDownloadSample = document.getElementById('btn-download-sample');
    if (btnDownloadSample) {
        btnDownloadSample.href = `${BACKEND_URL}/api/patients/kaggle-excel`;
    }
}

// 4. Thiết lập tất cả các sự kiện lắng nghe (EventListeners)
function setupEventListeners() {
    // Sắp xếp chuyển đổi Tab Navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabName = item.getAttribute('data-tab');
            switchTab(tabName);
        });
    });

    // Mở và đóng Modal thêm bệnh nhân
    const btnOpenModal = document.getElementById('btn-open-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancelModal = document.getElementById('btn-cancel-modal');
    const modalOverlay = document.getElementById('modal-patient');

    if (btnOpenModal && modalOverlay) {
        btnOpenModal.addEventListener('click', () => {
            // Đặt ngày nhập viện mặc định là hôm nay mỗi khi mở modal
            const dateInput = document.getElementById('p-date');
            if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
            modalOverlay.classList.add('show');
        });
    }

    const closeModal = () => modalOverlay.classList.remove('show');
    if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
    if (btnCancelModal) btnCancelModal.addEventListener('click', closeModal);
    
    // Đóng modal khi bấm ra ngoài phần thẻ card
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
    }

    // Submit form thêm bệnh nhân
    const formPatient = document.getElementById('form-patient');
    if (formPatient) {
        formPatient.addEventListener('submit', handleAddPatient);
    }

    // Tìm kiếm và bộ lọc bệnh nhân
    const searchInput = document.getElementById('patient-search');
    const filterIcu = document.getElementById('filter-icu');
    const filterAge = document.getElementById('filter-age');

    if (searchInput) searchInput.addEventListener('input', filterAndRenderPatients);
    if (filterIcu) filterIcu.addEventListener('change', filterAndRenderPatients);
    if (filterAge) filterAge.addEventListener('change', filterAndRenderPatients);

    // Kéo thả và Chọn file Excel
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-excel');
    const btnRemoveFile = document.getElementById('btn-remove-file');
    const btnUploadSubmit = document.getElementById('btn-upload-submit');

    if (uploadArea && fileInput) {
        uploadArea.addEventListener('click', (e) => {
            // Tránh kích hoạt lại khi bấm nút xóa file
            if (e.target.closest('#btn-remove-file')) return;
            fileInput.click();
        });

        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--color-green)';
            uploadArea.style.background = 'rgba(16, 185, 129, 0.05)';
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            uploadArea.style.background = 'rgba(0, 0, 0, 0.1)';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            uploadArea.style.background = 'rgba(0, 0, 0, 0.1)';
            
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                handleFileSelected();
            }
        });

        fileInput.addEventListener('change', handleFileSelected);
    }

    if (btnRemoveFile) {
        btnRemoveFile.addEventListener('click', resetUploadArea);
    }

    if (btnUploadSubmit) {
        btnUploadSubmit.addEventListener('click', handleImportExcel);
    }

    // Nút xóa toàn bộ dữ liệu để test
    const btnClearDb = document.getElementById('btn-clear-db');
    if (btnClearDb) {
        btnClearDb.addEventListener('click', handleClearDatabase);
    }

    // Các bộ lọc chỉ số trong biểu đồ Line chart
    const selectorBtns = document.querySelectorAll('.selector-btn');
    selectorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectorBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const metric = btn.getAttribute('data-metric');
            updateLineChartMetric(metric);
        });
    });

    // Bộ lọc đóng trong Ma trận rủi ro
    const btnCloseMatrixFilter = document.getElementById('btn-close-matrix-filter');
    if (btnCloseMatrixFilter) {
        btnCloseMatrixFilter.addEventListener('click', () => {
            const card = document.getElementById('matrix-filtered-card');
            if (card) card.classList.add('hidden');
            document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('selected'));
        });
    }
}

// 5. Hàm điều khiển chuyển đổi giữa các Tab
function switchTab(tabName) {
    // Ẩn tất cả các tab
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(content => content.classList.add('hidden'));
    
    // Gỡ bỏ class active ở menu sidebar
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));

    // Hiện tab được chọn
    const activeTab = document.getElementById(`tab-${tabName}`);
    if (activeTab) activeTab.classList.remove('hidden');

    const activeNavItem = document.querySelector(`.nav-item[data-tab="${tabName}"]`);
    if (activeNavItem) activeNavItem.classList.add('active');

    // Cấu hình ẩn card kết quả lọc từ ma trận khi rời khỏi tab Phân tích rủi ro
    if (tabName !== 'risk') {
        const matrixCard = document.getElementById('matrix-filtered-card');
        if (matrixCard) matrixCard.classList.add('hidden');
        document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('selected'));
    }

    // Cập nhật tiêu đề trang và gọi tải dữ liệu tương ứng cho từng tab
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    if (tabName === 'dashboard') {
        pageTitle.textContent = "Dashboard Phân Tích Bệnh Nhân ICU";
        pageSubtitle.textContent = "Dữ liệu phân tích lâm sàng và tỷ lệ tiếp nhận phòng điều trị tích cực";
        loadDashboardData();
    } else if (tabName === 'patients') {
        pageTitle.textContent = "Dữ Liệu Chi Tiết Bệnh Nhân";
        pageSubtitle.textContent = "Cập nhật thông tin bệnh nhân, đo chỉ số sinh tồn và điều chỉnh hồ sơ bệnh án";
        loadDashboardData();
    } else if (tabName === 'risk') {
        pageTitle.textContent = "Phân Tích Rủi Ro & Nguy Cơ";
        pageSubtitle.textContent = "Bản đồ nhiệt phân nhóm tuổi và Ma trận phân loại nguy cơ lâm sàng SpO2 & Nhịp tim";
        loadRiskData();
    } else if (tabName === 'timeseries') {
        pageTitle.textContent = "Chuỗi Thời Gian & Dự Báo Nhập Viện";
        pageSubtitle.textContent = "Diễn biến chỉ số sinh tồn trung bình hàng ngày và mô hình dự báo hồi quy xu hướng";
        loadTimeSeriesAndForecastData();
    } else if (tabName === 'deep') {
        pageTitle.textContent = "Phân Tích Phân Nhóm Dịch Tễ Nâng Cao";
        pageSubtitle.textContent = "Hệ số tương quan Pearson và đánh giá xác suất Relative Risk dựa trên thống kê thực tế";
        loadAdvancedStatsData();
    } else if (tabName === 'help') {
        pageTitle.textContent = "Hướng Dẫn & Tài Liệu";
        pageSubtitle.textContent = "Hướng dẫn sử dụng hệ thống và cấu trúc nhập/xuất tệp tin Excel mẫu";
    }
}

// 6. Toast Notification Helper
function showToast(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${icon}"></i>
        <div class="toast-message">${message}</div>
    `;

    container.appendChild(toast);

    // Tự động xóa sau 3.5s
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease-in reverse';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// 7. Gọi API lấy dữ liệu từ backend FastAPI
async function loadDashboardData() {
    try {
        // Gọi đồng thời cả danh sách và thống kê với địa chỉ backend động
        const [statsResponse, patientsResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/patients/stats`),
            fetch(`${BACKEND_URL}/api/patients`)
        ]);

        if (!statsResponse.ok || !patientsResponse.ok) {
            throw new Error("Không thể kết nối tới máy chủ API.");
        }

        const stats = await statsResponse.json();
        patientsData = await patientsResponse.json();

        // 1. Cập nhật các thẻ chỉ số KPI
        updateKPICards(stats);

        // 2. Vẽ/Cập nhật các biểu đồ Chart.js
        renderPieChart(stats.pie_data);
        renderBarChart(stats.bar_data);
        renderLineChart(stats.line_data);

        // 3. Hiển thị danh sách bệnh nhân lên bảng
        renderPatientsTable(patientsData);

    } catch (error) {
        console.error("Lỗi khi tải dữ liệu:", error);
        showToast("Lỗi khi tải dữ liệu từ server. Vui lòng kiểm tra kết nối.", "error");
    }
}

// 8. Cập nhật số liệu hiển thị trên các thẻ KPI
function updateKPICards(stats) {
    document.getElementById('kpi-total').textContent = stats.total_patients;
    document.getElementById('kpi-icu').textContent = stats.icu_count;
    document.getElementById('kpi-icu-rate').textContent = `${stats.icu_rate}%`;
    document.getElementById('kpi-avg-heart').innerHTML = `${stats.avg_heart_rate} <span class="unit">bpm</span>`;
    document.getElementById('kpi-avg-oxygen').textContent = `${stats.avg_oxygen}%`;
}

// 9. BIỂU ĐỒ PIE CHART: ICU vs Thường
function renderPieChart(pieData) {
    const ctx = document.getElementById('chart-icu-pie').getContext('2d');
    
    // Nếu biểu đồ đã tồn tại, hủy đi để vẽ lại dữ liệu mới
    if (charts.pieChart) {
        charts.pieChart.destroy();
    }

    if (pieData.icu === 0 && pieData.non_icu === 0) {
        ctx.clearRect(0, 0, 300, 300);
        document.getElementById('pie-analysis-text').textContent = "Không có dữ liệu bệnh nhân để hiển thị.";
        return;
    }

    charts.pieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Khoa thường (Không ICU)', 'Khoa hồi sức (ICU)'],
            datasets: [{
                data: [pieData.non_icu, pieData.icu],
                backgroundColor: ['#10b981', '#f43f5e'],
                borderColor: '#1e293b',
                borderWidth: 2,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Outfit', size: 12 },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const value = context.raw;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((value / total) * 100).toFixed(1);
                            return ` ${context.label}: ${value} ca (${percentage}%)`;
                        }
                    }
                }
            },
            cutout: '65%'
        }
    });

    // Cập nhật phân tích dưới biểu đồ
    const analysis = `Phòng hồi sức tích cực tiếp nhận <strong>${pieData.icu} ca</strong>, chiếm tỉ lệ <strong>${pieData.icu_rate}%</strong> trên tổng số ${pieData.icu + pieData.non_icu} bệnh nhân đang theo dõi.`;
    document.getElementById('pie-analysis-text').innerHTML = analysis;
}

// 10. BIỂU ĐỒ BAR CHART: Phân tích ICU theo nhóm tuổi
function renderBarChart(barData) {
    const ctx = document.getElementById('chart-age-bar').getContext('2d');

    if (charts.barChart) {
        charts.barChart.destroy();
    }

    if (!barData || barData.length === 0) {
        document.getElementById('bar-analysis-text').textContent = "Không có dữ liệu nhóm tuổi.";
        return;
    }

    const labels = barData.map(d => `${d.age_group} tuổi`);
    const totalPatients = barData.map(d => d.total_patients);
    const icuPatients = barData.map(d => d.icu_patients);
    const icuRates = barData.map(d => d.icu_rate);

    // Vẽ biểu đồ hỗn hợp (Cột ghép và Đường tỉ lệ)
    charts.barChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Số ca ICU',
                    type: 'bar',
                    data: icuPatients,
                    backgroundColor: 'rgba(244, 63, 94, 0.85)',
                    borderColor: '#f43f5e',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Tổng số ca',
                    type: 'bar',
                    data: totalPatients,
                    backgroundColor: 'rgba(99, 102, 241, 0.4)',
                    borderColor: 'rgba(99, 102, 241, 0.8)',
                    borderWidth: 1,
                    yAxisID: 'y'
                },
                {
                    label: 'Tỉ lệ ICU (%)',
                    type: 'line',
                    data: icuRates,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.2)',
                    borderWidth: 3,
                    pointBackgroundColor: '#a855f7',
                    pointRadius: 4,
                    tension: 0.3,
                    yAxisID: 'yRate'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Outfit', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Số bệnh nhân (Ca)', color: '#94a3b8', font: { family: 'Outfit' } }
                },
                yRate: {
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' }, callback: value => `${value}%` },
                    title: { display: true, text: 'Tỷ lệ ICU (%)', color: '#94a3b8', font: { family: 'Outfit' } },
                    min: 0,
                    max: 100
                }
            }
        }
    });

    // Phân tích xem nhóm tuổi nào có tỷ lệ ICU cao nhất để hiển thị ra màn hình
    let maxRateGroup = { age_group: '', icu_rate: -1 };
    barData.forEach(d => {
        if (d.icu_rate > maxRateGroup.icu_rate && d.total_patients > 0) {
            maxRateGroup = d;
        }
    });

    let analysis = "";
    if (maxRateGroup.icu_rate > 0) {
        analysis = `Nhóm tuổi lớn nhất có tỉ lệ nằm phòng ICU cao nhất là nhóm <strong>${maxRateGroup.age_group} tuổi</strong> với tỉ lệ <strong>${maxRateGroup.icu_rate}%</strong>. Phân tích chỉ ra người cao tuổi (từ 60 trở lên) có tần suất biến chứng nguy kịch và tỉ lệ chỉ định điều trị ICU cao hơn rõ rệt nhóm trẻ tuổi.`;
    } else {
        analysis = "Không ghi nhận ca bệnh nào điều trị tại khoa ICU.";
    }
    document.getElementById('bar-analysis-text').innerHTML = analysis;
}

// 11. BIỂU ĐỒ LINE CHART: Chỉ số sức khỏe trung bình
function renderLineChart(lineData) {
    const ctx = document.getElementById('chart-metrics-line').getContext('2d');

    if (charts.lineChart) {
        charts.lineChart.destroy();
    }

    if (!lineData || lineData.length === 0) {
        document.getElementById('line-analysis-text').textContent = "Không có dữ liệu sức khỏe.";
        return;
    }

    const labels = lineData.map(d => `${d.age_group} tuổi`);
    const avgHeartRates = lineData.map(d => d.avg_heart_rate);
    const avgOxygens = lineData.map(d => d.avg_oxygen_saturation);

    charts.lineChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Nhịp tim trung bình (BPM)',
                    data: avgHeartRates,
                    borderColor: '#f43f5e',
                    backgroundColor: 'rgba(244, 63, 94, 0.1)',
                    borderWidth: 3.5,
                    pointBackgroundColor: '#f43f5e',
                    pointBorderColor: '#ffffff',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.35,
                    yAxisID: 'yHeart'
                },
                {
                    label: 'SpO2 trung bình (%)',
                    data: avgOxygens,
                    borderColor: '#14b8a6',
                    backgroundColor: 'rgba(20, 184, 166, 0.1)',
                    borderWidth: 3.5,
                    pointBackgroundColor: '#14b8a6',
                    pointBorderColor: '#ffffff',
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.35,
                    yAxisID: 'yOxygen'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Outfit', size: 12 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                yHeart: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#f43f5e', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Nhịp tim (BPM)', color: '#f43f5e', font: { family: 'Outfit', weight: 'bold' } },
                    min: 50,
                    max: 130
                },
                yOxygen: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false }, // Chỉ vẽ lưới ở trục trái
                    ticks: { color: '#14b8a6', font: { family: 'Outfit' } },
                    title: { display: true, text: 'Độ bão hòa Oxy SpO2 (%)', color: '#14b8a6', font: { family: 'Outfit', weight: 'bold' } },
                    min: 80,
                    max: 100
                }
            }
        }
    });

    // Tạo nhận xét xu hướng
    // Lấy chỉ số nhóm trẻ tuổi nhất (0-19) so với lớn nhất (80+)
    const youngest = lineData[0];
    const oldest = lineData[lineData.length - 1];
    
    let analysis = "";
    if (youngest && oldest && youngest.avg_oxygen_saturation > 0 && oldest.avg_oxygen_saturation > 0) {
        const spo2Diff = (youngest.avg_oxygen_saturation - oldest.avg_oxygen_saturation).toFixed(1);
        analysis = `Ở nhóm trẻ tuổi (0-19), chỉ số SpO2 đạt ngưỡng tối ưu trung bình <strong>${youngest.avg_oxygen_saturation}%</strong>. Tuy nhiên ở nhóm người cao tuổi (trên 80), SpO2 giảm xuống trung bình còn <strong>${oldest.avg_oxygen_saturation}%</strong> (giảm ${spo2Diff}%). Điều này phản ánh rõ quy luật suy giảm chức năng hô hấp và trao đổi khí ở các bệnh nhân lớn tuổi.`;
    } else {
        analysis = "Nhịp tim bình thường dao động từ 60-100 BPM, nồng độ oxy SpO2 tối ưu từ 95-100%.";
    }
    document.getElementById('line-analysis-text').innerHTML = analysis;
}

// Hàm hỗ trợ lọc hiển thị các dataset trong Line chart bằng các nút bấm
function updateLineChartMetric(metric) {
    if (!charts.lineChart) return;
    
    if (metric === 'both') {
        charts.lineChart.setDatasetVisibility(0, true); // Hiện Nhịp tim
        charts.lineChart.setDatasetVisibility(1, true); // Hiện SpO2
        charts.lineChart.options.scales.yHeart.display = true;
        charts.lineChart.options.scales.yOxygen.display = true;
    } else if (metric === 'heart') {
        charts.lineChart.setDatasetVisibility(0, true);  // Hiện Nhịp tim
        charts.lineChart.setDatasetVisibility(1, false); // Ẩn SpO2
        charts.lineChart.options.scales.yHeart.display = true;
        charts.lineChart.options.scales.yOxygen.display = false;
    } else if (metric === 'oxygen') {
        charts.lineChart.setDatasetVisibility(0, false); // Ẩn Nhịp tim
        charts.lineChart.setDatasetVisibility(1, true);  // Hiện SpO2
        charts.lineChart.options.scales.yHeart.display = false;
        charts.lineChart.options.scales.yOxygen.display = true;
    }
    
    charts.lineChart.update();
}

let currentPage = 1;
const rowsPerPage = 10;

// 12. HIỂN THỊ DANH SÁCH BỆNH NHÂN TRÊN BẢNG (Tab Danh Sách)
function renderPatientsTable(patients, page = 1) {
    const tbody = document.getElementById('patient-table-body');
    const rowCountSpan = document.getElementById('table-row-count');
    const paginationContainer = document.getElementById('table-pagination');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (patients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-muted py-5">
                    <i class="fa-regular fa-folder-open" style="font-size: 2rem; display: block; margin-bottom: 0.5rem;"></i>
                    Không có bệnh nhân nào khớp với bộ lọc tìm kiếm.
                </td>
            </tr>
        `;
        if (rowCountSpan) rowCountSpan.textContent = "Hiển thị 0 bệnh nhân";
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    
    currentPage = page;
    const totalPages = Math.ceil(patients.length / rowsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, patients.length);
    const patientsOnPage = patients.slice(startIndex, endIndex);
    
    patientsOnPage.forEach(p => {
        const tr = document.createElement('tr');
        
        // Cột ICU badge
        const icuBadge = p.icu === 1 
            ? `<span class="badge-icu active"><i class="fa-solid fa-circle-exclamation"></i> 1 - ICU</span>`
            : `<span class="badge-icu inactive"><i class="fa-solid fa-circle-check"></i> 0 - Thường</span>`;
            
        // Thao tác xóa
        const deleteBtn = `
            <button class="btn-icon btn-delete-row" onclick="deletePatient(${p.id}, '${p.name}')" title="Xóa bệnh nhân này">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        
        tr.innerHTML = `
            <td><strong>#${p.id}</strong></td>
            <td><strong>${p.name}</strong></td>
            <td>${p.age} tuổi</td>
            <td>${p.gender}</td>
            <td>${icuBadge}</td>
            <td><span class="text-heart">${p.heart_rate}</span> bpm</td>
            <td><span class="text-oxygen">${p.oxygen_saturation}%</span></td>
            <td>${p.admission_date}</td>
            <td>${deleteBtn}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    if (rowCountSpan) {
        rowCountSpan.textContent = `Hiển thị ${startIndex + 1} - ${endIndex} trên tổng số ${patients.length} bệnh nhân`;
    }
    
    // Render pagination controls
    if (paginationContainer) {
        let paginationHTML = '';
        
        // Prev button
        paginationHTML += `<button class="btn-page ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}><i class="fa-solid fa-chevron-left"></i></button>`;
        
        // Page numbers
        let startPage = Math.max(1, currentPage - 2);
        let endPage = Math.min(totalPages, currentPage + 2);
        
        if (startPage > 1) {
            paginationHTML += `<button class="btn-page" onclick="changePage(1)">1</button>`;
            if (startPage > 2) paginationHTML += `<span class="page-ellipsis">...</span>`;
        }
        
        for (let i = startPage; i <= endPage; i++) {
            paginationHTML += `<button class="btn-page ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        }
        
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) paginationHTML += `<span class="page-ellipsis">...</span>`;
            paginationHTML += `<button class="btn-page" onclick="changePage(${totalPages})">${totalPages}</button>`;
        }
        
        // Next button
        paginationHTML += `<button class="btn-page ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}><i class="fa-solid fa-chevron-right"></i></button>`;
        
        paginationContainer.innerHTML = paginationHTML;
    }
}

// 13. LỌC VÀ TÌM KIẾM BỆNH NHÂN (Khi nhập ô tìm kiếm hoặc thay đổi Select)
function filterAndRenderPatients() {
    const searchVal = document.getElementById('patient-search').value.toLowerCase().trim();
    const icuVal = document.getElementById('filter-icu').value;
    const ageVal = document.getElementById('filter-age').value;
    
    let filtered = [...patientsData];
    
    // 1. Tìm kiếm theo họ tên bệnh nhân
    if (searchVal) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(searchVal));
    }
    
    // 2. Lọc theo tình trạng ICU
    if (icuVal === 'icu') {
        filtered = filtered.filter(p => p.icu === 1);
    } else if (icuVal === 'non-icu') {
        filtered = filtered.filter(p => p.icu === 0);
    }
    
    // 3. Lọc theo nhóm tuổi
    if (ageVal !== 'all') {
        filtered = filtered.filter(p => {
            if (ageVal === '0-19') return p.age < 20;
            if (ageVal === '20-39') return p.age >= 20 && p.age < 40;
            if (ageVal === '40-59') return p.age >= 40 && p.age < 60;
            if (ageVal === '60-79') return p.age >= 60 && p.age < 80;
            if (ageVal === '80+') return p.age >= 80;
            return true;
        });
    }
    
    renderPatientsTable(filtered, 1);
}

// Hàm chuyển trang
function changePage(newPage) {
    const searchVal = document.getElementById('patient-search').value.toLowerCase().trim();
    const icuVal = document.getElementById('filter-icu').value;
    const ageVal = document.getElementById('filter-age').value;
    
    let filtered = [...patientsData];
    
    if (searchVal) filtered = filtered.filter(p => p.name.toLowerCase().includes(searchVal));
    
    if (icuVal === 'icu') filtered = filtered.filter(p => p.icu === 1);
    else if (icuVal === 'non-icu') filtered = filtered.filter(p => p.icu === 0);
    
    if (ageVal !== 'all') {
        filtered = filtered.filter(p => {
            if (ageVal === '0-19') return p.age < 20;
            if (ageVal === '20-39') return p.age >= 20 && p.age < 40;
            if (ageVal === '40-59') return p.age >= 40 && p.age < 60;
            if (ageVal === '60-79') return p.age >= 60 && p.age < 80;
            if (ageVal === '80+') return p.age >= 80;
            return true;
        });
    }
    
    renderPatientsTable(filtered, newPage);
}
window.changePage = changePage;

// 14. HÀM THÊM BỆNH NHÂN MỚI THỦ CÔNG QUA FORM
async function handleAddPatient(e) {
    e.preventDefault();
    
    const name = document.getElementById('p-name').value.trim();
    const age = parseInt(document.getElementById('p-age').value);
    const gender = document.getElementById('p-gender').value;
    const heart_rate = parseInt(document.getElementById('p-heart').value);
    const oxygen_saturation = parseInt(document.getElementById('p-oxygen').value);
    const admission_date = document.getElementById('p-date').value;
    
    // Lấy giá trị ICU từ các radio button
    const icu = parseInt(document.querySelector('input[name="p-icu"]:checked').value);
    
    // Ràng buộc kiểm tra
    if (!name || isNaN(age) || !gender || isNaN(heart_rate) || isNaN(oxygen_saturation) || !admission_date) {
        showToast("Vui lòng điền đầy đủ thông tin bắt buộc.", "error");
        return;
    }
    
    const newPatient = {
        name,
        age,
        gender,
        icu,
        heart_rate,
        oxygen_saturation,
        admission_date
    };
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/patients`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newPatient)
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showToast(result.message, "success");
            
            // Đóng Modal và reset Form
            document.getElementById('modal-patient').classList.remove('show');
            document.getElementById('form-patient').reset();
            
            // Cập nhật lại toàn bộ bảng và biểu đồ
            loadDashboardData();
        } else {
            showToast(result.detail || "Không thể thêm bệnh nhân.", "error");
        }
    } catch (err) {
        console.error("Lỗi khi thêm:", err);
        showToast("Có lỗi xảy ra khi kết nối máy chủ.", "error");
    }
}

// 15. HÀM XÓA BỆNH NHÂN (Gọi bằng onClick trong bảng)
async function deletePatient(id, name) {
    const confirmDelete = confirm(`Bạn có chắc chắn muốn xóa bệnh nhân "${name}" (Mã #${id}) khỏi cơ sở dữ liệu SQLite?`);
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/patients/${id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showToast(result.message, "success");
            // Tải lại dữ liệu dashboard
            loadDashboardData();
        } else {
            showToast(result.detail || "Không thể xóa bệnh nhân này.", "error");
        }
    } catch (err) {
        console.error("Lỗi khi xóa:", err);
        showToast("Lỗi khi kết nối máy chủ để xóa bệnh nhân.", "error");
    }
}

// 16. XỬ LÝ KHI CHỌN FILE EXCEL (Cập nhật giao diện upload)
function handleFileSelected() {
    const fileInput = document.getElementById('file-excel');
    const placeholder = document.getElementById('upload-placeholder');
    const fileInfo = document.getElementById('upload-file-info');
    const selectedFilename = document.getElementById('selected-filename');
    const btnUploadSubmit = document.getElementById('btn-upload-submit');
    
    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        selectedFilename.textContent = file.name;
        
        // Chuyển đổi trạng thái giao diện
        placeholder.classList.add('hidden');
        fileInfo.classList.remove('hidden');
        btnUploadSubmit.classList.remove('hidden');
    }
}

// Reset khu vực upload về ban đầu
function resetUploadArea() {
    const fileInput = document.getElementById('file-excel');
    const placeholder = document.getElementById('upload-placeholder');
    const fileInfo = document.getElementById('upload-file-info');
    const btnUploadSubmit = document.getElementById('btn-upload-submit');
    
    fileInput.value = '';
    placeholder.classList.remove('hidden');
    fileInfo.classList.add('hidden');
    btnUploadSubmit.classList.add('hidden');
}

// 17. HÀM IMPORT FILE EXCEL LÊN SERVER
async function handleImportExcel() {
    const fileInput = document.getElementById('file-excel');
    const btnUploadSubmit = document.getElementById('btn-upload-submit');
    
    if (fileInput.files.length === 0) {
        showToast("Vui lòng chọn tệp tin Excel cần tải lên.", "error");
        return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    // Đổi nút bấm sang trạng thái loading
    const originalHTML = btnUploadSubmit.innerHTML;
    btnUploadSubmit.disabled = true;
    btnUploadSubmit.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang import...`;
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/patients/import`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok && result.status === 'success') {
            showToast(result.message, "success");
            
            // Xóa file đã chọn và tải lại dữ liệu dashboard
            resetUploadArea();
            loadDashboardData();
        } else {
            showToast(result.detail || "Lỗi khi import file Excel.", "error");
            btnUploadSubmit.disabled = false;
            btnUploadSubmit.innerHTML = originalHTML;
        }
    } catch (err) {
        console.error("Lỗi khi import:", err);
        showToast("Có lỗi xảy ra khi truyền tải file lên server.", "error");
        btnUploadSubmit.disabled = false;
        btnUploadSubmit.innerHTML = originalHTML;
    }
}

// Gắn hàm deletePatient vào đối tượng Window để các dòng bảng HTML gọi được
window.deletePatient = deletePatient;

// ==========================================
// 10. Các Hàm Xử Lý Tính Năng Nâng Cao (Ma Trận Rủi Ro, Treemap, Hồi Quy & Chuỗi Thời Gian)
// ==========================================

async function loadRiskData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/patients/risk-matrix`);
        if (!response.ok) throw new Error("Không thể tải dữ liệu ma trận rủi ro");
        const patients = await response.json();
        riskPatientsRaw = patients;
        
        // Dựng Ma trận rủi ro
        renderRiskMatrix(patients);
        
        // Dựng Bản đồ Rủi ro (Treemap)
        renderTreemapFromPatients(patients);
        
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    }
}

function renderRiskMatrix(patients) {
    const matrix = {
        high: { bradycardia: [], normal: [], tachycardia: [] },
        medium: { bradycardia: [], normal: [], tachycardia: [] },
        low: { bradycardia: [], normal: [], tachycardia: [] }
    };
    
    patients.forEach(p => {
        if (matrix[p.spo2_cat] && matrix[p.spo2_cat][p.hr_cat]) {
            matrix[p.spo2_cat][p.hr_cat].push(p);
        }
    });
    
    const cells = [
        { elId: 'cell-high-bradycardia', spo2: 'high', hr: 'bradycardia' },
        { elId: 'cell-high-normal', spo2: 'high', hr: 'normal' },
        { elId: 'cell-high-tachycardia', spo2: 'high', hr: 'tachycardia' },
        { elId: 'cell-medium-bradycardia', spo2: 'medium', hr: 'bradycardia' },
        { elId: 'cell-medium-normal', spo2: 'medium', hr: 'normal' },
        { elId: 'cell-medium-tachycardia', spo2: 'medium', hr: 'tachycardia' },
        { elId: 'cell-low-bradycardia', spo2: 'low', hr: 'bradycardia' },
        { elId: 'cell-low-normal', spo2: 'low', hr: 'normal' },
        { elId: 'cell-low-tachycardia', spo2: 'low', hr: 'tachycardia' }
    ];
    
    cells.forEach(({ elId, spo2, hr }) => {
        const cell = document.getElementById(elId);
        if (cell) {
            const list = matrix[spo2][hr];
            
            // Xóa sự kiện cũ bằng cách clone thẻ
            const newCell = cell.cloneNode(true);
            newCell.textContent = list.length;
            
            // Nếu có bệnh nhân ở nhóm nguy kịch (low SpO2 & high HR), tạo hiệu ứng pulse nhấp nháy đặc biệt
            if (spo2 === 'low' && hr === 'tachycardia' && list.length > 0) {
                newCell.classList.add('critical-pulse');
            } else {
                newCell.classList.remove('critical-pulse');
            }
            
            cell.parentNode.replaceChild(newCell, cell);
            
            newCell.addEventListener('click', () => {
                document.querySelectorAll('.matrix-cell').forEach(c => c.classList.remove('selected'));
                newCell.classList.add('selected');
                showMatrixFilteredPatients(spo2, hr, list);
            });
        }
    });
}

function showMatrixFilteredPatients(spo2, hr, list) {
    const card = document.getElementById('matrix-filtered-card');
    const tbody = document.getElementById('matrix-filtered-tbody');
    const title = document.getElementById('matrix-filter-title');
    
    if (!card || !tbody || !title) return;
    
    card.classList.remove('hidden');
    
    const spo2Text = spo2 === 'high' ? 'SpO2 Cao (≥95%)' : (spo2 === 'medium' ? 'SpO2 Trung bình (90-94%)' : 'SpO2 Thấp (<90%)');
    const hrText = hr === 'bradycardia' ? 'Nhịp tim Chậm (<60 bpm)' : (hr === 'normal' ? 'Nhịp tim Bình thường (60-100)' : 'Nhịp tim Nhanh (>100 bpm)');
    
    title.innerHTML = `<i class="fa-solid fa-hospital-user text-rose"></i> Nhóm: <span class="text-primary">${spo2Text}</span> & <span class="text-primary">${hrText}</span> (${list.length} Bệnh nhân)`;
    tbody.innerHTML = '';
    
    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Không có bệnh nhân nào trong nhóm này.</td></tr>';
        return;
    }
    
    list.forEach(p => {
        const tr = document.createElement('tr');
        const icuClass = p.icu === 1 ? 'badge-icu active' : 'badge-icu inactive';
        const icuText = p.icu === 1 ? 'ICU' : 'Thường';
        
        tr.innerHTML = `
            <td>#${p.id}</td>
            <td><strong>${p.name}</strong></td>
            <td>${p.age}</td>
            <td>${p.gender}</td>
            <td><span class="${icuClass}">${icuText}</span></td>
            <td><span class="text-heart">${p.heart_rate} BPM</span></td>
            <td><span class="text-oxygen">${p.oxygen_saturation}%</span></td>
            <td>${p.admission_date}</td>
        `;
        tbody.appendChild(tr);
    });
    
    card.scrollIntoView({ behavior: 'smooth' });
}

function getAgeGroupLabel(age) {
    if (age < 20) return "0-19";
    if (age < 40) return "20-39";
    if (age < 60) return "40-59";
    if (age < 80) return "60-79";
    return "80+";
}

function renderTreemapFromPatients(patients) {
    const container = document.getElementById('treemap-container');
    const analysisText = document.getElementById('treemap-analysis-text');
    if (!container) return;
    
    const groups = {
        "0-19": { count: 0, icu: 0 },
        "20-39": { count: 0, icu: 0 },
        "40-59": { count: 0, icu: 0 },
        "60-79": { count: 0, icu: 0 },
        "80+": { count: 0, icu: 0 }
    };
    
    patients.forEach(p => {
        const gr = getAgeGroupLabel(p.age);
        if (groups[gr]) {
            groups[gr].count += 1;
            if (p.icu === 1) groups[gr].icu += 1;
        }
    });
    
    const data = Object.keys(groups).map(key => {
        const g = groups[key];
        const rate = g.count > 0 ? Math.round((g.icu / g.count) * 100) : 0;
        return {
            label: key,
            count: g.count,
            icuRate: rate
        };
    }).filter(d => d.count > 0);
    
    renderTreemap(container, data);
    
    if (data.length > 0) {
        const highestCountGroup = [...data].sort((a,b) => b.count - a.count)[0];
        const highestIcuGroup = [...data].sort((a,b) => b.icuRate - a.icuRate)[0];
        
        analysisText.innerHTML = `
            <i class="fa-solid fa-circle-info text-teal"></i> <strong>Nhận xét Bản đồ Rủi ro:</strong> 
            Nhóm tuổi <strong>${highestCountGroup.label}</strong> có lượng bệnh nhân đông nhất (${highestCountGroup.count} BN). 
            Tuy nhiên, tỉ lệ cần hồi sức tích cực (ICU) cao nhất thuộc về nhóm tuổi <strong>${highestIcuGroup.label}</strong> (${highestIcuGroup.icuRate}% ICU), phản ánh đúng quy luật lão hóa lâm sàng.
        `;
    } else {
        analysisText.innerHTML = `Chưa có dữ liệu bệnh nhân để phân tích bản đồ rủi ro.`;
    }
}

function renderTreemap(containerEl, data) {
    containerEl.innerHTML = '';
    const width = containerEl.clientWidth || 600;
    const height = 320; // Fixed CSS height
    
    data.sort((a, b) => b.count - a.count);
    const total = data.reduce((sum, item) => sum + item.count, 0);
    if (total === 0) {
        containerEl.innerHTML = '<div class="text-center text-muted py-5">Không có dữ liệu bệnh nhân</div>';
        return;
    }

    let remainingX = 0;
    let remainingY = 0;
    let remainingW = width;
    let remainingH = height;

    data.forEach((item, index) => {
        const block = document.createElement('div');
        block.className = 'treemap-block';
        
        let w, h;
        if (remainingW >= remainingH) {
            w = remainingW * (item.count / data.slice(index).reduce((sum, d) => sum + d.count, 0));
            h = remainingH;
            
            block.style.left = `${remainingX}px`;
            block.style.top = `${remainingY}px`;
            block.style.width = `${w}px`;
            block.style.height = `${h}px`;
            
            remainingX += w;
            remainingW -= w;
        } else {
            w = remainingW;
            h = remainingH * (item.count / data.slice(index).reduce((sum, d) => sum + d.count, 0));
            
            block.style.left = `${remainingX}px`;
            block.style.top = `${remainingY}px`;
            block.style.width = `${w}px`;
            block.style.height = `${h}px`;
            
            remainingY += h;
            remainingH -= h;
        }
        
        block.style.position = 'absolute';
        block.style.boxSizing = 'border-box';
        
        let bg = 'rgba(16, 185, 129, 0.25)';
        let border = 'rgba(16, 185, 129, 0.5)';
        let textClass = 'text-success';
        if (item.icuRate > 50) {
            bg = 'rgba(244, 63, 94, 0.25)';
            border = 'rgba(244, 63, 94, 0.5)';
            textClass = 'text-danger';
        } else if (item.icuRate > 20) {
            bg = 'rgba(249, 115, 22, 0.25)';
            border = 'rgba(249, 115, 22, 0.5)';
            textClass = 'text-warning';
        }
        
        block.style.backgroundColor = bg;
        block.style.borderColor = border;
        
        block.innerHTML = `
            <div class="block-label">Nhóm ${item.label}</div>
            <div class="block-count">${item.count} bệnh nhân</div>
            <div class="block-icu ${textClass}">ICU: ${item.icuRate}%</div>
        `;
        
        containerEl.appendChild(block);
    });
}

async function loadTimeSeriesAndForecastData() {
    try {
        const [tsResponse, forecastResponse] = await Promise.all([
            fetch(`${BACKEND_URL}/api/patients/time-series`),
            fetch(`${BACKEND_URL}/api/patients/forecast`)
        ]);
        
        if (!tsResponse.ok || !forecastResponse.ok) {
            throw new Error("Không thể lấy dữ liệu chuỗi thời gian hoặc dự báo");
        }
        
        const tsData = await tsResponse.json();
        const forecastData = await forecastResponse.json();
        
        renderTimeSeriesChart(tsData);
        renderForecastChart(tsData, forecastData);
        
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    }
}

function renderTimeSeriesChart(data) {
    const ctx = document.getElementById('chart-timeseries-line');
    if (!ctx) return;
    
    if (advancedCharts.timeSeriesChart) {
        advancedCharts.timeSeriesChart.destroy();
    }
    
    const labels = data.map(d => d.admission_date);
    const patientCounts = data.map(d => d.patient_count);
    const avgHeartRates = data.map(d => d.avg_heart_rate);
    const avgOxygens = data.map(d => d.avg_oxygen_saturation);
    
    advancedCharts.timeSeriesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Lượt nhập viện',
                    data: patientCounts,
                    type: 'bar',
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: '#6366f1',
                    borderWidth: 1,
                    yAxisID: 'y1'
                },
                {
                    label: 'Nhịp tim trung bình (BPM)',
                    data: avgHeartRates,
                    borderColor: '#f43f5e',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.25,
                    yAxisID: 'y'
                },
                {
                    label: 'SpO2 trung bình (%)',
                    data: avgOxygens,
                    borderColor: '#14b8a6',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    tension: 0.25,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 50,
                    max: 130,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    title: { display: true, text: 'Chỉ số (BPM / SpO2)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    grid: { drawOnChartArea: false },
                    title: { display: true, text: 'Số lượng (Bệnh nhân)', color: '#94a3b8' },
                    ticks: { 
                        color: '#94a3b8',
                        stepSize: 1,
                        precision: 0
                    }
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            }
        }
    });
    
    const analysisText = document.getElementById('timeseries-analysis-text');
    if (analysisText && data.length > 0) {
        const total = data.reduce((sum, d) => sum + d.patient_count, 0);
        const avgSpO2 = Math.round(data.reduce((sum, d) => sum + d.avg_oxygen_saturation, 0) / data.length);
        const avgHR = Math.round(data.reduce((sum, d) => sum + d.avg_heart_rate, 0) / data.length);
        
        analysisText.innerHTML = `
            <i class="fa-solid fa-circle-info text-cyan"></i> <strong>Nhận xét Chuỗi thời gian:</strong> 
            Tổng cộng đã tiếp nhận <strong>${total}</strong> lượt bệnh nhân. 
            Mức SpO2 trung bình ghi nhận được là <strong>${avgSpO2}%</strong> và nhịp tim trung bình là <strong>${avgHR} BPM</strong> toàn khóa.
        `;
    }
}

function renderForecastChart(tsData, forecastData) {
    const ctx = document.getElementById('chart-forecast-line');
    if (!ctx) return;
    
    if (advancedCharts.forecastChart) {
        advancedCharts.forecastChart.destroy();
    }
    
    const actualLabels = tsData.map(d => d.admission_date);
    const forecastLabels = forecastData.map(d => d.admission_date);
    const allLabels = [...actualLabels, ...forecastLabels];
    
    const actualSeries = [...tsData.map(d => d.patient_count)];
    const forecastSeries = Array(actualLabels.length).fill(null);
    
    if (tsData.length > 0) {
        forecastSeries[actualLabels.length - 1] = tsData[tsData.length - 1].patient_count;
    }
    
    forecastData.forEach(d => {
        forecastSeries.push(d.patient_count);
        actualSeries.push(null);
    });
    
    advancedCharts.forecastChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: allLabels,
            datasets: [
                {
                    label: 'Số lượt nhập viện thực tế',
                    data: actualSeries,
                    borderColor: '#a855f7',
                    backgroundColor: 'rgba(168, 85, 247, 0.08)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.2
                },
                {
                    label: 'Xu hướng dự báo (7 ngày tới)',
                    data: forecastSeries,
                    borderColor: '#14b8a6',
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    borderDash: [6, 6],
                    pointStyle: 'rectRot',
                    pointRadius: 6,
                    tension: 0.2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    title: { display: true, text: 'Số lượng bệnh nhân (Lượt)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8', stepSize: 1 },
                    min: 0
                },
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#94a3b8' }
                }
            },
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            }
        }
    });
    
    const analysisText = document.getElementById('forecast-analysis-text');
    if (analysisText && forecastData.length > 0) {
        const totalForecast = Math.round(forecastData.reduce((sum, d) => sum + d.patient_count, 0));
        const firstDay = forecastData[0];
        const lastDay = forecastData[forecastData.length - 1];
        
        let trendWord = "ổn định";
        if (lastDay.patient_count > firstDay.patient_count) trendWord = "tăng nhẹ";
        else if (lastDay.patient_count < firstDay.patient_count) trendWord = "giảm nhẹ";
        
        analysisText.innerHTML = `
            <i class="fa-solid fa-wand-magic-sparkles text-purple"></i> <strong>Nhận xét dự báo:</strong> 
            Mô hình dự báo hồi quy xu hướng ước tính sẽ tiếp nhận khoảng <strong>${totalForecast} bệnh nhân mới</strong> trong 7 ngày tới. 
            Xu hướng dự kiến có phần <strong>${trendWord}</strong>.
        `;
    }
}

async function loadAdvancedStatsData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/patients/advanced-stats`);
        if (!response.ok) throw new Error("Không thể tải chỉ số nâng cao");
        const stats = await response.json();
        
        const corrAgeSpO2 = document.getElementById('stat-corr-age-spo2');
        const progressAgeSpO2 = document.getElementById('progress-age-spo2');
        const descAgeSpO2 = document.getElementById('desc-age-spo2');
        if (corrAgeSpO2 && progressAgeSpO2 && descAgeSpO2) {
            corrAgeSpO2.textContent = stats.age_spo2_corr.toFixed(3);
            const w = Math.abs(stats.age_spo2_corr) * 100;
            progressAgeSpO2.style.width = `${w}%`;
            
            let description = "Không có tương quan tuyến tính.";
            if (stats.age_spo2_corr < -0.7) {
                description = "Tương quan nghịch rất mạnh. Độ tuổi tăng tỷ lệ nghịch rõ rệt với SpO2.";
            } else if (stats.age_spo2_corr < -0.3) {
                description = "Tương quan nghịch vừa phải. Người lớn tuổi có xu hướng SpO2 thấp hơn.";
            }
            descAgeSpO2.textContent = description;
        }
        
        const corrAgeHr = document.getElementById('stat-corr-age-hr');
        const progressAgeHr = document.getElementById('progress-age-hr');
        const descAgeHr = document.getElementById('desc-age-hr');
        if (corrAgeHr && progressAgeHr && descAgeHr) {
            corrAgeHr.textContent = stats.age_hr_corr.toFixed(3);
            const w = Math.abs(stats.age_hr_corr) * 100;
            progressAgeHr.style.width = `${w}%`;
            
            let description = "Không có tương quan tuyến tính.";
            if (stats.age_hr_corr > 0.7) {
                description = "Tương quan thuận rất mạnh. Bệnh nhân lớn tuổi có nhịp tim trung bình cao hơn.";
            } else if (stats.age_hr_corr > 0.3) {
                description = "Tương quan thuận vừa phải. Người cao tuổi có nhịp tim nhanh hơn khi nhập viện.";
            }
            descAgeHr.textContent = description;
        }
        
        const relRisk = document.getElementById('stat-relative-risk');
        const descRisk = document.getElementById('desc-relative-risk');
        if (relRisk && descRisk) {
            relRisk.textContent = `${stats.relative_risk.toFixed(1)}x`;
            descRisk.innerHTML = `Tỉ số ICU ở người cao tuổi (&ge;60 tuổi) là <strong>${stats.elderly_icu_risk}%</strong> so với nhóm người trẻ tuổi là <strong>${stats.younger_icu_risk}%</strong>.`;
        }
        
        const p1 = document.getElementById('report-p1');
        const p2 = document.getElementById('report-p2');
        const list = document.getElementById('report-list');
        
        if (p1) {
            p1.innerHTML = `Hệ số tương quan Pearson giữa Độ tuổi và SpO2 là <strong>${stats.age_spo2_corr}</strong>. 
            Giá trị âm chứng minh tình trạng suy giảm nồng độ oxy máu (SpO2) có liên hệ mật thiết với độ tuổi. 
            Ngược lại, hệ số tương quan giữa Độ tuổi và Nhịp tim là <strong>${stats.age_hr_corr}</strong> chỉ ra rằng bệnh nhân lớn tuổi thường đi kèm nhịp tim nhanh khi nhập viện do suy giảm chức năng tim mạch hoặc phản ứng căng thẳng lâm sàng.`;
        }
        
        if (p2) {
            p2.innerHTML = `Tỉ số Rủi ro tương đối (Relative Risk - RR) ghi nhận mức <strong>${stats.relative_risk}</strong>. 
            Điều này đồng nghĩa với việc nhóm bệnh nhân trên 60 tuổi có xác suất phải chuyển điều trị tại khoa Hồi sức tích cực (ICU) cao gấp <strong>${stats.relative_risk} lần</strong> so với nhóm bệnh nhân dưới 60 tuổi. 
            Sự chênh lệch này có ý nghĩa thống kê y học dịch tễ rất lớn, khẳng định độ tuổi là yếu tố tiên lượng độc lập hàng đầu đối với nguy cơ ICU.`;
        }
        
        if (list) {
            list.innerHTML = `
                <li><strong>Phân loại nguy cơ sớm:</strong> Áp dụng đo SpO2 và nhịp tim bắt buộc ngay tại phòng khám sàng lọc ban đầu đối với mọi bệnh nhân trên 60 tuổi.</li>
                <li><strong>Cảnh báo sớm chỉ số SpO2:</strong> Bất cứ bệnh nhân cao tuổi nào có SpO2 dưới 92% cần được chỉ định thở oxy hỗ trợ lập tức và đặt trong trạng thái theo dõi sát, chuẩn bị phương án chuyển ICU.</li>
                <li><strong>Tối ưu hóa nguồn lực:</strong> Do nhóm cao tuổi chiếm phần lớn lưu lượng ICU, bệnh viện cần ưu tiên dự trữ giường bệnh hồi sức tích cực và máy thở cho nhóm đối tượng này trong giai đoạn cao điểm.</li>
            `;
        }
        
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    }
}

// 21. Hàm xử lý xóa sạch cơ sở dữ liệu để test
async function handleClearDatabase() {
    const confirmed = confirm("CẢNH BÁO: Bạn có chắc chắn muốn XÓA TOÀN BỘ bệnh nhân khỏi cơ sở dữ liệu SQLite không?\nHành động này không thể hoàn tác!");
    if (!confirmed) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/patients`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error("Không thể xóa toàn bộ bệnh nhân từ máy chủ.");
        }

        const result = await response.json();
        showToast(result.message || "Đã xóa toàn bộ dữ liệu thành công.", "success");
        
        // Nạp lại toàn bộ dữ liệu (lúc này sẽ rỗng)
        await loadDashboardData();
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
    }
}
