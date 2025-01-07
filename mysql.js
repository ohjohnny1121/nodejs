const mysql = require('mysql2/promise');

// 連接池管理
const pools = new Map();

/**
 * 建立 MySQL 連接池
 * @param {Object} config - 資料庫配置
 * @returns {Promise<mysql.Pool>} 連接池實例
 */
async function createPool(config) {
    const key = `${config.host}_${config.database}`;
    if (!pools.has(key)) {
        console.log('創建新連接池:', key);
        const pool = mysql.createPool({
            ...config,
            waitForConnections: true,
            connectionLimit: 200,
            queueLimit: 0,
            // 設置空閒超時
            idleTimeout: 60000 // 60秒
        });
        pools.set(key, pool);
    }
    return pools.get(key);
}

/**
 * 獲取資料庫連接
 * @param {Object} config - 資料庫配置
 * @returns {Promise<mysql.Connection>} 資料庫連接
 */
async function mysqlConnection(config) {
    try {
        const pool = await createPool(config);
        const connection = await pool.getConnection();
        console.log('活動連接數:', pools.size);
        return connection;
    } catch (error) {
        console.error('建立連接失敗:', error);
        throw error;
    }
}

/**
 * 執行 SQL 查詢
 * @param {mysql.Connection} connection - 資料庫連接
 * @param {string} sql - SQL 查詢語句
 * @param {Array} [values] - 查詢參數
 * @returns {Promise<any>} 查詢結果
 */
async function queryFunc(connection, sql, values = []) {
    try {
        const [results] = await connection.execute(sql, values);
        return results;
    } catch (error) {
        if (error.message.includes("Can't add new command when connection is in closed state")) {
            // 處理特定錯誤
            console.error('連接已關閉，嘗試重新獲取連接');
            connection.destroy(); // 銷毀當前連接
            // 可以在這裡實施重試邏輯
        }
        console.error('查詢執行失敗:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

/**
 * 定期執行心跳查詢以保持連接活躍
 */
function startHeartbeat() {
    setInterval(async () => {
        for (const pool of pools.values()) {
            try {
                const connection = await pool.getConnection();
                await connection.query('SELECT 1');
                connection.release();
            } catch (error) {
                console.error('心跳查詢失敗:', error);
            }
        }
    }, 30000); // 每30秒執行一次
}

/**
 * 在應用程序退出時關閉所有連接池
 */
function closePools() {
    for (const pool of pools.values()) {
        pool.end().catch(error => console.error('關閉連接池失敗:', error));
    }
}

process.on('SIGINT', closePools);
process.on('SIGTERM', closePools);

module.exports = {
    mysqlConnection,
    queryFunc,
    pools,
    startHeartbeat
};

// 在應用啟動時調用 startHeartbeat
startHeartbeat();