const express = require("express");
const sql = require("mssql");
const { timestampToYMDHIS, timestampToYMDHIS2, getCurrentTimeInTaipei } = require("../time");
const { mysqlConnection, queryFunc } = require("../mysql");
const { poolObj, initializePools } = require("../mssql");
const getDbConfig = require('../config/database');
const { convertToCamelCase } = require('../utils/formatters');
const router = express.Router();

// 初始化連接池變數
let poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc,poolH3Acme,poolS3Acme;



router.use(async (req, res, next) => {
    try {
        if (!poolAcme) {
            await initializePools();
            ({ poolAcme, poolDc, poolNCN, poolSNAcme, poolSNDc ,poolH3Acme,poolS3Acme} = poolObj);
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
      startTime.setDate(startTime.getDate() -21);
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
    SELECT DISTINCT partnum,lotnum, layer, proccode, AftStatus, ChangeTime, Location 
    FROM v_pdl_ckhistory(nolock) 
    WHERE proccode in ('AOI04','AOI26')
    AND BefStatus = 'CheckIn' 
    AND AftStatus = 'CheckOut'
    and partnum like '%2231611%'
    --AND BefStatus = 'MoveIn' 
    --AND AftStatus = 'CheckIn'
    AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'`;
    
    const snReadOutResult = await poolSNDc.query(sqlSnReadOut);
    // res.json([...new Set(snReadOutResult.recordset.map(i => i.lotnum.trim()))]);
    //
    const lotnumList = [...new Set(snReadOutResult.recordset.map(i => i.lotnum.trim()))];
    const sqlStringLotNum = `'${lotnumList.join("','")}'`;
    // res.json(sqlStringLotNum);
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
        V.PartNum part_num,
        V.Revision revision,
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
        CONVERT(varchar,J.ChangeTime, 120)ChangeTime
        FROM SN_VRS_test_result_new(nolock)X 
        LEFT JOIN SN_VRS_step_rec_new(nolock)V
        ON X.LotNum=V.LotNum AND X.Layer=V.Layer
        LEFT JOIN (
        select*from SN_Layout_Center_Head(nolock)
        	union
		    select*from YM_Layout_Center_Head(nolock)
        )H
        ON LEFT(X.CenterPart,7) = LEFT(H.JobName,7)
        LEFT JOIN 
        (
          SELECT DISTINCT lotnum,layer,Qnty_S,ChangeTime FROM v_pdl_ckhistory(nolock) WHERE 
          proccode in ('AOI04','AOI26')
          AND BefStatus = 'CheckIn' 
          AND AftStatus = 'CheckOut'
          AND ChangeTime BETWEEN '${l8sqlTime}' AND '${t8sqlTime}'
        )J 
        ON X.LotNum =J.lotnum AND X.layer =J.layer
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

      // res.json([...new Set(rawData.map(i=>i.LotNum))]); 
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
          `${r.PartNo}~${r.LotNum}~${r.LayerName}~${r.LayerType}~${r.LotType}~${r.upp}~${r.ChangeTime}~${r.ProdClass}~${r.Qnty_S}~${r.part_num}~${r.revision}~${r.ULMark94V}`
        )
      )];
      // res.json(lot_layer_qty);
      // 處理每個批次的資料
      lot_layer_qty.forEach((i) => {
        const [PartNo, LotNum, LayerName, LayerType, LotType, upp, ChangeTime, ProdClass,Qnty_S,part_num,revision,ULMark94V] = i.split("~");
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
          part_num,
          revision,
          device_name:ULMark94V,
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
    startDateObj.setDate(startDateObj.getDate() - 150);
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
            AND proccode in ('AOI04','AOI26')
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
          AND j.proccode in ('AOI04','AOI26')
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

router.get('/daily_platform', async (req, res) => {
  try {

    
    const sqlStr = `
    with p as (SELECT 
    m.PartNum, 
    m.Revision,
    m.PartNum + m.Revision AS partno,
    m.ProcCode, 
    l.LayerName, 
    CASE 
        WHEN l.LayerName = '-Outer' THEN 999
        ELSE (CAST(SUBSTRING(l.LayerName, CHARINDEX('L', l.LayerName, 4) + 1, 2) AS INT) - 
              CAST(SUBSTRING(l.LayerName, CHARINDEX('L', l.LayerName) + 1, CHARINDEX('L', l.LayerName, 4) - CHARINDEX('L', l.LayerName) - 1) AS INT) + 1) / 2 
    END AS Layer,
    CASE 
        WHEN r.issLayer = '1' THEN 'Core'
        ELSE 'Bu'
    END AS iscore,
    m.SerialNum, 
    m.RecipeType, 
    p.ProcName, 
    LEFT(p.ProcName, 3) + CAST(m.Degree AS CHAR(1)) + RIGHT(p.ProcName, 3) + CAST(m.Times AS CHAR(1)) AS ProcName2, 
    p.Decision 
FROM V_PnumProcRouteDtl (NOLOCK) m
INNER JOIN NumofLayer (NOLOCK) l ON m.layer = l.Layer
INNER JOIN ProcBasic (NOLOCK) p ON m.proccode = p.ProcCode
INNER JOIN ProdBOM (NOLOCK) r ON m.PartNum = r.PartNum AND m.Revision = r.Revision and l.LayerName=r.LayerName
WHERE ProcName='PTHECU'
), 
dt as (SELECT 
    PartNum,
    Revision, 
    COUNT(CASE WHEN iscore = 'Core' THEN 1 ELSE NULL END) AS core,
    COUNT(CASE WHEN iscore = 'Bu' THEN 1 ELSE NULL END) AS bu,
    count(*) as total
FROM p
GROUP BY PartNum,Revision)
select PartNum as part_no,0 as isdelete,Revision,'System' as creator,
	case when total>2  then (case when core>0 then 'Multi Layer Core' else '14通' end) else (case when total=1 then 'non-capping' else (case when core=0 then '14通' else 'capping' end) end)end as platform
	
 from dt`;
    const result = await poolSNAcme.query(sqlStr);
    const sqlcar=`Select distinct PartNum From PDL_ProcessNote where notes like '%車用%'`
    const carResult = await poolSNAcme.query(sqlcar);
    const carAry = carResult.recordset.map(i=>i.PartNum);

    const sqlS3 = `Select distinct PartNum From PDL_ProcessNote where notes like '%車用%'`
    const S3CarResult = await poolS3Acme.query(sqlS3);
    const S3CarAry = S3CarResult.recordset.map(i=>i.PartNum);
    const pool = await mysqlConnection(getDbConfig('aoi'));
    const sqlplatform = `SELECT * FROM platform WHERE isdelete = 0`;
    const platformResult = await queryFunc(pool, sqlplatform);
    const platformAry = platformResult.map(i=>i.part_no);
    

    result.recordset.forEach(i=>{
      if(carAry.includes(i.part_no+i.Revision)){
        i.platform = '車用';
      }
      if(S3CarAry.includes(i.part_no+i.Revision)){
        i.platform = '車用';
      }
      i.part_no=i.part_no.slice(0,7);
      delete i.Revision;
    });
    function removeDuplicates(array, key) {
      const uniqueKeys = new Set();
      return array.filter(item => {
          const value = item[key];
          if (!uniqueKeys.has(value)) {
              uniqueKeys.add(value);
              return true;
          }
          return false;
      });
    }
    const uniqueResult = removeDuplicates(result.recordset, 'part_no').filter(i=>!platformAry.includes(i.part_no));
      res.json({
        daily: {
          data: uniqueResult,
          db: "aoi",
          table: "platform",
          match: [
            'platform',
          ]
        },
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
