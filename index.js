const express = require('express');
const db = require('./utils/db');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');
const cron = require('node-cron');
const axios = require('axios');
const os = require('os');
const { dailyAdd,stackAdd } = require('./daily/dailyFunc.js');

// 獲取主機名稱
const hostname = os.hostname();

// 設定 API 基礎 URL
const API_BASE_URL = process.env.API_BASE_URL || `http://${hostname}:3000`;

// 設定每天早上 8:30 執行
cron.schedule('55 42 10 * * *', async () => {
    try {
        console.log(`${API_BASE_URL}/daily/aoi/sndailyadd 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/sndailyadd`);
        // console.log(`[${hostname}] SN AOI 每日資料更新成功`);
    } catch (error) {
        console.error(`[${hostname}] 執行 SN AOI 定時任務失敗:`, error);
    }
});

// 啟動時顯示服務資訊
console.log(`服務運行於 ${hostname}`);
console.log(`API 基礎 URL: ${API_BASE_URL}`);

// 初始化資料庫
const initDatabase = async () => {
    try {
        await db.initAllPools();
        
        // 設定路由
        app.use('/daily/aoi', require('./daily/aoi.js'));
        app.use('/user', require('./router/user.js'));
        app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
        // 簡單的 API 路由
        app.get('/', (req, res) => {
            res.send('chi666667');
        });

        // 查詢資料庫的 API 範例
        app.get('/users', async (req, res) => {
            try {
                const results = await db.query('main', 'SELECT * FROM users');
                res.json(results);
            } catch (error) {
                console.error('查詢失敗:', error);
                res.status(500).json({ error: '資料庫查詢錯誤' });
            }
        });

        // 在資料庫初始化成功後才啟動 Express 服務器
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error('資料庫初始化失敗:', error);
        process.exit(1);
    }
};

// 程式關閉時清理
process.on('SIGINT', async () => {
    try {
        await db.closeAllPools();
        process.exit(0);
    } catch (error) {
        console.error('關閉資料庫連接池時發生錯誤:', error);
        process.exit(1);
    }
});

// 啟動應用程式
initDatabase();
