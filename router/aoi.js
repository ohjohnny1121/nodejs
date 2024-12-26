const express = require('express');
// const soap = require('soap');
// const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const getDbConfig = require('../config/database');
const { timestampToYMDHIS, convertTimestampToFormattedDate } = require('../time.js');

const router = express.Router();

// CORS 設置
router.use((req, res, next) => {
    // 允許特定來源或使用 * 允許所有來源
    res.header('Access-Control-Allow-Origin', '*');
    
    // 允許的 HTTP 方法
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // 允許的請求頭
    res.header('Access-Control-Allow-Headers', 
        'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // 允許發送認證信息
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 處理 OPTIONS 請求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

const key = 'YMYIP';
// const whiteList = ['00776', '05866', '09068', 'A0274'];
const SOAP_TIMEOUT = 30000; // 30秒超時

router.use(bodyParser.json());


router.get('/aoidaily/:startDate/:endDate', async (req, res) => {

    
    let connection;

    
    try {
        const { startDate, endDate } = req.params;
        const startTimestamp = Number(startDate);
        const endTimestamp = Number(endDate);   
        console.log(startTimestamp,convertTimestampToFormattedDate(startTimestamp), convertTimestampToFormattedDate(endTimestamp));

        if (!startDate || !endDate) {
            return res.status(400).json({
                status: 'error',
                message: '缺少必要參數',
                time: timestampToYMDHIS(new Date())
            });
        }
        // 獲取連接
        connection = await mysqlConnection(getDbConfig('aoi'));
        
        try {
            await connection.beginTransaction();
            
            // 生成開始日期和結束日期
            const sqlStr = `SELECT * FROM aoi_yield_defect WHERE time >= '${convertTimestampToFormattedDate(startTimestamp)}' AND time <= '${convertTimestampToFormattedDate(endTimestamp)}'`;
            console.log(sqlStr);
            const result = await queryFunc(connection, sqlStr);
            
            
            // 插入新的權限
            // for (const auth of authority) {
            //     //可以抓出id這個資料表的資料數量
            //     const sqlStrid = `SELECT COUNT(*) as Count FROM Whitelist`;
            //     const resultid = await queryFunc(connection, sqlStrid);
            //     const id = resultid[0].Count + 1;
            //     const sqlStrinsert = `
            //         INSERT INTO Whitelist (id,uid, authority, creator, isdelete,time) 
            //         VALUES ('${id}','${uid}', '${auth}', '${creator}', 'false','${dateStr}')`;
            //         console.log(sqlStrinsert);
            //     await queryFunc(connection, sqlStrinsert);
            // }
            
            await connection.commit();
            
            res.status(200).json({
                status: 'success',
                message: '成功',
                data: result,
                time: timestampToYMDHIS(new Date())
            });
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
        
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: timestampToYMDHIS(new Date())
        });
    } finally {
        if (connection) {
            try {
                connection.release();
            } catch (err) {
                console.error('釋放連接失敗:', err);
            }
        }
    }
});

module.exports = router;
