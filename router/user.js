const express = require('express');
const soap = require('soap');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const { configFunc } = require('../config.js');
const { mysqlConnection, queryFunc } = require('../mysql.js');
const getDbConfig = require('../config/database');
const { timestampToYMDHIS, getCurrentTimeInTaipei } = require('../time.js');

const router = express.Router();

// CORS 設置
router.use((req, res, next) => {
    // 允許特定來源或使用 * 允許所有來源
    res.header('Access-Control-Allow-Origin', '*');
    
    // 允許的 HTTP 方法
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    // 允許的請求頭
    res.header('Access-Control-Allow-Headers', 
        'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    
    // 允許發送認證信息
    res.header('Access-Control-Allow-Credentials', 'true');
    
    // 處理 OPTIONS 請求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

const key = 'YMYIP';
const whiteListAdmin = ['A4378','U00954'];
const SOAP_TIMEOUT = 30000; // 30秒超時

router.use(bodyParser.json());

router.post('/setadmin',async(req,res)=>{
    const {id}=req.body;
    whiteListAdmin.push(id);
    res.json({status:'success',message:'成功',data:whiteListAdmin});
});

// 登入路由
router.post('/login', async (req, res) => {
    const url = 'http://10.13.66.33/WCF_MyumtAuth/Service1.svc?singleWsdl';
    const args = req.body;
    console.log(args);
    // args.EMPID = 'A4378';
    // args.PWD = '16736';
    //給我一個現在時間的函式
    const time=getCurrentTimeInTaipei()
    console.log('時間戳',time);
    let connection;
    try {
        // 建立 SOAP 客戶端
        const client = await new Promise((resolve, reject) => {
            const options = {
                timeout: SOAP_TIMEOUT,
                forceSoap12Headers: false,
                wsdl_headers: {
                    Connection: 'keep-alive'
                }
            };

            soap.createClient(url, options, (err, client) => {
                if (err) {
                    console.error('SOAP 客戶端創建失敗:', err);
                    reject(err);
                } else {
                    resolve(client);
                }
            });
        });
        
        

        // 調用 SOAP 服務
        const result = await new Promise((resolve, reject) => {
            client.Myumt_Auth(args, (err, result) => {
                if (err) {
                    console.error('SOAP 服務調用失敗:', err);
                    reject(err);
                } else {
                    resolve(result);
                }
            });
        });
        console.log('結果',result);
        // 處理認證結果
        if (!result || !result.Myumt_AuthResult) {
            return res.status(500).json({ status: 'error', message: '認證服務返回無效結果' ,time});
        }
        // if (result.Myumt_AuthResult.DeptName.includes('YM') === false && 
        //     whiteList.includes(result.Myumt_AuthResult.id) === false) {
        //     return res.status(403).json({ status: 'error', message: '非YM或白名單用戶' });
        // }
        if (result.Myumt_AuthResult.Status === false) {
            return res.status(401).json({ status: 'error', message: '用戶不存在或帳號密碼錯誤，請重新輸入' ,time});
        }
        
        // 生成 JWT token
        const { id, name, DeptName,email,d1name } = result.Myumt_AuthResult;
        // 獲取白名單
        connection = await mysqlConnection(getDbConfig('user'));
        const sqlStr = `SELECT * FROM Whitelist WHERE isdelete = 'false' AND uid = '${id}'`;
        const whitelist = await queryFunc(connection, sqlStr);
        const authority = whitelist.map(item => item.authority);
        authority.push(d1name);
        //這裡要加設定的權限
        const admin = whiteListAdmin.includes(id);
        console.log(id,admin);
        const token = jwt.sign({ id, name, DeptName,email,authority,admin }, key);
        

        
        // console.log(sqlStrrevise);
        
        result.Myumt_AuthResult.authority = authority;
        result.Myumt_AuthResult.admin = admin;

        res.json({
            status: 'success',
            message: '成功',
            token,
            data: result.Myumt_AuthResult,
            time,
        });

    } catch (error) {
        console.error('登入處理失敗:', error);
        res.status(500).json({
            status: 'error',
            message: '服務暫時無法使用，請稍後再試',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            time, 
        });
    } finally {
        if (connection) {
            
            await connection.release();
            
        }
    }
});

// 獲取白名單
router.get('/getwhitelist', async (req, res) => {
    const time = new Date().getTime();
    let connection;
    try {
        connection = await mysqlConnection(getDbConfig('user'));
        const sqlStr = `SELECT * FROM Whitelist WHERE isdelete = 'false'`;
        const result = await queryFunc(connection, sqlStr);
        res.json({status: 'success', message: '成功', data: result, time:getCurrentTimeInTaipei()});
    } catch (error) {
        console.error('獲取白名單失敗:', error);
        res.status(500).json({status: 'error', message: '獲取失敗', time:getCurrentTimeInTaipei()});
    } finally {
        if (connection) {
            
            await connection.release();
            
        }
    }
});

// Token 驗證中間件
const verifyToken = (req, res, next) => {
    const time=new Date().getTime()
    const token = req.headers['authorization'];
    if (!token) {
        return res.status(401).json({ status: 'error', message: '未登入' ,time:getCurrentTimeInTaipei()});
    }

    jwt.verify(token, key, (err, user) => {
        if (err) {
            return res.status(403).json({ status: 'error', message: '驗證錯誤' ,time:getCurrentTimeInTaipei()});
        }
        req.user = user;
        next();
    });
};

// 驗證路由
router.get('/verify', verifyToken, (req, res) => {
    const time=getCurrentTimeInTaipei()
    res.json({ status: 'success', message: '成功', user: req.user,time });
});

// 記錄路由
router.post('/record', verifyToken, async (req, res) => {
    const time = getCurrentTimeInTaipei();
    let connection;
    try {
        const { ID, Name, DeptName, Time, Path } = req.body;
        connection = await mysqlConnection(getDbConfig('user'));
        
        const sqlStr = `INSERT INTO user_record(ID, Name, DeptName, Time, Path) 
                       VALUES (?, ?, ?, ?, ?)`;
        const result = await queryFunc(connection, sqlStr, [ID, Name, DeptName, Time, Path]);
        
        res.json({status: 'success', message: '成功', data: result, time});
    } catch (error) {
        console.error('記錄創建失敗:', error);
        res.status(500).json({status: 'error', message: '記錄創建失敗', time});
    } finally {
        if (connection) {
            
            await connection.release();
            
        }
    }
});

// 獲取記錄數量
router.get('/record/:st', verifyToken, async (req, res) => {
    const time = getCurrentTimeInTaipei();
    let connection;
    try {
        const { st } = req.params;
        connection = await mysqlConnection(getDbConfig('user'));
        const transSt = timestampToYMDHIS(new Date(Number(st)));
        
        const sqlStr = `SELECT Count(*) as Count FROM user_record 
                       WHERE Path = '/login' AND Time >= ?`;
        const result = await queryFunc(connection, sqlStr, [transSt]);
        
        res.json({status: 'success', message: '成功', data: result, time});
    } catch (error) {
        console.error('記錄查詢失敗:', error);
        res.status(500).json({status: 'error', message: '記錄查詢失敗', time});
    } finally {
        if (connection) {
            
            await connection.release();
            
        }
    }
});


router.post('/revisewhitelist', async (req, res) => {
    const time = getCurrentTimeInTaipei();
    console.log(time);
    // 將時間戳轉換為日期 格式為2024-12-20 00:00:00
    const date = new Date(time);
    const dateStr = date.toISOString().slice(0, 19).replace('T', ' ');
    console.log(dateStr);
    let connection;

    
    try {
        const { uid, authority, creator } = req.body;
        console.log(uid, authority, creator);
        if (!uid || !authority || !creator) {
            return res.status(400).json({
                status: 'error',
                message: '缺少必要參數',
                time
            });
        }

        // 獲取連接
        connection = await mysqlConnection(getDbConfig('user'));
        
        try {
            await connection.beginTransaction();
            // 先將現有權限標記為刪除
            const sqlStrrevise = `UPDATE Whitelist SET isdelete = 'true' WHERE uid = '${uid}'`;
            // console.log(sqlStrrevise);
            await queryFunc(connection, sqlStrrevise);
            
            // 插入新的權限
            for (const auth of authority) {
                //可以抓出id這個資料表的資料數量
                const sqlStrid = `SELECT COUNT(*) as Count FROM Whitelist`;
                const resultid = await queryFunc(connection, sqlStrid);
                const id = resultid[0].Count + 1;
                const sqlStrinsert = `
                    INSERT INTO Whitelist (id,uid, authority, creator, isdelete,time) 
                    VALUES ('${id}','${uid}', '${auth}', '${creator}', 'false','${dateStr}')`;
                    console.log(sqlStrinsert);
                await queryFunc(connection, sqlStrinsert);
            }
            
            await connection.commit();
            
            res.status(200).json({
                status: 'success',
                message: '成功',
                data: { uid, authority, creator },
                time
            });
            
        } catch (error) {
            if (connection) {
                await connection.rollback();
            }
            throw error;
        }
        
    } catch (error) {
        console.error('操作失敗:', error);
        res.status(500).json({
            status: 'error',
            message: error.message || '記錄創建失敗',
            time
        });
    } finally {
        if (connection) {
            
            await connection.release();
            
        }
    }
});

module.exports = router;
