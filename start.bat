@echo off
chcp 65001 >nul
echo ============================================
echo   ระบบใบสำคัญจ่ายเงิน - INC Technology
echo   กำลังเปิด server...
echo ============================================
echo.

if not exist node_modules (
    echo node_modules ไม่พบ กำลังติดตั้ง...
    call npm install --no-optional
)

echo เปิด http://localhost:3000 ในเบราว์เซอร์...
start http://localhost:3000
node server.js
pause
