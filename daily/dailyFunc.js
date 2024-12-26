const mysql = require('mysql2/promise');
const axios = require('axios');
const { mysqlConnection, queryFunc } = require('../mysql');
const { configFunc } = require('../config');

// 定義錯誤類別
class DatabaseError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'DatabaseError';
        this.originalError = originalError;
    }
}

class APIError extends Error {
    constructor(message, originalError) {
        super(message);
        this.name = 'APIError';
        this.originalError = originalError;
    }
}

// 資料庫操作重試配置
const DB_RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000, // 1秒
};

// 通用的重試機制
const retry = async (operation, config) => {
    let lastError;
    
    for (let i = 0; i < config.maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (i < config.maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, config.retryDelay));
            }
        }
    }
    
    throw lastError;
};

// 改進的資料庫操作函數
const executeQuery = async (db, sql, values = []) => {
    const connection = await mysqlConnection(configFunc(db));
    try {
        const result = await queryFunc(connection, sql, values);
        return result;
    } catch (error) {
        throw new DatabaseError(`執行查詢失敗: ${sql}`, error);
    } finally {
        if (connection) {
            try {
                await connection.destroy();
            } catch (error) {
                console.error('關閉連接失敗:', error);
            }
        }
    }
};

// 改進的新增資料函數
const addToDB = async (db, sql, values) => {
    return retry(
        async () => await executeQuery(db, sql, values),
        DB_RETRY_CONFIG
    );
};

// 改進的獲取資料函數
const getFromDB = async (db, sql) => {
    return retry(
        async () => await executeQuery(db, sql),
        DB_RETRY_CONFIG
    );
};

// 驗證資料格式
const validateData = (data) => {
    if (!data || typeof data !== 'object') {
        throw new Error('無效的資料格式');
    }
    
    if (!Array.isArray(data)) {
        throw new Error('資料必須是陣列格式');
    }
    
    return true;
};

// 改進的每日新增函數
const dailyAdd = async (api) => {
    try {
        const response = await axios.get(api);
        const { data } = response;

        if (!data || data.status === false) {
            throw new APIError(data?.message || '無效的 API 響應');
        }

        const keys = Object.keys(data);
        const results = [];

        for (const key of keys) {
            const { data: tableData, db, table } = data[key];

            if (!tableData || tableData.length === 0) {
                console.log(`${api} ${key} 無資料新增`);
                continue;
            }

            validateData(tableData);

            const columns = Object.keys(tableData[0]);
            const values = tableData.map(item => columns.map(col => item[col]));
            
            const placeholders = '(' + new Array(columns.length).fill('?').join(',') + ')';
            const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`;

            try {
                for (const row of values) {
                    await addToDB(db, sql, row);
                }
                
                results.push({
                    key,
                    affectedRows: values.length,
                    success: true
                });
                console.log(`${api} ${key} 成功新增 ${values.length} 筆資料`);
            } catch (error) {
                results.push({
                    key,
                    error: error.message,
                    success: false
                });
                console.error(`${api} ${key} 新增失敗:`, error);
            }
        }

        return results;

    } catch (error) {
        throw new APIError(`API 調用失敗: ${api}`, error);
    }
};

// 改進的堆疊新增函數
const stackAdd = async (api) => {
    try {
        const response = await axios.get(api);
        const { data } = response;

        if (!data || data.status === false) {
            throw new APIError(data?.message || '無效的 API 響應');
        }

        const keys = Object.keys(data);
        const results = [];

        for (const key of keys) {
            const { data: tableData, db, table, match } = data[key];

            if (!tableData || tableData.length === 0) {
                console.log(`${api} ${key} 無資料新增`);
                continue;
            }

            validateData(tableData);

            const columns = Object.keys(tableData[0]);
            const values = tableData.map(item => columns.map(col => item[col]));
            
            let matchColumn = match
                .filter(col => col !== 'Remark')
                .map(i => `${i} = VALUES(${i})`)
                .join(",");

            if (columns.includes('Remark')) {
                matchColumn += ', Remark = Remark';
            }

            const placeholders = '(' + new Array(columns.length).fill('?').join(',') + ')';
            const sql = `
                INSERT INTO ${table} (${columns.join(',')}) 
                VALUES ${placeholders}
                ON DUPLICATE KEY UPDATE ${matchColumn}
            `;

            try {
                for (const row of values) {
                    await addToDB(db, sql, row);
                }
                
                results.push({
                    key,
                    affectedRows: values.length,
                    success: true
                });
                console.log(`${api} ${key} 成功更新 ${values.length} 筆資料`);
            } catch (error) {
                results.push({
                    key,
                    error: error.message,
                    success: false
                });
                console.error(`${api} ${key} 更新失敗:`, error);
            }
        }

        return results;

    } catch (error) {
        throw new APIError(`API 調用失敗: ${api}`, error);
    }
};

// 記錄執行狀態到資料庫的函數
const logExecutionStatus = async (db, operation, status, details) => {
    const sql = `
        INSERT INTO execution_logs 
        (operation, status, details, created_at) 
        VALUES (?, ?, ?, NOW())
    `;
    
    try {
        await addToDB(db, sql, [operation, status, JSON.stringify(details)]);
    } catch (error) {
        console.error('記錄執行狀態失敗:', error);
    }
};

module.exports = {
    dailyAdd,
    stackAdd,
    addToDB,
    getFromDB,
    DatabaseError,
    APIError
};