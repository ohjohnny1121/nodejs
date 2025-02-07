const express = require('express');
const db = require('./utils/db');
const app = express();
const port = 3000;
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('path');
const cron = require('node-cron');
const os = require('os');
const { dailyAdd, stackAdd, apiExecute } = require('./daily/dailyFunc.js');
const cors = require('cors');
const { mysqlConnection, queryFunc } = require('./mysql'); // 根據您的實際路徑調整
// 獲取主機名稱
const hostname = os.hostname();
app.use(cors());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
  });  
// 設定 API 基礎 URL
const API_BASE_URL = process.env.API_BASE_URL || `http://${hostname}:3000`;

// 使用 path.join 確保正確的文件路徑
const swaggerAoi = YAML.load(path.join(__dirname, 'api', 'aoi.yaml'));
const swaggerUser = YAML.load(path.join(__dirname, 'api', 'user.yaml'));
const swaggerTartri = YAML.load(path.join(__dirname, 'api', 'tartri.yaml'));
// 設定每天早上 8:00 執行
cron.schedule('01 00 08 * * *', async () => {
    try {
        console.log(`${API_BASE_URL}/daily/aoi/sndailyadd 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/sndailyadd`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/trend`);
        await apiExecute(`${API_BASE_URL}/daily/tool/update_trigger_factory`);
        // await stackAdd(`${API_BASE_URL}/daily/aoi/transfer`);
    } catch (error) {
        console.error(`[${hostname}] 執行 SN AOI 定時任務失敗:`, error);
    }
});
//每小時執行一次
cron.schedule('00 00 * * * *', async () => {
    try {
        console.log(`${API_BASE_URL}/daily/aoi/sndailyadd 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/sndailyadd`);
        console.log(`${API_BASE_URL}/daily/aoi/trend 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/trend`);
        console.log(`${API_BASE_URL}/tool/insert_trigger_factory 開始執行更新`);
        await apiExecute(`${API_BASE_URL}/tool/insert_trigger_factory`);
    } catch (error) {
        console.error(`[${hostname}] 執行 SN AOI 定時任務失敗:`, error);
    }
});

// 固定時間執行
cron.schedule('10 48 09 * * *', async () => {
    try {
        // console.log(`${API_BASE_URL}/daily/aoi/sndailyadd 開始執行 SN AOI 每日資料更新`);
        // await stackAdd(`${API_BASE_URL}/daily/aoi/sndailyadd`);
        // console.log(`${API_BASE_URL}/daily/aoi/trend 開始執行 SN AOI 每日資料更新`);
        // await stackAdd(`${API_BASE_URL}/daily/aoi/trend`);
        // console.log(`${API_BASE_URL}/tool/insert_trigger_factory 開始執行更新`);
        // await apiExecute(`${API_BASE_URL}/tool/insert_trigger_factory`);
        console.log(`${API_BASE_URL}/daily/aoi/daily_platform 開始執行 SN AOI 每日資料更新`);
        await stackAdd(`${API_BASE_URL}/daily/aoi/daily_platform`);
        
    } catch (error) {
        console.error(`[${hostname}] 執行 SN AOI 定時任務失敗:`, error);
    }
});

// 例如每天早上 8:30 執行
cron.schedule('30 08 * * *', async () => {
    try {
        console.log(`${API_BASE_URL}/tool/update_trigger_factory 開始執行更新`);
        await stackAdd(`${API_BASE_URL}/tool/update_trigger_factory`);
        
    } catch (error) {
        console.error(`[${hostname}] 執行 update_trigger_factory 失敗:`, error);
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
        app.use('/tartri', require('./router/tartri.js'));
        app.use('/tool', require('./router/tool.js'));
        // 創建獨立的路由器
        const aoiRouter = express.Router();
        const userRouter = express.Router();
        const tartriRouter = express.Router();
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

        // Tartri Swagger 文檔
        tartriRouter.use('/', swaggerUi.serve, swaggerUi.setup(swaggerTartri, {
            explorer: true,
            customSiteTitle: "Tartri API Documentation"
        }));

        // 將路由器掛載到不同的路徑
        // app.use('/api-docs-aoi', aoiRouter);
        // app.use('/api-docs-user', userRouter);

        
        // 提供靜態文件
        app.use(express.static(path.join(__dirname, 'swagger-ui')));

        // 自定義導航頁面
        app.get('/custom-docs/:type', (req, res) => {
            const docType = req.params.type;
            let swaggerDocument;

            if (docType === 'aoi') {
                swaggerDocument = swaggerAoi;
            } else if (docType === 'user') {
                swaggerDocument = swaggerUser;
            } else if (docType === 'tartri') {
                swaggerDocument = swaggerTartri;
            } else {
                return res.status(400).send('Invalid document type');
            }

            res.send(`
                <html>
                    <head>
                        <title>${docType.toUpperCase()} API Documentation</title>
                        <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist/swagger-ui.css" />
                        <style>
                            #custom-nav {
                                margin: 20px;
                                font-size: 18px;
                            }
                            #custom-nav a {
                                margin-right: 15px;
                                text-decoration: none;
                                color: #007bff;
                            }
                        </style>
                    </head>
                    <body>
                        <div id="custom-nav">
                            <a href="/">首頁</a>
                            <a href="/custom-docs/aoi">AOI</a>
                            <a href="/custom-docs/user">User</a>
                            <a href="/custom-docs/tartri">Tartri</a>
                        </div>
                        <div id="swagger-ui"></div>
                        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-bundle.js"></script>
                        <script src="https://unpkg.com/swagger-ui-dist/swagger-ui-standalone-preset.js"></script>
                        <script>
                            window.onload = function() {
                                const ui = SwaggerUIBundle({
                                    spec: ${JSON.stringify(swaggerDocument)},
                                    dom_id: '#swagger-ui',
                                    presets: [
                                        SwaggerUIBundle.presets.apis,
                                        SwaggerUIStandalonePreset
                                    ],
                                    layout: "StandaloneLayout"
                                });
                                window.ui = ui;
                            };
                        </script>
                    </body>
                </html>
            `);
        });

        // 簡單的首頁
        app.get('/', (req, res) => {
            res.send(`
                <html>
                    <head>
                        <title>API Documentation Home</title>
                    </head>
                    <body>
                        <h1>API Documentation Home</h1>
                        <ul>
                            <li><a href="/custom-docs/aoi">AOI</a></li>
                            <li><a href="/custom-docs/user">User</a></li>
                            <li><a href="/custom-docs/tartri">Tartri</a></li>
                        </ul>
                    </body>
                </html>
            `);
        });

        app.get('/update_trigger', async (req, res) => {
            try {
                console.log('開始執行 update_trigger_factory');
                await stackAdd(`${API_BASE_URL}/tool/update_trigger_factory`);
                res.json({ message: 'update_trigger_factory 執行成功' });
            } catch (error) {
                console.error('執行 update_trigger_factory 失敗:', error);
                res.status(500).json({ error: '執行失敗' });
            }
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
