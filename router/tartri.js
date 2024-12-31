const express = require('express');
// const soap = require('soap');
// const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const app = express();  
app.use(bodyParser.json());
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const getDbConfig = require('../config/database');
const { timestampToYMDHIS, convertTimestampToFormattedDate } = require('../time.js');
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
    
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `SELECT * FROM aoi_spec`;
        const result = await queryFunc(connection, sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result,
            time: timestampToYMDHIS(new Date())
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: timestampToYMDHIS(new Date())
        });
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

router.post('/aoi-spec', async (req, res) => {
    const { part_no, target,triger } = req.body;
    // console.log(uid);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE aoi_spec SET isdelete='true' WHERE part_no = '${part_no}'`;
        const result = await queryFunc(connection, sqlStr);
        const sqlStradd = `INSERT INTO aoi_spec (part_no, target, triger,isdelete) VALUES ('${part_no}', '${target}', '${triger}','false')`;
        const resultadd = await queryFunc(connection, sqlStradd);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: resultadd,
            time: timestampToYMDHIS(new Date())
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: timestampToYMDHIS(new Date())
        });
    }finally{
        if (connection) {
            await connection.release();
        }
    }
});
router.delete('/aoi-spec', async (req, res) => {
    const { part_no } = req.body;
    console.log(part_no);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE aoi_spec SET isdelete='true' WHERE part_no = '${part_no}'`;
        const result = await queryFunc(connection, sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result,
            time: timestampToYMDHIS(new Date())
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: timestampToYMDHIS(new Date())
        });
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

module.exports = router;
