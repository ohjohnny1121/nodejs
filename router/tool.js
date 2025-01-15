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

router.get('/insert_trigger_factory', async (req, res) => {
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStrDetail = `
        SELECT distinct 
            a.part_no,
            a.factory,
            CASE WHEN s.target IS NULL THEN '1' ELSE s.target END AS target,
            CASE WHEN s.triger IS NULL THEN '1' ELSE s.triger END AS triger,
            CASE WHEN s.isdelete IS NULL THEN 'false' ELSE s.isdelete END AS isdelete,
            CASE WHEN s.creator IS NULL THEN 'SYSTEM' ELSE s.creator END AS creator 
        FROM aoi_yield_defect a 
            left join 
                aoi_spec s on a.part_no = s.part_no 
            WHERE 
                s.part_no is null
            or 
                s.factory is null
            `;
        const resultDetail = await queryFunc(pool, sqlStrDetail);
        
        const sqlStrUpdate = `
            INSERT INTO aoi_spec (part_no, factory, isdelete, target, triger, creator) 
            VALUES (?, ?, 'false', ?, ?, ?) 
            ON DUPLICATE KEY UPDATE 
            factory = VALUES(factory),
            isdelete = VALUES(isdelete),
            target = VALUES(target),
            triger = VALUES(triger),
            creator = VALUES(creator)
        `;

        for (const item of resultDetail) {
            await queryFunc(pool, sqlStrUpdate, [item.part_no, item.factory, item.target, item.triger, item.creator]);
        }

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
