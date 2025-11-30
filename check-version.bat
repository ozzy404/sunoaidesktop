@echo off
chcp 65001 >nul
echo ========================================
echo   Оновлення Suno Desktop Player
echo ========================================
echo.

echo [1/3] Перевірка файлів...
if not exist "src\main.js" (
    echo ❌ ПОМИЛКА: Запустіть цей скрипт з папки проекту!
    pause
    exit /b 1
)

echo [2/3] Створення резервної копії...
if exist "src\main.js.backup" (
    echo   Резервна копія вже існує, пропускаємо...
) else (
    copy "src\main.js" "src\main.js.backup" >nul
    echo   ✓ Створено src\main.js.backup
)

echo [3/3] Перевірка версії файлу...
findstr /C:"showCookieInputWindow" "src\main.js" >nul
if %errorlevel% equ 0 (
    echo   ✓ Файл main.js має правильну версію!
    echo.
    echo ========================================
    echo   Всі файли оновлені
    echo ========================================
    echo.
    echo Тепер можна запустити програму:
    echo   npm start
    echo.
) else (
    echo   ❌ Файл main.js застарілий!
    echo.
    echo ========================================
    echo   Необхідне оновлення
    echo ========================================
    echo.
    echo Будь ласка, оновіть файл src\main.js з репозиторію GitHub.
    echo Див. інструкції у файлі UPDATE_INSTRUCTIONS.md
    echo.
)

pause
