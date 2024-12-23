const express = require('express');
const db = require('./utils/db');
const { cleanupConnections } = require('./mysql');

const app = express();

// 初始化資料庫
const initDatabase = async () => {
    try {
        await db.initAllPools();
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

// 應用啟動時清理連接
app.on('ready', async () => {
    try {
        await cleanupConnections();
        console.log('應用啟動時清理連接完成');
    } catch (error) {
        console.error('清理連接失敗:', error);
    }
});

initDatabase(); 