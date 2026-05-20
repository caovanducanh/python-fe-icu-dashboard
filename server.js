const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// Hàm phân tích file .env thủ công (không cần cài thêm thư viện dotenv)
let backendUrl = "http://localhost:8000";
try {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');
        for (const line of lines) {
            const match = line.match(/^\s*BACKEND_URL\s*=\s*(.+)$/);
            if (match) {
                // Loại bỏ khoảng trắng và dấu nháy nếu có
                backendUrl = match[1].trim().replace(/^['"]|['"]$/g, '');
                break;
            }
        }
    }
} catch (e) {
    console.error("Không thể đọc file .env. Sử dụng địa chỉ mặc định: " + backendUrl, e);
}

const server = http.createServer((req, res) => {
    // 1. Tạo file JavaScript cấu hình môi trường động khi frontend yêu cầu /env.js
    if (req.url === '/env.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(`window.env = { BACKEND_URL: "${backendUrl}" };`);
        return;
    }

    // 2. Xử lý các file tĩnh khác (HTML, CSS, JS, ảnh, v.v...)
    let reqUrl = req.url.split('?')[0]; // Bỏ qua query parameters nếu có
    let filePath = path.join(__dirname, reqUrl === '/' ? 'index.html' : reqUrl);
    
    // Ngăn chặn truy cập ra ngoài thư mục dự án (Bảo mật cơ bản)
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Access Denied');
        return;
    }

    const ext = path.extname(filePath);
    let contentType = 'text/html; charset=utf-8';
    
    switch (ext) {
        case '.css':
            contentType = 'text/css; charset=utf-8';
            break;
        case '.js':
            contentType = 'application/javascript; charset=utf-8';
            break;
        case '.png':
            contentType = 'image/png';
            break;
        case '.jpg':
        case '.jpeg':
            contentType = 'image/jpeg';
            break;
        case '.svg':
            contentType = 'image/svg+xml';
            break;
        case '.ico':
            contentType = 'image/x-icon';
            break;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Không tìm thấy file: ' + req.url);
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Lỗi hệ thống: ' + err.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`==================================================`);
    console.log(`Frontend server is running at http://localhost:${PORT}`);
    console.log(`Backend API target configured as: ${backendUrl}`);
    console.log(`==================================================`);
});
