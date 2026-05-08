@echo off
chcp 65001 >nul
echo ============================================
echo   ติดตั้งระบบใบสำคัญจ่ายเงิน - INC Technology
echo ============================================
echo.

echo [1/3] ลบ node_modules เก่า...
if exist node_modules rmdir /s /q node_modules
if exist package-lock.json del package-lock.json

echo [2/3] ติดตั้ง dependencies...
call npm install --no-optional
if %errorlevel% neq 0 (
    echo.
    echo ❌ ติดตั้งไม่สำเร็จ กรุณาตรวจสอบว่าติดตั้ง Node.js แล้ว
    echo    ดาวน์โหลดที่: https://nodejs.org
    pause
    exit /b 1
)

echo [3/3] เสร็จสิ้น!
echo.
echo ============================================
echo   ✅ ติดตั้งสำเร็จ!
echo   รันคำสั่ง: npm start
echo   แล้วเปิด: http://localhost:3000
echo ============================================
pause
