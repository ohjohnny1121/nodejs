const mysql = require('mysql2/promise');

class DatabaseConnectionManager {
    constructor() {
        this.pools = {};
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.activeConnections = 0;  // 追蹤活動連接數
        this.MAX_CONNECTIONS = 5;    // 降低最大連接數
    }

    async createPool(config) {
        const poolConfig = {
            ...config,
            connectionLimit: this.MAX_CONNECTIONS,  // 限制連接池大小
            queueLimit: 5,                         // 限制等待隊列
            waitForConnections: true,
            enableKeepAlive: true,
            keepAliveInitialDelay: 5000,
            acquireTimeout: 5000,
            connectTimeout: 5000,
        };

        const pool = mysql.createPool(poolConfig);
        
        // 監聽連接事件
        pool.on('connection', () => {
            this.activeConnections++;
            console.log(`活動連接數: ${this.activeConnections}`);
        });

        pool.on('release', () => {
            this.activeConnections--;
            console.log(`釋放連接，當前活動連接數: ${this.activeConnections}`);
        });

        return pool;
    }

    async getConnectionWithRetry(pool, retryCount = 0) {
        try {
            const connection = await pool.getConnection();
            return connection;
        } catch (error) {
            console.error(`連接嘗試 ${retryCount + 1} 失敗:`, error.message);
            
            if (retryCount < this.maxRetries && 
                (error.code === 'ER_CON_COUNT_ERROR' || 
                 error.code === 'PROTOCOL_CONNECTION_LOST')) {
                
                console.log(`等待 ${this.retryDelay}ms 後重試...`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                
                // 遞迴重試
                return this.getConnectionWithRetry(pool, retryCount + 1);
            }
            
            // 如果超過重試次數或是其他錯誤，則拋出
            throw error;
        }
    }

    async getConnection(config) {
        try {
            const key = `${config.host}_${config.database}`;
            
            if (!this.pools[key]) {
                this.pools[key] = await this.createPool(config);
                console.log(`創建新連接池: ${key}`);
            }

            // 檢查活動連接數
            if (this.activeConnections >= this.MAX_CONNECTIONS) {
                throw new Error('已達到最大連接數限制');
            }

            const connection = await this.getConnectionWithRetry(this.pools[key]);
            return this.wrapConnection(connection, key);

        } catch (error) {
            console.error('獲取數據庫連接失敗:', error);
            throw error;
        }
    }

    wrapConnection(connection, poolKey) {
        let released = false;
        
        const wrappedConnection = {
            ...connection,
            beginTransaction: async () => {
                if (released) throw new Error('連接已釋放');
                return await connection.beginTransaction();
            },
            query: async (...args) => {
                if (released) throw new Error('連接已釋放');
                try {
                    return await connection.query(...args);
                } catch (error) {
                    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
                        await this.closePool(poolKey);
                        throw new Error('數據庫連接丟失');
                    }
                    throw error;
                }
            },
            execute: async (...args) => {
                if (released) throw new Error('連接已釋放');
                try {
                    return await connection.execute(...args);
                } catch (error) {
                    if (error.code === 'PROTOCOL_CONNECTION_LOST') {
                        await this.closePool(poolKey);
                        throw new Error('數據庫連接丟失');
                    }
                    throw error;
                }
            },
            rollback: async () => {
                if (released) throw new Error('連接已釋放');
                return await connection.rollback();
            },
            commit: async () => {
                if (released) throw new Error('連接已釋放');
                return await connection.commit();
            },
            release: () => {
                if (!released) {
                    released = true;
                    this.activeConnections--;
                    connection.release();
                    console.log(`連接已釋放，當前活動連接數: ${this.activeConnections}`);
                }
            },
            destroy: () => {
                if (!released) {
                    released = true;
                    this.activeConnections--;
                    connection.destroy();
                }
            }
        };

        return wrappedConnection;
    }

    async closePool(key) {
        if (this.pools[key]) {
            try {
                await this.pools[key].end();
                delete this.pools[key];
                this.activeConnections = 0;  // 重置連接計數
                console.log(`關閉連接池: ${key}`);
            } catch (error) {
                console.error(`關閉連接池失敗 ${key}:`, error);
            }
        }
    }

    async closeAllPools() {
        for (const key of Object.keys(this.pools)) {
            await this.closePool(key);
        }
        this.activeConnections = 0;
        console.log('所有連接池已關閉');
    }
}

const connectionManager = new DatabaseConnectionManager();

const mysqlConnection = async (config) => {
    return connectionManager.getConnection(config);
};

// 定期檢查並清理空閒連接
setInterval(() => {
    if (connectionManager.activeConnections > 0) {
        console.log(`當前活動連接數: ${connectionManager.activeConnections}`);
    }
}, 30000);

module.exports = { 
    mysqlConnection,
    closeAllPools: () => connectionManager.closeAllPools(),
    getActiveConnections: () => connectionManager.activeConnections,
    queryFunc: async (connection, sql, params = []) => {
        try {
            const [results] = await connection.query(sql, params);
            return results;
        } catch (error) {
            console.error('查詢執行失敗:', error);
            throw error;
        }
    }
};