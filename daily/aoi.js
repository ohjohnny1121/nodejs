const express = require("express");
const sql = require("mssql");
const { timestampToYMDHIS, timestampToYMDHIS2 } = require("../time");
const { mysqlConnection, queryFunc } = require("../mysql");
const { poolObj, initializePools } = require("../mssql");
const getDbConfig = require('../config/database');
const { convertToCamelCase } = require('../utils/formatters');
const router = express.Router();

// 初始化連接池變數
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



router.get("/sndailyadd", async (req, res) => {
  let aoiconn = null;
    try {
      
      const endTime = new Date();
      endTime.setDate(endTime.getDate()+1 );
      endTime.setHours(8, 0, 0, 0);
      const t8sqlTime = 
        endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);
  
      const startTime = new Date();
      startTime.setDate(startTime.getDate() -90);
      startTime.setHours(8, 0, 0, 0);
      const l8sqlTime = 
        startTime.toLocaleDateString() + " " + startTime.toTimeString().slice(0, 8);
        console.log(l8sqlTime, t8sqlTime);
      let ymlotArray = [];
      let snlotArray = [];
      let ymlotStr = "";
      let snlotStr = "";
      let ymlotCheck = [];

      // SN ReadOut的物料
//       const sqlSnReadOut = `
// SELECT h.lotnum, h.layer, h.proccode, h.AftStatus, h.ChangeTime, h.Location 
// FROM v_pdl_ckhistory(nolock) h
// INNER JOIN (
//     SELECT DISTINCT lotnum, layer, Qnty_S 
//     FROM v_pdl_ckhistory(nolock) 
//     WHERE proccode = 'AOI04'
//     AND BefStatus = 'CheckIn' 
//     AND AftStatus = 'CheckOut' 
//     --AND BefStatus = 'MoveIn' 
//     --AND AftStatus = 'CheckIn'
// ) --j ON h.lotnum = j.lotnum AND h.layer = j.layer
// --WHERE h.proccode = 'ABF27' 
// --AND ((h.BefStatus = 'MoveOut' and h.AftStatus = 'MoveIn') 
// --    OR (h.BefStatus = 'MoveOut' and h.AftStatus = 'MoveOut'))
// --AND h.ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'`;

const sqlSnReadOut = `
    SELECT DISTINCT lotnum, layer, proccode, AftStatus, ChangeTime, Location 
    FROM v_pdl_ckhistory(nolock) 
    WHERE proccode = 'AOI04'
    AND BefStatus = 'CheckIn' 
    AND AftStatus = 'CheckOut' 
    --AND BefStatus = 'MoveIn' 
    --AND AftStatus = 'CheckIn'
    AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'`;
    
    const snReadOutResult = await poolSNDc.query(sqlSnReadOut);
    //
    const lotnumList = [...new Set(snReadOutResult.recordset.map(i => i.lotnum.trim()))];
    const sqlStringLotNum = `'${lotnumList.join("','")}'`;
    // res.json(snReadOutResult);
    // 第二次查詢：比對 YM 和 H3 的批號
    const sqlissueDtl = `SELECT DISTINCT OldLotNum,trim(LotNum)LotNum
    FROM PDL_IssueDtl 
    WHERE LotNum IN (${sqlStringLotNum})
    --AND ProcCode='PLS07' 
    --AND IsCancel='0'`;
    



    const issueDtlResult = await poolSNAcme.query(sqlissueDtl);
    // const compareLotNum = issueDtlResult.recordset.map(i => i.LotNum.trim());
    snReadOutResult.recordset.forEach(i => {
      if(i.lotnum.trim().slice(4,5)==='6'){
        i.Factory = "S2";
      }else if(i.lotnum.trim().slice(4,5)==='D'){
        i.Factory = "S2A";
      }else if(i.lotnum.trim().slice(4,5)==='K'){
        i.Factory = "KF";
      }else if(i.lotnum.trim().slice(4,5)==='L'){
        i.Factory = "YM";
      }else if(i.lotnum.trim().slice(4,5)==='3'){
        i.Factory = "H3";
      }else if(i.lotnum.trim().slice(4,5)==='F'){
        i.Factory = "SN";
      }
      const index = issueDtlResult.recordset.findIndex(r => r.LotNum.trim().slice(0,12) === i.lotnum.trim().slice(0,12));
      if (index !== -1) {
        if(issueDtlResult.recordset[index].OldLotNum.trim().slice(4,5)==='L'){
          i.OldLotNum = issueDtlResult.recordset[index].OldLotNum.trim()
          i.Factory = "YM";
        }else if(issueDtlResult.recordset[index].OldLotNum.trim().slice(4,5)===3){
          i.OldLotNum = issueDtlResult.recordset[index].OldLotNum.trim()
          i.Factory = "H3";
        }
        // i.OldLotNum = issueDtlResult.recordset[index].OldLotNum.trim();
      }

    });
    
      const snvrs = `SELECT 
        Left(V.PartNum,7)PartNo,
        V.LotType,
        X.LotNum,
        V.Layer,
        RTRIM(V.LayerName)LayerName,
        V.LayerType,
        Side OutSide,
        X.BoardNo,
        X.Scrapped,
        X.Classify,
        X.VrsCode,
        X.Repair,
        X.UnitDefect,
        X.UnitDefect_AosBef,
        H.MpLtX,
        H.MpLtY,
        --H.MpLtX*H.MpLtY*2 Qnty_S,
        J.Qnty_S,
        CONVERT(varchar,C.ChangeTime, 120)ChangeTime
        FROM SN_VRS_test_result_new(nolock)X 
        INNER JOIN SN_VRS_step_rec_new(nolock)V
        ON X.LotNum=V.LotNum AND X.Layer=V.Layer
        INNER JOIN (
        select*from SN_Layout_Center_Head(nolock)
        	union
		    select*from YM_Layout_Center_Head(nolock)
        )H
        ON LEFT(X.CenterPart,7) = LEFT(H.JobName,7)
        INNER JOIN 
        (
          SELECT DISTINCT lotnum,layer,Qnty_S,ChangeTime FROM v_pdl_ckhistory(nolock) WHERE 
          proccode ='AOI04'
          AND BefStatus ='MoveIn' 
          AND AftStatus = 'CheckIn'
        )J 
        ON X.LotNum =J.lotnum AND X.layer =J.layer
        INNER JOIN
        (
          SELECT DISTINCT lotnum,layer,Qnty_S,ChangeTime FROM v_pdl_ckhistory(nolock) WHERE 
          proccode ='AOI04'
          AND AftStatus = 'CheckOut'
        )C 
        ON X.LotNum =C.lotnum AND X.layer =C.layer
        WHERE X.LotNum IN (${sqlStringLotNum}) 
        AND X.Classify !='0'
        AND X.UnitDefect_AosBef = '1'
        `;
        // console.log(snvrs);
      // const snvrsResult = await poolSNDc.query(snvrs);
      // res.json(snvrsResult.recordset);
      const sqlTrigger = `SELECT * FROM aoi_spec`;
      const sqlSf = `SELECT DISTINCT LEFT(PartNum,7) PN ,ULMark94V,NumOfLayer,ProdClass FROM
        prodbasic WHERE LEFT(PartNum,4)<>'UMGL' AND ULMark94V <>''`;
      const sqlLayout = `SELECT DISTINCT left(PartNum,7) JobName ,PnlToUnit upp from prodbasic`;
      aoiconn = await mysqlConnection(getDbConfig('aoi'));
      // 並行執行多個查詢
      const [snvrsResult,triggerResult,sfResult,layoutResult] = await Promise.all([
        poolSNDc.query(snvrs),
        queryFunc(aoiconn,sqlTrigger),
        poolSNAcme.query(sqlSf),
        poolSNAcme.query(sqlLayout)
      ]); 
      const rawData = snvrsResult.recordset;
      const triggerData = triggerResult;
      const sfData = sfResult.recordset;
      const layoutData = layoutResult.recordset;
      const summaryData = [];
      // res.json(rawData);
      // 處理數據
      rawData.forEach((r) => {
        const layerAry = r.LayerName.split("L");
        const layerCheck = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;
  
        const sfIdx = sfData.findIndex(s => r.PartNo === s.PN);
        // const triIdx = triggerData.findIndex(t => r.PartNo.toUpperCase() === t.part_no.toUpperCase());
        const layoutIdx = layoutData.findIndex(l => r.PartNo.toUpperCase() === l.JobName.toUpperCase());

        if(layoutIdx !== -1){
          const { upp } = layoutData[layoutIdx];
          r.upp = upp;
        }else{
          r.upp = "";
        }


        if (sfIdx !== -1) {
          const { ULMark94V, NumOfLayer, ProdClass } = sfData[sfIdx];
          r.ULMark94V = ULMark94V;
          r.NumOfLayer = NumOfLayer;
          r.ProdClass = ProdClass;
        } else {
          r.ULMark94V = "";
          r.NumOfLayer = "";
          r.ProdClass = "";
        }
        // 處理 trigger 和 target
        // console.log(triIdx,triggerData[triIdx],r.PartNo);
        // if(triIdx !== -1){
        //   r.triger = triggerData[triIdx].triger;
        //   r.target = triggerData[triIdx].target;
        // }else{
        //   r.triger = "";
        //   r.target = "";
        // }
        
      });
    //  res.json(rawData);
  
      const lot_layer_qty = [...new Set(
        rawData.map(r => 
          `${r.PartNo}~${r.LotNum}~${r.LayerName}~${r.LayerType}~${r.LotType}~${r.upp}~${r.ChangeTime}~${r.ProdClass}~${r.Qnty_S}`
        )
      )];
  
      // 處理每個批次的資料
      lot_layer_qty.forEach((i) => {
        const [PartNo, LotNum, LayerName, LayerType, LotType, upp, ChangeTime, ProdClass,Qnty_S] = i.split("~");
        const Obj = {};
  
        const filterData = rawData.filter(r => 
          r.LotNum === LotNum && 
          r.LayerName === LayerName 
            // r.Qnty_S === Number(upp)
        );

  
        // 從 filterData 中獲取第一筆資料的 MpLtX 和 MpLtY
        const firstRecord = filterData[0] || {};
        const mpLtX = firstRecord.MpLtX || "";
        const mpLtY = firstRecord.MpLtY || "";
  
        const aosbefUnique = new Map();
        const aosaftUnique = new Map();
  
        filterData.forEach((f) => {
          const key = `${f.LotNum}${f.LayerName}${f.OutSide}${f.BoardNo}${f.VrsCode}`;
  
          if (f.UnitDefect_AosBef && !aosbefUnique.has(key)) {
            aosbefUnique.set(key, f);
          }
          if (f.UnitDefect && f.Scrapped !== 0 && !aosaftUnique.has(key)) {
            aosaftUnique.set(key, f);
          }
        });
        
        const aosbefData = Array.from(aosbefUnique.values());
        const aosaftData = Array.from(aosaftUnique.values());
  
        const classifyObj = {};
  
        // 處理分類統計
        aosbefData.forEach((d) => {
          const side = d.OutSide === "C" ? "C" : "S";
          const key = `${d.Classify}-${side}`;
          classifyObj[key] = (classifyObj[key] || 0) + 1;
        });
  
        const classifyAry = Object.keys(classifyObj);
        const classifysortAryC = [];
        const classifysortAryS = [];
  
        classifyAry.forEach((c) => {
          const [defect, side] = c.split("-");
          const defectObj = {
            defect: c,
            count: classifyObj[c],
          };
          (side === "C" ? classifysortAryC : classifysortAryS).push(defectObj);
        });
  
        // 處理 TOP3 缺陷
        const processTop3 = (arr, prefix) => {
          const top3 = arr.sort((a, b) => b.count - a.count).slice(0, 3);
          while (top3.length < 3) {
            top3.push({ defect: "", count: 0 });
          }
          top3.forEach((t, idx) => {
            const [defect] = t.defect.split("-");
            Obj[`${prefix}_TOP_${idx + 1}`] = defect || "";
            Obj[`${prefix}_TOP${idx + 1}`] = t.count === 0 ? "" : 
              `${((t.count / (Number(Qnty_S)))).toFixed(4)}`;
          });
        };
  
        processTop3(classifysortAryC, "C");
        processTop3(classifysortAryS, "S");
  
        const uniqueAosBefCount = new Set(aosbefData.map(d => d.BoardNo + d.VrsCode)).size;
        const uniqueAosAftCount = new Set(aosaftData.map(d => d.BoardNo + d.VrsCode)).size;
        
        // 檢查 Core Layer
        // let checkCoreLayer = "";
        // if (LayerType === "CORE") {
        //   const index = ymlotCheck.findIndex((c) => {
        //     const layerArray = c.LayerName.split("L");
        //     return c.LotNum === LotNum && (layerArray[2] - layerArray[1] + 1) / 2 === 1;
        //   });
        //   if (index !== -1) {
        //     checkCoreLayer = ymlotCheck[index].LayerName;
        //   }
        // }
  
        const { OldLotNum, Lot_type } = ymlotCheck.find(c => c.LotNum === LotNum) || {};
  
        // 設置物件屬性
        Object.assign(Obj, {
          bef_Yield: (1 - uniqueAosBefCount / (Number(Qnty_S))).toFixed(4),
          Yield: (1 - uniqueAosAftCount / (Number(Qnty_S))).toFixed(4),
          Remark: "", // 預設為空
          PartNo,
          LotType,
          LotNum,
          OldLotNum,
          Layer: LayerName,
          Time: timestampToYMDHIS(ChangeTime),
          ProdClass,
          Factory: snReadOutResult.recordset.find(i => i.lotnum.trim() === LotNum).Factory,
          // triger,
          upp:upp,
          // MpLtX: mpLtX,
          // MpLtY: mpLtY,
        });
        
        summaryData.push(Obj);
      });
      const camelCaseData = convertToCamelCase(summaryData);
      // 返回結果
      res.json({
        daily: {
          data: camelCaseData,
          db: "aoi",
          table: "aoi_yield_defect",
          match: [
            'c_top_1',
            'c_top1',
            'c_top_2', 
            'c_top2',
            'c_top_3',
            'c_top3',
            's_top_1',
            's_top1',
            's_top_2',
            's_top2',
            's_top_3', 
            's_top3',
            'bef_yield',
            'yield',
            'remark',
            'time',
            'prod_class',
            // 'triger',
            'upp',
            'lot_type',
            'factory'
          ]
        },
      });
  
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }
  });
router.get("/trend", async (req, res) => {
  try {
    const startDateObj = new Date();
    const endDateObj = new Date();
    endDateObj.setDate(endDateObj.getDate() + 1);
    startDateObj.setDate(startDateObj.getDate() - 100);
    const startDateStr = startDateObj.toISOString().split('T')[0];
    const endDateStr = endDateObj.toISOString().split('T')[0];

    const sql = `
      WITH DefectCounts AS (
        SELECT 
          CenterPart part_no,
          LotNum lot_num,
          Layer layer,
          Classify defect_code,
          Side side,
          COUNT(DISTINCT CONCAT(BoardNo, VrsCode)) as count
        FROM 
          SN_VRS_Test_Result_new WITH (nolock)
        WHERE 
          classify != '0' 
          AND UnitDefect_AosBef = '1'
          AND EXISTS (
            SELECT 1 
            FROM v_pdl_ckhistory WITH (nolock)
            WHERE lotnum = LotNum 
            AND layer = Layer
            AND proccode = 'AOI04'
            AND ChangeTime BETWEEN '${startDateStr}' AND '${endDateStr}'
          )
        GROUP BY 
          CenterPart,
          LotNum,
          Layer,
          Classify,
          Side
      )
      SELECT 
        d.part_no,
        d.lot_num,
        d.layer,
        d.defect_code,
        d.side,
        TRIM(b.LayerName) as layer_name,
        CAST(d.count AS FLOAT) / NULLIF(j.Qnty_S, 0) as defect_rate
      FROM 
        DefectCounts d
        INNER JOIN v_pdl_ckhistory j WITH (nolock)
          ON d.lot_num = j.lotnum 
          AND d.layer = j.layer
          AND j.proccode = 'AOI04'
          AND j.ChangeTime BETWEEN '${startDateStr}' AND '${endDateStr}'
        LEFT JOIN SN_VRS_step_rec_new b WITH (nolock)
          ON d.layer = b.Layer 
          AND d.lot_num = b.LotNum
      WHERE 
        j.BefStatus = 'MoveIn' 
        AND j.AftStatus = 'CheckIn'`;

    const result = await poolSNDc.query(sql);

    res.json({
      daily: {
        data: result.recordset,
        db: "aoi",
        table: "aoi_lot_defect_rate",
        match: [
          'defect_rate',
          'defect_code'
        ]
      },
    });
    
  } catch(err) {
    console.log(err);
    res.status(500).json({ error: err.message });
  }
});
router.get("/example", async (req, res) => {
    try {
        // 直接指定要使用的數據庫名稱
        const conn = await mysqlConnection(getDbConfig('MySQL'));
        const result = await queryFunc(conn, 'SELECT * FROM your_table');
        
        // 需要用其他數據庫時
        const reportConn = await mysqlConnection(getDbConfig('Report'));
        const analysisConn = await mysqlConnection(getDbConfig('Analysis'));
        
        res.json({ result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// daily資料分defect_code CS
router.get('/daily_data_all_defect_CS/:factory/:part_no/:start_date/:end_date/:isTrigger', async (req, res) => {
    const { factory, part_no, start_date, end_date, isTrigger } = req.params;
    const limit = Number(req.query.limit) || 1000;
    
    try {
        const pool = await mysqlConnection(getDbConfig('aoi'));
        
        // 先獲取所有的 defect_code
        const sqlDefectCodes = `
            SELECT DISTINCT defect_code, side
            FROM aoi_lot_defect_rate d
            WHERE EXISTS (
                SELECT 1 
                FROM aoi_yield_defect a 
                WHERE a.lot_num = d.lot_num
                AND a.factory = ?
                AND a.part_no = ?
            )
            ORDER BY defect_code, side
        `;
        
        const defectCodes = await queryFunc(pool, sqlDefectCodes, [factory, part_no]);
        const pivotColumns = defectCodes
            .map(d => `SUM(CASE WHEN d.defect_code = '${d.defect_code}' AND d.side = '${d.side}' THEN d.defect_rate ELSE 0 END) as \`${d.defect_code}_${d.side}\``)
            .join(',\n');

        // 使用 UNION 合併最新和最舊的記錄
        const sqlStr = `
            (
                SELECT 
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
                    a.upp,
                    ${pivotColumns},
                    AVG(CAST(s.triger AS DECIMAL(10,2))) AS triger,
                    AVG(CAST(s.target AS DECIMAL(10,2))) AS target
                FROM aoi_yield_defect a
                LEFT JOIN aoi_lot_defect_rate d 
                    ON a.lot_num = d.lot_num
                    AND a.layer = d.layer_name
                LEFT JOIN aoi_spec s ON a.part_no = s.part_no
                WHERE a.time >= ? 
                AND a.time <= ? 
                AND a.factory = ?
                AND a.part_no = ?
                AND s.isdelete = 'false'
                ${Number(isTrigger) ? 'AND a.bef_yield <= s.triger' : ''}
                GROUP BY 
                    a.id, a.lot_num, a.layer, a.factory, a.prod_class,
                    a.part_no, a.lot_type, a.bef_yield, a.yield, a.time,
                    a.c_top_1, a.c_top1, a.c_top_2, a.c_top2, a.c_top_3,
                    a.c_top3, a.s_top_1, a.s_top1, a.s_top_2, a.s_top2,
                    a.s_top_3, a.s_top3, a.remark, a.upp
                ORDER BY a.time DESC
                LIMIT ${Math.ceil(limit/2)}
            )
            UNION
            (
                SELECT 
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
                    a.upp,
                    ${pivotColumns},
                    AVG(CAST(s.triger AS DECIMAL(10,2))) AS triger,
                    AVG(CAST(s.target AS DECIMAL(10,2))) AS target
                FROM aoi_yield_defect a
                LEFT JOIN aoi_lot_defect_rate d 
                    ON a.lot_num = d.lot_num
                    AND a.layer = d.layer_name
                LEFT JOIN aoi_spec s ON a.part_no = s.part_no
                WHERE a.time >= ? 
                AND a.time <= ? 
                AND a.factory = ?
                AND a.part_no = ?
                AND s.isdelete = 'false'
                ${Number(isTrigger) ? 'AND a.bef_yield <= s.triger' : ''}
                GROUP BY 
                    a.id, a.lot_num, a.layer, a.factory, a.prod_class,
                    a.part_no, a.lot_type, a.bef_yield, a.yield, a.time,
                    a.c_top_1, a.c_top1, a.c_top_2, a.c_top2, a.c_top_3,
                    a.c_top3, a.s_top_1, a.s_top1, a.s_top_2, a.s_top2,
                    a.s_top_3, a.s_top3, a.remark, a.upp
                ORDER BY a.time ASC
                LIMIT ${Math.ceil(limit/2)}
            )
            ORDER BY time DESC
        `;

        const result = await queryFunc(pool, sqlStr, [
            convertTimestampToFormattedDate(start_date),
            convertTimestampToFormattedDate(end_date),
            factory,
            part_no,
            convertTimestampToFormattedDate(start_date),
            convertTimestampToFormattedDate(end_date),
            factory,
            part_no
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

module.exports = router;
