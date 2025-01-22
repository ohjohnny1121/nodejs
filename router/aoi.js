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
        }
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Allow-Credentials", true);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }
        
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



router.get('/trend_data_batch/:req_count', async (req, res) => {
    const { itemsArray } = req.query;
    let req_count = req.params.req_count/2;
    console.log(itemsArray);
    if(req_count === 0){
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: [],
            time: getCurrentTimeInTaipei()
        });
    }
    if(Number(req_count)){
       
    }else{
        res.status(400).json({
            status: 'error',
            message: '數量(req_count)輸入格式錯誤',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        let items;
        try {
            // 如果是字符串陣列，解析每個字符串為對象
            if (Array.isArray(itemsArray)) {
                items = itemsArray.map(item => {
                    // 移除換行符和多餘的空格
                    const cleanItem = item.replace(/\n/g, '').trim();
                    return JSON.parse(cleanItem);
                });
            } else if (typeof itemsArray === 'string') {
                // 如果是單個字符串，嘗試解析為陣列
                items = JSON.parse(itemsArray);
            } else {
                throw new Error('無效的輸入格式');
            }
        } catch (error) {
            console.error('解析錯誤:', error);
            return res.status(400).json({
                status: 'error',
                message: '輸入格式錯誤',
                time: getCurrentTimeInTaipei()
            });
        }
        const finalResults = [];
        for (const item of items) {
            let {process, part_no, lot_num, layer, defect_type} = item;
            let resultLotInfo = [];
        if (process.length === 8) {
                console.log('SNAcme');
                let sqlLotInfo = `
                SELECT CONVERT(VARCHAR(23), p.ChangeTime, 121) as ChangeTime
                    FROM PDL_CKHistory(nolock) p
                    LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                    LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer
            WHERE 
                lotnum = '${lot_num}'
                AND RTRIM(LayerName) = '${layer}'
                AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in ('${process}')
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn'`;
            resultLotInfo = await poolSNAcme.query(sqlLotInfo);
        }else{
            // console.log('SNAcme');
            let sqlLotInfo = `
                SELECT CONVERT(VARCHAR(23), p.ChangeTime, 121) as ChangeTime
                    FROM PDL_CKHistory(nolock) p
                    LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                    LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer
            WHERE 
                lotnum = '${lot_num}'
                AND RTRIM(LayerName) = '${layer}'
                AND ProcName in ('${process}')
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn'`;
            resultLotInfo = await poolSNAcme.query(sqlLotInfo);
        }
        if(resultLotInfo.recordsets[0].length === 0){
            console.log(item,'未找到記錄');
            continue;
        }
        console.log(resultLotInfo.recordsets);
        let lotCheckInTime = resultLotInfo.recordsets[0][0].ChangeTime;

        let pool = await mysqlConnection(getDbConfig('aoi'));
        let result = [];
        if(process.length === 8){
        let sqlStr = `
        SELECT * FROM (
    SELECT DISTINCT top ${req_count}
        LEFT(p.partnum,7) as part_no,
        RTRIM(lotnum) as lot_num,
        RTRIM(LayerName) as layer_name,
        t.ITypeName as lot_type,
        CONVERT(VARCHAR(23), p.ChangeTime, 120) as check_in_time,
        SUBSTRING(ProcName,1,3) as proc_group,
        ProcName as proc_name,
        MachineName,
        SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
        d.SerialNum,
        p.layer,
        b.PnlToUnit as upp,
        1 as QueryGroup,
        p.ChangeTime as sort_time
    FROM PDL_CKHistory(nolock) p
        LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode
        LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer
        LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
        LEFT JOIN prodbasic(nolock) b ON LEFT(p.partnum,7)=LEFT(b.PartNum,7)
        LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
        LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
    WHERE LEFT(p.partnum,7) IN ('${part_no}')
        AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in('${process}')
        AND BefStatus='MoveIn'
        AND AftStatus='CheckIn'
        AND LEFT(p.partnum,4)<>'UMGL'
        AND p.ChangeTime < CONVERT(DATETIME, '${lotCheckInTime}', 120)
    order by p.ChangeTime DESC

    UNION

    SELECT DISTINCT TOP ${req_count}
        LEFT(p.partnum,7) as part_no,
        RTRIM(lotnum) as lot_num,
        RTRIM(LayerName) as layer_name,
        t.ITypeName as lot_type,
        CONVERT(VARCHAR(23), p.ChangeTime, 120) as check_in_time,
        SUBSTRING(ProcName,1,3) as proc_group,
        ProcName as proc_name,
        MachineName,
        SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
        d.SerialNum,
        p.layer,
        b.PnlToUnit as upp,
        2 as QueryGroup,
        p.ChangeTime as sort_time
    FROM PDL_CKHistory(nolock) p
        LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode
        LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer
        LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
        LEFT JOIN prodbasic(nolock) b ON LEFT(p.partnum,7)=LEFT(b.PartNum,7)
        LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
        LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
    WHERE LEFT(p.partnum,7) IN ('${part_no}')
        AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in('${process}')
        AND BefStatus='MoveIn'
        AND AftStatus='CheckIn'
        AND LEFT(p.partnum,4)<>'UMGL'
        AND p.ChangeTime >= CONVERT(DATETIME, '${lotCheckInTime}', 120)
    order by p.ChangeTime ASC
) AS combined_results
ORDER BY sort_time ASC`;
            result = await poolSNAcme.query(sqlStr);
        }else{
            let sqlStr = `
        SELECT * FROM (
            SELECT DISTINCT top ${req_count}
                LEFT(p.partnum,7) as part_no,
                RTRIM(lotnum) as lot_num,
                RTRIM(LayerName) as layer_name,
                t.ITypeName as lot_type,
                CONVERT(VARCHAR(23), p.ChangeTime, 120) as check_in_time,
                b.PnlToUnit as upp,
                ProcName as proc_name,
                MachineName,
                SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
                d.SerialNum,
                p.layer,
                1 as QueryGroup,
                p.ChangeTime as sort_time
            FROM PDL_CKHistory(nolock) p 
                LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer 
                LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
                LEFT JOIN prodbasic(nolock) b ON LEFT(p.partnum,7)=LEFT(b.PartNum,7)
                LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
                LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
            WHERE LEFT(p.partnum,7) IN ('${part_no}') 
                AND ProcName in('${process}') 
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn' 
                AND LEFT(p.partnum,4)<>'UMGL'
                AND p.ChangeTime < CONVERT(DATETIME, '${lotCheckInTime}', 120)
            order by p.ChangeTime DESC
            UNION    
            
            SELECT DISTINCT TOP ${req_count}
                LEFT(p.partnum,7) as part_no,
                RTRIM(lotnum) as lot_num,
                RTRIM(LayerName) as layer_name,
                t.ITypeName as lot_type,
                CONVERT(VARCHAR(23), p.ChangeTime, 120) as check_in_time,
                b.PnlToUnit as upp,
                ProcName as proc_name,
                MachineName,
                SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
                d.SerialNum,
                p.layer,
                2 as QueryGroup,
                p.ChangeTime as sort_time
            FROM PDL_CKHistory(nolock) p 
                LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer 
                LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
                LEFT JOIN prodbasic(nolock) b ON LEFT(p.partnum,7)=LEFT(b.PartNum,7)
                LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
                LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
            WHERE LEFT(p.partnum,7) IN ('${part_no}') 
                AND ProcName in('${process}') 
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn' 
                AND LEFT(p.partnum,4)<>'UMGL'
                AND p.ChangeTime >= CONVERT(DATETIME, '${lotCheckInTime}', 120)
            order by p.ChangeTime ASC
        ) AS combined_results
        ORDER BY sort_time ASC`;
            result = await poolSNAcme.query(sqlStr);
        }

        // res.json(result.recordset);
        let lotList = result.recordset.map(item => (item.lot_num));
        // console.log(result.recordsets[0][0]);
        // res.json(result.recordsets[0][0].layer);
        let layerNumber = result.recordsets[0][0].layer;
        let sqlLotDefect = `SELECT * FROM aoi_lot_defect_rate WHERE lot_num IN (${lotList.map(item => `'${item}'`).join(',')}) AND layer = '${layerNumber}' AND defect_code = '${defect_type}'`;
        
        let resultLotDefect = await queryFunc(pool, sqlLotDefect);
        
        for (const item of result.recordset) {
            const defectItem = resultLotDefect.find(defect => defect.lot_num === item.lot_num);
            // if (defectItem) {
            item.defect_rate = defectItem?defectItem.defect_rate:0;
            
            // }
            
            // 刪除不需要的屬性
            delete item.QueryGroup;
            delete item.sort_time;
            delete item.SerialNum;
        }
        finalResults.push({part_no:part_no, lot_num:lot_num, layer:layer, defect_type:defect_type,process:process, data:result.recordset});
    }
    

        
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: finalResults,
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

router.get('/trend_data/:process/:part_no/:lot_num/:layer/:defect_type', async (req, res) => {
    const { process, part_no, lot_num, layer, defect_type } = req.params;
    console.log(process, part_no, lot_num, layer, defect_type);
    try {
        let resultLotInfo = [];
        if (process.length = 8) {
            console.log('SNAcme');
            const sqlLotInfo = `
            SELECT CONVERT(VARCHAR(23), p.ChangeTime, 121) as ChangeTime
                FROM PDL_CKHistory(nolock) p
                LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer
            WHERE 
                lotnum = '${lot_num}'
                AND RTRIM(LayerName) = '${layer}'
                AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in ('${process}')
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn'`;
            resultLotInfo = await poolSNAcme.query(sqlLotInfo);
        }

        const lotCheckInTime = resultLotInfo.recordsets[0][0].ChangeTime;
        
        const sqlStr = `
        SELECT * FROM (
            SELECT DISTINCT 
                LEFT(p.partnum,7) as part_no,
                RTRIM(lotnum) as lot_num,
                RTRIM(LayerName) as layer_name,
                t.ITypeName as lot_type,
                CONVERT(VARCHAR(23), p.ChangeTime, 121) as check_in_time,
                SUBSTRING(ProcName,1,3) as proc_group,
                ProcName as proc_name,
                MachineName,
                SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
                d.SerialNum,
                p.layer,
                1 as QueryGroup,
                p.ChangeTime as sort_time
            FROM PDL_CKHistory(nolock) p 
                LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer 
                LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
                LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
                LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
            WHERE LEFT(p.partnum,7) IN ('${part_no}') 
                AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in('${process}') 
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn' 
                AND LEFT(p.partnum,4)<>'UMGL'
                AND p.ChangeTime < CONVERT(DATETIME, '${lotCheckInTime}', 121)
            
            UNION    
            
            SELECT DISTINCT 
                LEFT(p.partnum,7) as part_no,
                RTRIM(lotnum) as lot_num,
                RTRIM(LayerName) as layer_name,
                t.ITypeName as lot_type,
                CONVERT(VARCHAR(23), p.ChangeTime, 121) as check_in_time,
                SUBSTRING(ProcName,1,3) as proc_group,
                ProcName as proc_name,
                MachineName,
                SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) as proc_name_e,
                d.SerialNum,
                p.layer,
                2 as QueryGroup,
                p.ChangeTime as sort_time
            FROM PDL_CKHistory(nolock) p 
                LEFT JOIN ProcBasic(nolock) c ON p.proccode=c.ProcCode 
                LEFT JOIN NumofLayer(nolock) n ON p.layer=n.Layer 
                LEFT JOIN PDL_Machine(nolock) m ON p.Machine=m.MachineId
                LEFT JOIN ClassIssType(nolock) t ON p.isstype=t.ITypeCode
                LEFT JOIN V_PnumProcRouteDtl(nolock) d ON p.partnum=d.PartNum AND p.revision=d.Revision AND p.proccode=d.ProcCode
            WHERE LEFT(p.partnum,7) IN ('${part_no}') 
                AND SUBSTRING(ProcName,1,3)+CAST(BefDegree AS VARCHAR)+SUBSTRING(ProcName,4,6)+CAST(BefTimes AS VARCHAR) in('${process}') 
                AND BefStatus='MoveIn' 
                AND AftStatus='CheckIn' 
                AND LEFT(p.partnum,4)<>'UMGL'
                AND p.ChangeTime < CONVERT(DATETIME, '${lotCheckInTime}', 121)
        ) AS combined_results
        ORDER BY 
            QueryGroup,
            sort_time DESC`;
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const result = await poolSNAcme.query(sqlStr);
        const lotList = result.recordset.map(item => (item.lot_num));
        const layerNumber = result.recordset[0].layer;
        const sqlLotDefect = `SELECT * FROM aoi_lot_defect_rate WHERE lot_num IN (${lotList.map(item => `'${item}'`).join(',')}) AND layer = '${layerNumber}' AND vrs_code = '${defect_type}'`;
        console.log(sqlLotDefect);
        const resultLotDefect = await queryFunc(pool, sqlLotDefect);

        for (const item of result.recordset) {
            const defectItem = resultLotDefect.find(defect => defect.lot_num === item.lot_num);
            if (defectItem) {
                item.defect_rate = defectItem.defect_rate;
                item.vrs_code = defectItem.vrs_code;
            }            
            // 刪除不需要的屬性
            delete item.QueryGroup;
            delete item.sort_time;
            delete item.SerialNum;
        }


        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result.recordset,
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


router.get('/lot-list/:factory/:lot_num/:layer', async (req, res) => {
    const { factory, lot_num, layer } = req.params;
    console.log(factory, lot_num, layer);
    if (typeof factory === 'undefined' || typeof lot_num === 'undefined' || typeof layer === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'factory, lot_num, layer 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `SELECT a.*,s.triger,s.target FROM aoi_yield_defect a left join (select * from aoi_spec where isdelete = false) s on upper(a.part_no) = upper(s.part_no) WHERE a.factory = '${factory}' AND lot_num = '${lot_num}' AND layer = '${layer}'`;
        const result = await queryFunc(pool, sqlStr);
        if (result.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到記錄',
                time: getCurrentTimeInTaipei()
            });
        }
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


router.get('/lot-list/:uid', async (req, res) => {
    const { uid } = req.params;
    console.log(uid);
    if (typeof uid === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'uid 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `SELECT * FROM user_lot_list WHERE uid = '${uid}'`;
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

router.post('/lot-list', async (req, res) => {
    const { uid, lot_list} = req.body;
    console.log(uid, lot_list);
    if (typeof uid === 'undefined' || typeof lot_list === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'uid 和 lot_list 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlDel = `DELETE FROM user_lot_list WHERE uid = '${uid}'`;
        const sqlStr = `INSERT INTO user_lot_list (uid, factory,part_no, lot_num,layer) VALUES ${lot_list.map(item => `('${uid}', '${item.factory}', '${item.part_no}', '${item.lot_num}','${item.layer}')`).join(',')}`;
        console.log(sqlStr);
        const resultDel = await queryFunc(pool, sqlDel);
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

router.delete('/lot-list', async (req, res) => {
    const { uid, factory, part_no, lot_num, layer } = req.query;
    console.log(uid, factory, part_no, lot_num, layer);
    if (typeof uid === 'undefined' || typeof factory === 'undefined' || typeof part_no === 'undefined' || typeof lot_num === 'undefined' || typeof layer === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'uid, factory, part_no, lot_num, layer 是必填的',
            time: getCurrentTimeInTaipei()
        });     
    }
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `DELETE FROM user_lot_list WHERE uid = '${uid}' AND factory = '${factory}' AND part_no = '${part_no}' AND lot_num = '${lot_num}' AND layer = '${layer}'`;
        const result = await queryFunc(pool, sqlStr);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到要刪除的記錄',
                time: getCurrentTimeInTaipei()
            });
        }

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
router.put('/lot-list', async (req, res) => {
    const { uid, factory, part_no, lot_num, layer } = req.body;
    console.log(uid, factory, part_no, lot_num, layer);
    if (typeof uid === 'undefined' || typeof factory === 'undefined' || typeof part_no === 'undefined' || typeof lot_num === 'undefined' || typeof layer === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'uid, factory, part_no, lot_num, layer 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE user_lot_list SET factory = '${factory}',part_no = '${part_no}', lot_num = '${lot_num}', layer = '${layer}' WHERE uid = '${uid}'`;
        const result = await queryFunc(pool, sqlStr);
        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到要更新的記錄',
                time: getCurrentTimeInTaipei()
            });
        }
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

router.delete('/lot-list-all', async (req, res) => {
    const { uid } = req.query;
    console.log(uid);
    if (typeof uid  === 'undefined' ) {
        return res.status(400).json({
            status: 'error',
            message: 'uid 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }


    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `DELETE FROM user_lot_list WHERE uid = '${uid}'`;
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
// 更新SN AOI 備註
router.post('/aoi-revise-remark', async (req, res) => {
    const { lot_num, remark } = req.body;

    // 檢查 lot_num 和 remark 是否為 undefined
    if (typeof lot_num === 'undefined' || typeof remark === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'lot_num 和 remark 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }

    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const sqlStr = `UPDATE aoi_yield_defect SET remark = '${remark}' WHERE lot_num = '${lot_num}'`;
        const result = await queryFunc(pool, sqlStr);
        
        // 檢查更新結果
        if (result.affectedRows === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到要更新的記錄',
                time: getCurrentTimeInTaipei()
            });
        }

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
    } 
});

// 獲取SN AOI 歷史資料
router.get('/history/:lot_num', async (req, res) => {
    
    const { lot_num } = req.params;
    // console.log(lotnum);
    // console.log('poolSNAcme:', poolSNAcme);
    if (typeof lot_num === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'lot_num 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    if (!poolSNAcme) {  
        return res.status(500).json({
            status: 'error',
            message: '數據庫連接未初始化',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const sqlStr = `SELECT 
                            RTRIM(a.lotnum) AS lot_num,
                            RTRIM(c.LayerName) AS layer,
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
                            RTRIM(a.lotnum) = '${lot_num}'
                            and a.BefStatus ='CheckIn'
                            and a.AftStatus ='CheckOut'
                        ORDER BY 
                            a.ChangeTime ASC`;
        const result = await poolSNAcme.query(sqlStr);
        
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result.recordset,
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
router.get('/aoidaily/:startDate/:endDate/:factory/:isTrigger', async (req, res) => {
    try {
        const { startDate, endDate, factory, isTrigger } = req.params;
        console.log(convertTimestampToFormattedDate(startDate), convertTimestampToFormattedDate(endDate), factory, isTrigger);
        if (typeof startDate === 'undefined' || typeof endDate === 'undefined' || typeof factory === 'undefined') {
            return res.status(400).json({
                status: 'error',
                message: 'startDate, endDate, factory 是必填的',
                time: getCurrentTimeInTaipei()
            });
        }
        const startTimestamp = Number(startDate);
        const endTimestamp = Number(endDate);
        // console.log(startTimestamp, convertTimestampToFormattedDate(startTimestamp), convertTimestampToFormattedDate(endTimestamp));
        
        // 直接獲取 pool
        const pool = await mysqlConnection(getDbConfig('aoi'));

        // 使用參數化查詢
        const sqlStr = `SELECT 
                        a.factory,
                        a.prod_class,
                        a.part_no,
                        a.lot_num,
                        a.layer,
                        a.lot_type,
                        a.bef_yield,
                        a.yield,
                        DATE_FORMAT(a.time, '%Y-%m-%d %H:%i:%s') as time,
                        a.c_top_1,
                        a.c_top1,
                        a.c_top_2,
                        a.c_top2,
                        a.c_top_3,
                        a.c_top3,
                        a.s_top_1,
                        a.s_top1,
                        a.s_top_2,
                        a.s_top2,
                        a.s_top_3,
                        a.s_top3,
                        a.remark,
                        upp,
                        s.triger,
                        s.target
                        FROM aoi_yield_defect a
                        LEFT JOIN aoi_spec s ON a.part_no = s.part_no
                        WHERE a.time >= ? 
                        AND a.time <= ? 
                        AND a.factory = ?
                        and s.isdelete = 'false'
                        ${isTrigger ? 'and a.bef_yield<=s.triger' : ''}`;

        const result = await queryFunc(pool, sqlStr, [convertTimestampToFormattedDate(startTimestamp), convertTimestampToFormattedDate(endTimestamp), factory]);
        
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


//分CS
router.get('/daily_data_all_defect_CS/:factory/:part_no/:start_date/:end_date/:isTrigger', async (req, res) => {
    const { factory, part_no, start_date, end_date, isTrigger } = req.params;
    

    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        
        // 先獲取所有的 defect_code，用於構建動態 PIVOT
        const sqlDefectCodes = `
            SELECT DISTINCT defect_code, side
            FROM aoi_lot_defect_rate d
            WHERE EXISTS (
                SELECT * 
                FROM aoi_yield_defect a 
                WHERE a.lot_num = d.lot_num
                AND a.factory = ?
                AND a.part_no = ?
            )
            ORDER BY defect_code, side
        `;
        
        
        const defectCodes = await queryFunc(pool, sqlDefectCodes, [
            // convertTimestampToFormattedDate(start_date),
            // convertTimestampToFormattedDate(end_date),
            factory,
            part_no
        ]);
        // res.json(defectCodes);
        // 構建動態 PIVOT SQL
        const pivotColumns = defectCodes
            .map(d => `sum(CASE WHEN d.defect_code = '${d.defect_code}' and d.side = '${d.side}' THEN d.defect_rate ELSE 0 END) as \`${d.defect_code}_${d.side}\``)
            .join(',\n');

        const sqlStr = `
            SELECT 
                a.*,
                ${pivotColumns}
            FROM aoi_yield_defect a
            LEFT JOIN aoi_lot_defect_rate d 
                ON a.lot_num = d.lot_num
                and a.layer = d.layer_name
            LEFT JOIN aoi_spec s ON a.part_no = s.part_no
            WHERE a.time >= ? 
            AND a.time <= ? 
            AND a.factory = ?
            AND a.part_no = ?
            and s.isdelete = 'false'
            ${isTrigger ? 'and a.bef_yield<=s.triger' : ''}
            GROUP BY 
                a.id, 
                a.lot_num,
                a.layer,
                a.factory,
                a.prod_class,
                a.part_no,
                a.lot_type,
                a.bef_yield,
                a.yield,
                a.time,
                a.c_top_1,
                a.c_top1,
                a.c_top_2,
                a.c_top2,
                a.c_top_3,
                a.c_top3,
                a.s_top_1,
                a.s_top1,
                a.s_top_2,
                a.s_top2,
                a.s_top_3,
                a.s_top3,
                a.remark,
                a.upp
            ORDER BY a.time DESC
        `;
        // console.log(sqlStr);
        const result = await queryFunc(pool, sqlStr, [
            convertTimestampToFormattedDate(start_date),
            convertTimestampToFormattedDate(end_date),
            factory,
            part_no
        ]);

        if (result.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: '成功',
                data: [],
                time: getCurrentTimeInTaipei()
            });
        }

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


router.get('/daily_data_all_defect/:factory/:part_no/:start_date/:end_date/:isTrigger', async (req, res) => {
    const { factory, part_no, start_date, end_date, isTrigger } = req.params;
    console.log(convertTimestampToFormattedDate(start_date),convertTimestampToFormattedDate(end_date));

    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        
        // 先獲取所有的 defect_code，用於構建動態 PIVOT
        const sqlDefectCodes = `
            SELECT DISTINCT defect_code 
            FROM aoi_lot_defect_rate d
            WHERE EXISTS (
                SELECT * 
                FROM aoi_yield_defect a 
                WHERE a.lot_num = d.lot_num
                AND a.factory = ?
                AND a.part_no = ?
            )
            ORDER BY defect_code
        `;
        
        
        const defectCodes = await queryFunc(pool, sqlDefectCodes, [
            factory,
            part_no
        ]);
        // 構建動態 PIVOT SQL
        const pivotColumns = defectCodes
            .map(d => `SUM(CASE WHEN d.defect_code = '${d.defect_code}' THEN d.defect_rate ELSE 0 END) as \`${d.defect_code}\``)
            .join(',\n');

        const sqlStr = `
            SELECT 
                a.*,
                ${pivotColumns},
                AVG(CAST(s.triger AS DECIMAL(10,2))) AS triger,
                AVG(CAST(s.target AS DECIMAL(10,2))) AS target
            FROM aoi_yield_defect a
            LEFT JOIN aoi_lot_defect_rate d 
                ON a.lot_num = d.lot_num
                and a.layer = d.layer_name
            LEFT JOIN aoi_spec s ON a.part_no = s.part_no
            WHERE a.time >= ? 
            AND a.time <= ? 
            AND a.factory = ?
            AND a.part_no = ?
            and s.isdelete = 'false'
            ${isTrigger ? 'and a.bef_yield<=s.triger' : ''}
            GROUP BY 
                a.id, 
                a.lot_num,
                a.layer,
                a.factory,
                a.prod_class,
                a.part_no,
                a.lot_type,
                a.bef_yield,
                a.yield,
                a.time,
                a.c_top_1,
                a.c_top1,
                a.c_top_2,
                a.c_top2,
                a.c_top_3,
                a.c_top3,
                a.s_top_1,
                a.s_top1,
                a.s_top_2,
                a.s_top2,
                a.s_top_3,
                a.s_top3,
                a.remark,
                a.upp
            ORDER BY a.time DESC
        `;
        // console.log(sqlStr);
        const result = await queryFunc(pool, sqlStr, [
            convertTimestampToFormattedDate(start_date),
            convertTimestampToFormattedDate(end_date),
            factory,
            part_no
        ]);

        if (result.length === 0) {
            return res.status(200).json({
                status: 'success',
                message: '成功',
                data: [],
                time: getCurrentTimeInTaipei()
            });
        }

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

// 獲取AOI 圖片
// 建立連線池工廠
const createConnectionPool = () => {
    const pool = genericPool.createPool({
        create: async () => {
            const sftp = new Client();
            await sftp.connect({
                host: "10.23.60.3",
                port: 22,
                username: "Lthmanager_user",
                password: "1qazXSW@user",
                readyTimeout: 20000,
                retries: 3,
            });
            return sftp;
        },
        destroy: async (client) => {
            await client.end();
        }
    }, {
        max: 10,
        min: 2,
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
        evictionRunIntervalMillis: 1000,
        fifo: false,
    });

    // 監控連線池狀態
    setInterval(() => {
        console.log('Pool status:', {
            poolSize: pool.size,
            available: pool.available,
            pending: pool.pending,
        });
    }, 60000);

    return {
        // 執行操作的包裝函數
        withConnection: async (operation) => {
            let client = null;
            try {
                client = await pool.acquire();
                return await operation(client);
            } finally {
                if (client) {
                    await pool.release(client);
                }
            }
        },
        // 關閉連線池
        drain: async () => {
            await pool.drain();
            await pool.clear();
        }
    };
};

// 建立單例
const sftpPool = createConnectionPool();
module.exports = sftpPool;

// 檢查檔案路徑是否存在的輔助函數
const checkPaths = async (sftp, paths) => {
    const results = await Promise.all(
        paths.map(async path => ({
            path,
            exists: await sftp.exists(path)
        }))
    );
    return results.find(r => r.exists)?.path;
};

// router.js

router.get('/image', async (req, res) => {
    try {
        const { ImagePath, DefectSeq, BoardNo, Side, xValue, yValue } = req.query;
        const filePath = ImagePath.replace(/^\\\\[\d\.]+/, "");
        
        const result = await sftpPool.withConnection(async (sftp) => {
            let finalPath = "";
            const xOffSet = -7;
            let xValueNum = Number(xValue);
            let yValueNum = Number(yValue);

            if (filePath.includes("ai_service")) {
                const exists = await sftp.exists(filePath);
                if (!exists) {
                    if (filePath.includes("ud1")) {
                        const basePath = filePath.replace("ud1", "ud2");
                        finalPath = await checkPaths(sftp, [
                            `${basePath}/${BoardNo}_${Side}_${xValueNum.toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`,
                            `${basePath}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`
                        ]);
                    } else if (filePath.includes("ud2")) {
                        const basePath = filePath.replace("ud2", "ud1");
                        finalPath = await checkPaths(sftp, [
                            `${basePath}/${BoardNo}_${Side}_${xValueNum.toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`,
                            `${basePath}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`
                        ]);
                    }
                } else {
                    finalPath = await checkPaths(sftp, [
                        `${filePath}/${BoardNo}_${Side}_${xValueNum.toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`,
                        `${filePath}/${BoardNo}_${Side}_${(xValueNum + xOffSet).toFixed(4)}0_${yValueNum.toFixed(4)}0.jpg`
                    ]);
                }
            } else {
                finalPath = `${filePath}/${DefectSeq}.jpg`;
            }

            if (!finalPath) {
                throw new Error('Image not found');
            }

            const buffer = await sftp.get(finalPath);
            return buffer ? buffer.toString("base64") : null;
        });

        res.json({
            status: 'success',
            message: '成功',
            image: result,
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
        if (typeof lot_num === 'undefined' || typeof layer === 'undefined' || typeof isincludefake === 'undefined') {
            return res.status(400).json({
                status: 'error',
                message: 'lot_num, layer, isincludefake 是必填的',
                time: getCurrentTimeInTaipei()
            });
        }
        // SN_VRS_test_result_new    
        const sqlStr = `SELECT *,Lotnum as lot_num,PartNo as part_no,trim(LayerName) as layer from V_LayoutDetail_Jmp(nolock) where LotNum ='${lot_num}' and LayerName='${layer}'${scrappedFilter}`;
        // console.log(sqlStr);
        const result = await poolSNDc.query(sqlStr);
        if (result.recordset.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到記錄',
                time: getCurrentTimeInTaipei()
            });
        }
        // console.log(result.recordset);
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result.recordset,
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
        
    }
});



router.get('/layout/:lot_num/:layer', async (req, res) => {
    const { lot_num, layer } = req.params;
    if (typeof lot_num === 'undefined' || typeof layer === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'lot_num, layer 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }

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
        if (dataAry.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: '未找到記錄',
                time: getCurrentTimeInTaipei()
            });
        }

        res.status(200).json({
            status: 'success',
            message: '成功',
            data: { dataAry, headdata },
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



//NCN
router.get('/ncnrecord/:lot', async (req, res) => {

    const { lot } = req.params;
    if (typeof lot === 'undefined') {
        return res.status(400).json({
            status: 'error',
            message: 'lot 是必填的',
            time: getCurrentTimeInTaipei()
        });
    }
    try {
        const result = await poolSNNCN.query(`
            SELECT
                lot_no,
                ncn_no,
                open_datetime,
                SUBSTRING(Layer,CHARINDEX('/',Layer)+2,LEN(Layer)) as layer,
                Case when SUBSTRING(Failure_mode,0,CHARINDEX('/',Failure_mode))='' then Failure_mode else SUBSTRING(Failure_mode,0,CHARINDEX('/',Failure_mode)) end as failure_mode,
                Problem_des as problem_des,
                Prd_qty as prd_qty ,
                Defect_qty as defect_qty,
                Prd_unit as prd_unit,
                Defect_unit as defect_unit,
                ncn_level as ncn_level 
            FROM 
                MRB_Detail(nolock)
            WHERE 
                lot_no = '${lot}' OR ncn_no IN (SELECT ncn_no FROM MRB_WIP(nolock) WHERE WIP_LN ='${lot}' OR WIP_PN ='${lot}' )
            AND 
                mrb_status='Y' 
            ORDER BY 
                layer desc
        `)
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result.recordset,
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


router.get('/process_name', async (req, res) => {
    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        const result = await pool.query(`SELECT * FROM process_name ORDER BY time DESC`);

        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result[0], // mysql2 返回的是陣列，第一個元素才是結果
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

router.post('/process_name', async (req, res) => {
    const { process_name, creator } = req.body;
    console.log(process_name, creator);
    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        const result = await pool.query(
            `INSERT INTO process_name (name, creator) 
             VALUES (?, ?) 
             ON DUPLICATE KEY UPDATE 
             creator = VALUES(creator)`,
            [process_name, creator]
        );
        
        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result[0],
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

router.delete('/process_name/:process_name', async (req, res) => {
    const { process_name } = req.params;
    console.log('Attempting to delete process_name:', process_name);
    
    if (!process_name) {
        return res.status(400).json({
            status: 'error',
            message: 'process_name is necessary',
            time: getCurrentTimeInTaipei()
        });
    }

    const pool = await mysqlConnection(getDbConfig('aoi'));
    try {
        const result = await pool.query(
            'DELETE FROM process_name WHERE name = ?',
            [process_name]
        );
        
        // console.log('Delete result:', result);
        
        // if (result[0].affectedRows === 0) {
        //     return res.status(404).json({
        //         status: 'error',
        //         message: '找不到要刪除的記錄',
        //         time: getCurrentTimeInTaipei()
        //     });
        // }
        
        res.status(200).json({
            status: 'success',
            message: '成功刪除記錄',
            data: result[0],
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('刪除操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '刪除記錄失敗',
            time: getCurrentTimeInTaipei()
        });
    }
});

router.get('/central_part_no', async (req, res) => {
    const pool = await mysqlConnection(getDbConfig('aoi'));
    const result = await pool.query(`SELECT * FROM central_part_no WHERE isdelete = false`);
    res.status(200).json({
        status: 'success',
        message: '成功',
        data: result[0],
        time: getCurrentTimeInTaipei()
    });
});

router.post('/central_part_no', async (req, res) => {
    const { part_no,factory,creator } = req.body;
    console.log(part_no,factory,creator);
    const pool = await mysqlConnection(getDbConfig('aoi'));
    const deleteResult = await pool.query(`update central_part_no set isdelete=true where part_no = '${part_no}' and factory = '${factory}'`);
    const result = await pool.query(`INSERT INTO central_part_no (part_no,factory,creator,isdelete) VALUES (?,?,?,?)`, [part_no,factory,creator,false]);
    res.status(200).json({
        status: 'success',
        message: '成功',
        data: result[0],
        time: getCurrentTimeInTaipei()
    });
});

router.delete('/central_part_no/:part_no/:factory', async (req, res) => {
    const { part_no, factory } = req.params;  // 使用 req.params 而不是 req.query
    console.log('part_no,factory',part_no,factory);
    if (!part_no || !factory) {
        return res.status(400).json({
            status: 'error',
            message: '參數不完整：需要 part_no 和 factory',
            time: getCurrentTimeInTaipei()
        });
    }

    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        const result = await pool.query(
            'UPDATE central_part_no SET isdelete = true WHERE part_no = ? AND factory = ?',
            [part_no, factory]
        );

        res.status(200).json({
            status: 'success',
            message: '成功',
            data: result[0],
            time: getCurrentTimeInTaipei()
        });
    } catch (error) {
        console.error('刪除操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '刪除記錄失敗',
            time: getCurrentTimeInTaipei()
        });
    }
});

module.exports = router;
