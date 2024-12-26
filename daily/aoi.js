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


router.get("/trigger", async (req, res) => {
  const aoiconn = await mysqlConnection(getDbConfig('aoi'));
  const triggerData = await queryFunc(aoiconn, `SELECT * FROM sn_aoi_trigger `);
  console.log(triggerData);
    res.json(triggerData);
});


router.get("/sndailyadd", async (req, res) => {
  let aoiconn = null;
    try {
      
      const endTime = new Date();
      endTime.setDate(endTime.getDate() );
      endTime.setHours(8, 0, 0, 0);
      const t8sqlTime = 
        endTime.toLocaleDateString() + " " + endTime.toTimeString().slice(0, 8);
  
      const startTime = new Date();
      startTime.setDate(startTime.getDate() - 1);
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
    
    // 第二次查詢：比對 YM 和 H3 的批號
    const sqlissueDtl = `SELECT DISTINCT OldLotNum,trim(LotNum)LotNum
    FROM PDL_IssueDtl 
    WHERE LotNum IN (${sqlStringLotNum})
    --AND ProcCode='PLS07' 
    --AND IsCancel='0'`;
    



    const issueDtlResult = await poolSNAcme.query(sqlissueDtl);
    const compareLotNum = issueDtlResult.recordset.map(i => i.LotNum.trim());

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
      const index = issueDtlResult.recordset.findIndex(r => r.LotNum.trim() === i.lotnum.trim());
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
        H.MpLtX*H.MpLtY*2 Qnty_S,
        CONVERT(varchar,C.ChangeTime, 120)ChangeTime
        FROM SN_VRS_test_result_new(nolock)X 
        INNER JOIN SN_VRS_step_rec_new(nolock)V
        ON X.LotNum=V.LotNum AND X.Layer=V.Layer
        INNER JOIN SN_Layout_Center_Head(nolock)H
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
        AND X.Classify !='0'`;
        // console.log(snvrs);
      // const snvrsResult = await poolSNDc.query(snvrs);
      // res.json(snvrsResult.recordset);
      const sqlTrigger = `SELECT * FROM sn_aoi_trigger`;
      const sqlSf = `SELECT DISTINCT LEFT(PartNum,7) PN ,ULMark94V,NumOfLayer,ProdClass FROM
        prodbasic WHERE LEFT(PartNum,4)<>'UMGL' AND ULMark94V <>''`;
      const sqlLayout = `SELECT DISTINCT left(JobName,7) JobName ,MpLtX,MpLtY from SN_Layout_Center_Head(nolock)`;
      aoiconn = await mysqlConnection(getDbConfig('aoi'));
      // 並行執行多個查詢
      const [snvrsResult,triggerResult,sfResult,layoutResult] = await Promise.all([
        poolSNDc.query(snvrs),
        // poolAcme.query(sqlSf),
        queryFunc(aoiconn,sqlTrigger),
        // poolDc.query(sqlTrigger),
        poolSNAcme.query(sqlSf),
        poolSNDc.query(sqlLayout)
      ]);
      // res.json(triggerResult);
      
      const rawData = snvrsResult.recordset;
      const triggerData = triggerResult;
      // res.json(rawData);
      const sfData = sfResult.recordset;
      const layoutData = layoutResult.recordset;
      const summaryData = [];
  
      // 處理數據
      rawData.forEach((r) => {
        const layerAry = r.LayerName.split("L");
        const layerCheck = (Number(layerAry[2]) - Number(layerAry[1]) + 1) / 2;
  
        const sfIdx = sfData.findIndex(s => r.PartNo === s.PN);
        const triIdx = triggerData.findIndex(t => r.PartNo === t.shortpart);
        const layoutIdx = layoutData.findIndex(l => r.PartNo === l.JobName);

        if(layoutIdx !== -1){
          const { MpLtX, MpLtY } = layoutData[layoutIdx];
          r.MpLtX = MpLtX;
          r.MpLtY = MpLtY;
        }else{
          r.MpLtX = "";
          r.MpLtY = "";
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
  
        if (triIdx !== -1) {
          const { core, bu } = triggerData[triIdx];
          if (r.LayerName === "-Outer" && r.LayerType !== "CORE") {
            r.triger = bu;
          } else {
            r.triger = r.LayerType === "CORE" ? core : (layerCheck === 1 ? core : bu);
          }
        } else {
          r.triger = "";
        }
        
      });
     
  
      const lot_layer_qty = [...new Set(
        rawData.map(r => 
          `${r.PartNo}~${r.LotNum}~${r.LayerName}~${r.LayerType}~${r.LotType}~${r.Qnty_S}~${r.ChangeTime}~${r.ProdClass}~${r.triger}`
        )
      )];
  
      // 處理每個批次的資料
      lot_layer_qty.forEach((i) => {
        const [PartNo, LotNum, LayerName, LayerType, LotType, qty, ChangeTime, ProdClass, triger] = i.split("~");
        const Obj = {};
  
        const filterData = rawData.filter(r => 
          r.LotNum === LotNum && 
          r.LayerName === LayerName && 
          r.Qnty_S === Number(qty)
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
              `${((t.count / Number(qty)) * 100).toFixed(2)}%`;
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
          bef_Yield: (1 - uniqueAosBefCount / Number(qty)).toFixed(4),
          Yield: (1 - uniqueAosAftCount / Number(qty)).toFixed(4),
          Remark: `${LotNum}_${LayerName}`,
          PartNo,
          LotType,
          LotNum,
          OldLotNum,
          LotType: Lot_type,
          Layer: LayerName,
          // AOILayer: LayerName,
          Time: timestampToYMDHIS(ChangeTime),
          ProdClass,
          Factory: "SN",
          triger,
          MpLtX: mpLtX,
          MpLtY: mpLtY,
          value: ""
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
            'triger',
            'value',
            'mp_lt_x',
            'mp_lt_y',
          ]
        },
      });
  
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: err.message });
    }finally{
      if (aoiconn) {
        await aoiconn.destroy();
      }
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

module.exports = router;
