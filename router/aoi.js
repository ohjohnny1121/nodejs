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
router.get('/lot-list/:uid', async (req, res) => {
    const { uid } = req.params;
    console.log(uid);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `SELECT * FROM user_lot_list WHERE uid = '${uid}'`;
        const result = await queryFunc(connection, sqlStr);
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
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

router.post('/lot-list', async (req, res) => {
    const { uid, lot_list} = req.body;
    console.log(uid, lot_list);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlDel = `DELETE FROM user_lot_list WHERE uid = '${uid}'`;
        const sqlStr = `INSERT INTO user_lot_list (uid, factory,part_no, lot_num,layer) VALUES ${lot_list.map(item => `('${uid}', '${item.factory}', '${item.part_no}', '${item.lot_num}','${item.layer}')`).join(',')}`;
        console.log(sqlStr);
        const resultDel = await queryFunc(connection, sqlDel);
        const result = await queryFunc(connection, sqlStr);
        //時間要是台灣時間
        
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
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

router.delete('/lot-list', async (req, res) => {
    const { uid, factory, part_no, lot_num, layer } = req.query;
    console.log(uid, factory, part_no, lot_num, layer);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `DELETE FROM user_lot_list WHERE uid = '${uid}' AND factory = '${factory}' AND part_no = '${part_no}' AND lot_num = '${lot_num}' AND layer = '${layer}'`;
        const result = await queryFunc(connection, sqlStr);
        //時間要是台灣時間
        
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
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});
router.put('/lot-list', async (req, res) => {
    const { uid, factory, part_no, lot_num, layer } = req.body;
    console.log(uid, factory, part_no, lot_num, layer);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE user_lot_list SET factory = '${factory}',part_no = '${part_no}', lot_num = '${lot_num}', layer = '${layer}' WHERE uid = '${uid}'`;
        const result = await queryFunc(connection, sqlStr);
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
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

router.delete('/lot-list-all', async (req, res) => {
    const { uid } = req.query;
    console.log(uid);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `DELETE FROM user_lot_list WHERE uid = '${uid}'`;
        const result = await queryFunc(connection, sqlStr);
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
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});
// 更新SN AOI 備註
router.post('/aoi-revise-remark', async (req, res) => {
    
    const { lotnum, remark } = req.body;
    // console.log(lotnum, remark);
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE aoi_yield_defect SET remark = '${remark}' WHERE lot_num = '${lotnum}'`;
        const result = await queryFunc(connection, sqlStr);
        res.status(200).json({
            status: 'success',
            message: '成功',
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
        });
    } finally {
        if (connection) {
            await connection.release();
        }
    }
});

// 獲取SN AOI 歷史資料
router.get('/history/:lotnum', async (req, res) => {
    
    const { lotnum } = req.params;
    // console.log(lotnum);
    // console.log('poolSNAcme:', poolSNAcme);
    if (!poolSNAcme) {
        return res.status(500).json({
            status: 'error',
            message: '數據庫連接未初始化',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const sqlStr = `SELECT 
                            RTRIM(a.lotnum) AS Lot,
                            RTRIM(c.LayerName) AS Layer,
                            a.AftStatus AS Status,
                            a.AftStatus,
                            a.BefStatus,
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
                            RTRIM(a.lotnum) = '${lotnum}'
                            and a.BefStatus ='CheckIn'
                            and a.AftStatus ='CheckOut'
                        ORDER BY 
                            a.ChangeTime ASC`;
        const result = await poolSNAcme.query(sqlStr);
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
            message: error.message || '查詢失敗',
            time: getCurrentTimeInTaipei()
        });
    } 
});



// 獲取AOI 每日資料
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
                time: getCurrentTimeInTaipei()
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
                        layer,
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
            time: getCurrentTimeInTaipei()
        });

    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
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

// 獲取AOI 圖片
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
            image: imageBase64,
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('Error retrieving image:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || 'Failed to retrieve image',
            image: "",
            time: getCurrentTimeInTaipei()
        });
    }
});


// 

router.get('/mapping/:lot_num/:layer/:isincludefake/', async (req, res) => {
    try {
        const { lot_num, layer, isincludefake} = req.params;
        console.log(lot_num, layer, isincludefake);
        let scrappedFilter = `${Number(isincludefake) ? ' ' : " and Classify <>'0'"}`;

        // SN_VRS_test_result_new    
        const sqlStr = `SELECT *,Lotnum as lot_num,PartNo as part_no,trim(LayerName) as layer from V_LayoutDetail_Jmp(nolock) where LotNum ='${lot_num}' and LayerName='${layer}'${scrappedFilter}`;
        // console.log(sqlStr);
        const result = await poolSNDc.query(sqlStr);
        // console.log(result.recordset);
        res.json(result.recordset);
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
        });
    } finally {
        
    }
});



router.get('/layout/:lot_num/:layer', async (req, res) => {
    const { lot_num, layer } = req.params;
    
    try {   
        const result = await poolSNDc.query(`SELECT DISTINCT TOP 1 a.partnum
            From acme.dbo.pdl_ckhistory a(nolock), acme.dbo.numoflayer b, acme.dbo.prodbasic c where a.layer = b.Layer  And a.partnum = c.PartNum
            And a.revision = c.Revision And a.lotnum in ('${lot_num}')
            And b.LayerName = '${layer}'`)
        console.log(`SELECT DISTINCT TOP 1 a.partnum
            From acme.dbo.pdl_ckhistory a(nolock), acme.dbo.numoflayer b, acme.dbo.prodbasic c where a.layer = b.Layer  And a.partnum = c.PartNum
            And a.revision = c.Revision And a.lotnum in ('${lot_num}')
            And b.LayerName = '${layer}'`);
        console.log(result.recordset);
        const { partnum } = result.recordset[0];
        const result2 = await poolSNDc.query(`SELECT DISTINCT TOP 1 Filmpart FROM SN_FilmPart_Map(nolock)
            where Acmepart = '${partnum}'`)
        const { Filmpart } = result2.recordset[0];
        console.log(Filmpart);
        const sqlBody = `SELECT DISTINCT CompXUpper,CompXLower,CompYUpper,CompYLower From SN_Layout_Center_Body a(nolock) where JobName ='${Filmpart}'`;
        const sqlHead = `SELECT MpLtX*MpLtY*4 UPP from SN_Layout_Center_Head(nolock) WHERE JobName ='${Filmpart}'`;
        const result3 = await Promise.all([poolSNDc.query(sqlBody), poolSNDc.query(sqlHead)])
        const data = result3[0].recordset;
        const headdata = result3[1].recordset;

        const mixinX = [...new Set([...data.map((i) => i.CompXUpper), ...data.map((i) => i.CompXLower)])].sort((a, b) => a - b);
        const mixinY = [...new Set([...data.map((i) => i.CompYUpper), ...data.map((i) => i.CompYLower)])].sort((a, b) => a - b);

        let dataAry = [];

        mixinX.forEach((x) => {

            const downAry = [];
            const topAry = [];

            const objdownbPoint = {};
            const objdownePoint = {};
            const objtopbPoint = {};
            const objtopePoint = {};

            objdownbPoint.x = x;
            objdownbPoint.y = mixinY[0];
            objdownePoint.x = x;
            objdownePoint.y = mixinY[mixinY.length / 2 - 1];

            objtopbPoint.x = x;
            objtopbPoint.y = mixinY[mixinY.length / 2];
            objtopePoint.x = x;
            objtopePoint.y = mixinY[mixinY.length - 1];

            downAry.push(objdownbPoint);
            downAry.push(objdownePoint);

            topAry.push(objtopbPoint);
            topAry.push(objtopePoint);

            dataAry.push(downAry);
            dataAry.push(topAry);

        });

        mixinY.forEach((y) => {

            const leftAry = [];
            const rightAry = [];

            const objleftbPoint = {};
            const objleftePoint = {};
            const objrightbPoint = {};
            const objrightePoint = {};

            objleftbPoint.x = mixinX[0];
            objleftbPoint.y = y;
            objleftePoint.x = mixinX[mixinX.length / 2 - 1];
            objleftePoint.y = y;

            objrightbPoint.x = mixinX[mixinX.length / 2];
            objrightbPoint.y = y;
            objrightePoint.x = mixinX[mixinX.length - 1];
            objrightePoint.y = y;

            leftAry.push(objleftbPoint);
            leftAry.push(objleftePoint);

            rightAry.push(objrightbPoint);
            rightAry.push(objrightePoint);

            dataAry.push(leftAry);
            dataAry.push(rightAry);

        });

        res.json({ dataAry, headdata });
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time: getCurrentTimeInTaipei()
        });
    } finally {
        
    }
});


module.exports = router;
