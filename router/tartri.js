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


const router = express.Router();
let poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc,poolH3Acme;
router.use(async (req, res, next) => {
    try {
        if (!poolAcme) {
            await initializePools();
            ({ poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc, poolH3Acme } = poolObj);
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

router.get('/aoi-spec', async (req, res) => {
    
    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        const sqlStr = `SELECT *,round(target,2) as target,round(triger,2) as triger FROM aoi_spec WHERE isdelete='false'`;
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

router.post('/aoi-spec', async (req, res) => {
    const { part_no, target, triger, creator, factory } = req.body;
    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        // 使用單一 SQL 語句處理插入或更新
        // const sqlStr = `
        //     INSERT INTO aoi_spec 
        //         (part_no, target, triger, creator, isdelete, factory) 
        //     VALUES 
        //         (?, ?, ?, ?, 'false', ?)
        //     ON DUPLICATE KEY UPDATE 
        //         target = VALUES(target),
        //         triger = VALUES(triger),
        //         creator = VALUES(creator),
        //         isdelete = 'false'
        // `;
        const sqlDelete = `UPDATE aoi_spec SET isdelete='true' WHERE part_no = '${part_no}' AND factory = '${factory}'`;
        await queryFunc(pool, sqlDelete);
        const sqlStr = `
            INSERT INTO aoi_spec 
                (part_no, target, triger, creator, isdelete, factory) 
            VALUES 
                (?, ?, ?, ?, 'false', ?)
        `;
        
        const result = await queryFunc(pool, sqlStr, [
            part_no, 
            target, 
            triger, 
            creator, 
            factory
        ]);

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
router.delete('/aoi-spec', async (req, res) => {
    const { part_no,factory } = req.body;
    console.log(part_no);
    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        const sqlStr = `UPDATE aoi_spec SET isdelete='true' WHERE part_no = '${part_no}' AND factory = '${factory}'`;
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

module.exports = router;
