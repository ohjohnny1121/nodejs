const db = require('./db');

/**
 * 記錄執行狀態到資料庫
 * @param {string} system - 系統名稱
 * @param {string} action - 動作名稱
 * @param {string} status - 狀態 (success/error)
 * @param {Object} details - 詳細資訊
 */
async function logExecutionStatus(system, action, status, details) {
    try {
        const query = `
            INSERT INTO execution_logs (system, action, status, details, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `;
        
        await db.query('main', query, [
            system,
            action,
            status,
            JSON.stringify(details)
        ]);
    } catch (error) {
        console.error('記錄執行狀態失敗:', error);
    }
}

module.exports = {
    logExecutionStatus
}; 