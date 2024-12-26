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
            connectionLimit: 10,
            queueLimit: 0
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
        console.error('查詢執行失敗:', error);
        throw error;
    } finally {
        if (connection) {
            connection.release();
        }
    }
}

module.exports = {
    mysqlConnection,
    queryFunc,
    pools
};