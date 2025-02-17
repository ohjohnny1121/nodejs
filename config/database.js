// 基礎配置
const baseConfig = {
    host: '10.22.94.69',
    user: 'root',
    port: 3306,
    password: 'pwd123',
    // 連接池設置
    // connectionLimit: 1000,
    // waitForConnections: true,
    // queueLimit: 0,
    // 只保留支持的超時設置
    // connectTimeout: 60000
};

// 創建數據庫配置的函數
const getDbConfig = (database) => ({
    ...baseConfig,
    database,
    multipleStatements: true   // 允許多條 SQL 語句
});

module.exports = getDbConfig; 