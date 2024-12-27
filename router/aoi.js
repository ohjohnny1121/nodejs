const express = require('express');
// const soap = require('soap');
// const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const getDbConfig = require('../config/database');
const { timestampToYMDHIS, convertTimestampToFormattedDate } = require('../time.js');
const { initializePools, poolObj } = require('../mssql');
const sql = require('mssql');

const router = express.Router();
let poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc,poolH3Acme;
router.use(async (req, res, next) => {
    try {
        if (!poolAcme) {
            await initializePools();
            ({ poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc ,poolH3Acme} = poolObj);
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

router.post('/aoi-revise-remark/:lotnum/:remark', async (req, res) => {
    
    const { lotnum, remark } = req.params;
    console.log(lotnum, remark);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE aoi_yield_defect SET remark = '${remark}' WHERE lot_num = '${lotnum}'`;
        const result = await queryFunc(connection, sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
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


router.get('/history/:lot/', async (req, res) => {
    const { lot } = req.params;
    const sqlStr = `SELECT 
                    RTRIM(a.lotnum) AS Lot,
                    RTRIM(c.LayerName) AS Layer,
                    p.ProcName AS Process,
                    e.MachineName AS Machine,
                    CONVERT(VARCHAR, a.ChangeTime, 120) AS ProcessTime,
                    LEFT(p.ProcName, 3) + CAST(a.BefDegree AS CHAR(1)) + 
                    RIGHT(p.ProcName, 3) + CAST(a.AftTimes AS CHAR(1)) AS DetailProcess
                FROM 
                    pdl_ckhistory a WITH (NOLOCK)
                    INNER JOIN numoflayer c WITH (NOLOCK) ON a.layer = c.Layer
                    INNER JOIN ProcBasic p WITH (NOLOCK) ON a.proccode = p.ProcCode
                    INNER JOIN acme.dbo.PDL_Machine e WITH (NOLOCK) ON a.machine = e.machineid
                WHERE 
                    RTRIM(a.lotnum) = @lot
                    AND a.AftStatus = 'CheckOut'
                    AND a.BefStatus = 'CheckIn'
                ORDER BY 
                    a.ChangeTime ASC`;

    try {
        const request = poolSNAcme.request();
        request.input('lot', sql.VarChar, lot); // 使用參數化查詢
        const result = await request.query(sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result.recordset,
            time: timestampToYMDHIS(new Date())
        });
    } catch (err) {
        console.error('操作失敗:', err);
        res.status(500).json({
            status: 'error',
            message: err.message || '查詢失敗',
            time: timestampToYMDHIS(new Date())
        });
    }
});



router.get('/aoidaily/:startDate/:endDate/:factory', async (req, res) => {
    let connection;
    try {
        const { startDate, endDate, factory } = req.params;
        const startTimestamp = Number(startDate);
        const endTimestamp = Number(endDate);
        console.log(startTimestamp, convertTimestampToFormattedDate(startTimestamp), convertTimestampToFormattedDate(endTimestamp));

        if (!startDate || !endDate) {
            return res.status(400).json({
                status: 'error',
                message: '缺少必要參數',
                time: timestampToYMDHIS(new Date())
            });
        }

        // 獲取連接
        connection = await mysqlConnection(getDbConfig('aoi'));

        if (!connection) {
            throw new Error('無法獲取數據庫連接');
        }

        // 使用參數化查詢
        const sqlStr = `SELECT 
                        factory,
                        prod_class,
                        part_no,
                        lot_num,
                        lot_type,
                        triger,
                        bef_yield,
                        yield,
                        DATE_FORMAT(time, '%Y-%m-%d %H:%i:%s') as time,
                        c_top_1,
                        c_top1,
                        c_top_2,
                        c_top2,
                        c_top_3,
                        c_top3,
                        s_top_1,
                        s_top1,
                        s_top_2,
                        s_top2,
                        s_top_3,
                        s_top3,
                        remark,
                        mp_lt_x*mp_lt_y upp
                        FROM aoi_yield_defect 
                        WHERE time >= ? 
                        AND time <= ? 
                        AND factory = ?`;

        const result = await queryFunc(connection, sqlStr, [convertTimestampToFormattedDate(startTimestamp), convertTimestampToFormattedDate(endTimestamp), factory]);

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
            try {
                connection.release();
            } catch (err) {
                console.error('釋放連接失敗:', err);
            }
        }
    }
});

router.get('/image', async (req, res) => {
    try {
        const { ImagePath, DefectSeq, BoardNo, Side, xValue, yValue, factory } = req.query;
        
        let imageBase64 = "";
        let status = "success";
        let message = "Image retrieved successfully";

        if (factory === "YM" || !ImagePath.includes("10.23.204.68")) {
            const imageBuffer = fs.readFileSync(`${ImagePath}/${DefectSeq}.jpg`);
            imageBase64 = imageBuffer.toString("base64");
        } else if (factory === "SN" || ImagePath.includes("10.23.204.68")) {
            const filePath = ImagePath.replace(/^\\\\[\d\.]+/, "");
            const sftp = new Client();
            await sftp.connect({
                host: "10.23.60.3",
                port: 22,
                username: "Lthmanager_user",
                password: "1qazXSW@user",
            });

            let finalPath = "";
            const xOffSet = -7;
            let xValueNum = Number(xValue);
            let yValueNum = Number(yValue);

            if (filePath.includes("ai_service")) {
                const exists = await sftp.exists(filePath);
                if (!exists) {
                    if (filePath.includes("ud1")) {
                        const isNonOffsetExists = await sftp.exists(`${filePath.replace("ud1", "ud2")}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                        const isOffsetExists = await sftp.exists(`${filePath.replace("ud1", "ud2")}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                        if (isNonOffsetExists) {
                            finalPath = `${filePath.replace("ud1", "ud2")}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                        }
                        if (isOffsetExists) {
                            finalPath = `${filePath.replace("ud1", "ud2")}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                        }
                    }
                    if (filePath.includes("ud2")) {
                        const isNonOffsetExists = await sftp.exists(`${filePath.replace("ud2", "ud1")}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                        const isOffsetExists = await sftp.exists(`${filePath.replace("ud2", "ud1")}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                        if (isNonOffsetExists) {
                            finalPath = `${filePath.replace("ud2", "ud1")}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                        }
                        if (isOffsetExists) {
                            finalPath = `${filePath.replace("ud2", "ud1")}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                        }
                    }
                } else {
                    const isOffsetExists = await sftp.exists(`${filePath}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                    const isNonOffsetExists = await sftp.exists(`${filePath}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`);
                    if (isOffsetExists) {
                        finalPath = `${filePath}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                    }
                    if (isNonOffsetExists) {
                        finalPath = `${filePath}/${BoardNo}_${Side}_${xValueNum.toFixed(4) + '0'}_${yValueNum.toFixed(4) + '0'}.jpg`;
                    }
                }
            } else {
                finalPath = `${filePath}/${DefectSeq}.jpg`;
            }

            const buffer = await sftp.get(finalPath);
            if (buffer) {
                imageBase64 = buffer.toString("base64");
            } else {
                status = "error";
                message = "Image not found";
            }
            sftp.end();
        }

        res.json({
            status: status,
            message: message,
            image: imageBase64
        });
    } catch (error) {
        console.error('Error retrieving image:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to retrieve image',
            image: ""
        });
    }
});


module.exports = router;
