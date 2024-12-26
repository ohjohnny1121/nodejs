const express = require('express');
const db = require('./utils/db');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const cron = require('node-cron');
const os = require('os');
const { dailyAdd, stackAdd } = require('./daily/dailyFunc.js');

// 獲取主機名稱
const hostname = os.hostname();

// 設定 API 基礎 URL
const API_BASE_URL = process.env.API_BASE_URL || `http://${hostname}:3000`;

// 使用 path.join 確保正確的文件路徑
const swaggerAoi = YAML.load(path.join(__dirname, 'api', 'aoi.yaml'));
const swaggerUser = YAML.load(path.join(__dirname, 'api', 'user.yaml'));

// 設定每天早上 8:30 執行
cron.schedule('55 42 10 * * *', async () => {
    try {
        console.log(`${API_BASE_URL}/daily/aoi/sndailyadd 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/sndailyadd`);
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
        app.use('/aoi', require('./router/aoi.js'));
        // 創建獨立的路由器
        const aoiRouter = express.Router();
        const userRouter = express.Router();

        // AOI Swagger 文檔
        aoiRouter.use('/', swaggerUi.serve, swaggerUi.setup(swaggerAoi, {
            explorer: true,
            customSiteTitle: "AOI API Documentation"
        }));

        // User Swagger 文檔
        userRouter.use('/', swaggerUi.serve, swaggerUi.setup(swaggerUser, {
            explorer: true,
            customSiteTitle: "User API Documentation"
        }));

        // 將路由器掛載到不同的路徑
        // app.use('/api-docs-aoi', aoiRouter);
        // app.use('/api-docs-user', userRouter);

        // 單一的路由器
        const apiDocsRouter = express.Router();

        // 根據路徑參數提供不同的 Swagger 文檔
        apiDocsRouter.use('/:type', swaggerUi.serve, (req, res, next) => {
            const docType = req.params.type;
            let swaggerDocument;

            if (docType === 'aoi') {
                swaggerDocument = swaggerAoi;
            } else if (docType === 'user') {
                swaggerDocument = swaggerUser;
            } else {
                return res.status(400).send('Invalid document type');
            }

            swaggerUi.setup(swaggerDocument, {
                explorer: true,
                customSiteTitle: `${docType.toUpperCase()} API Documentation`
            })(req, res, next);
        });

        // 將路由器掛載到同一個路徑
        app.use('/api-docs', apiDocsRouter);

        // 簡單的 API 路由
        app.get('/', (req, res) => {
            res.send('chi666667');
        });

        // 在資料庫初始化成功後才啟動 Express 服務器
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
            // console.log(`AOI API 文檔: http://localhost:${port}/api-docs-aoi`);
            // console.log(`User API 文檔: http://localhost:${port}/api-docs-user`);
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
