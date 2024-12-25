const express = require('express');
const db = require('./utils/db');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger.yaml');
const { hostname } = require('os');

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
        app.listen(port, hostname, () => {
            console.log(`Server is running on http://${hostname}:${port}`);
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
