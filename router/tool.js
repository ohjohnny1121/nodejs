const express = require('express');
// const soap = require('soap');
// const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const app = express();  
app.use(bodyParser.json());
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const getDbConfig = require('../config/database');
const { timestampToYMDHIS, convertTimestampToFormattedDate, getCurrentTimeInTaipei } = require('../time.js');
const { initializePools, poolObj } = require('../mssql');
const fs = require('fs');
const Client = require('ssh2-sftp-client');
const genericPool = require('generic-pool');


const router = express.Router();
let poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc,poolH3Acme,poolSNNCN;
router.use(async (req, res, next) => {
    try {
        if (!poolAcme) {
            await initializePools();
            ({ poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc, poolH3Acme,poolSNNCN } = poolObj);
            // console.log('Initialized pools:', poolObj);
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST");
        res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
        res.setHeader("Access-Control-Allow-Credentials", true);
        next();
    } catch (error) {
        console.error("連接池初始化失敗:", error);
        res.status(500).json({ error: "數據庫連接失敗" });
    }
});

const key = 'YMYIP';
// const whiteList = ['00776', '05866', '09068', 'A0274'];
const SOAP_TIMEOUT = 30000; // 30秒超時

router.use(bodyParser.json());
router.get('/factory-list', async (req, res) => {
    try {
        const pool = await mysqlConnection(getDbConfig('common'));
        const sqlStr = `SELECT DISTINCT name FROM factory`;
        const result = await queryFunc(pool, sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result,
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
        });
    }
});

router.get('/update_trigger_factory', async (req, res) => {

    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `SELECT * FROM aoi_spec`;
        const result = await queryFunc(pool, sqlStr);
        const partNoList = result.map(item => `'${item.part_no}'`).join(',');
        const sqlStrDetail = `SELECT distinct part_no,factory FROM aoi_yield_defect WHERE part_no IN (${partNoList}) order by part_no,factory`;
        // console.log(sqlStrDetail);
        const resultDetail = await queryFunc(pool, sqlStrDetail);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: resultDetail,
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
        });
    }
});

module.exports = router;
