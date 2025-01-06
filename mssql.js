const express = require("express");
const sql = require("mssql");
const router = express.Router();

// CORS 中間件
router.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  res.setHeader("Access-Control-Allow-Header", "Content-Type,Authorization");
  res.setHeader("Access-Control-Allow-Credentials", true);
  next();
});

// 默認配置
const defaultOptions = {
  encrypt: false,
  trustServerCertificate: true,
  requestTimeout: 300000,
};

const defaultPoolConfig = {
  max: 10000,
  min: 0,
  idleTimeoutMillis: 3000000,
};

// 數據庫配置
const dbConfigs = {
  H3Acme: {
    server: "utchfacmrpt",
    user: "S3YIP",
    password: "yipread",
    database: "acme",
    options: { ...defaultOptions, requestTimeout: 600000 },
    pool: defaultPoolConfig,
  },
  SPC: {
    server: "10.22.65.105",
    user: "ymyip",
    password: "5CQPBcyE",
    database: "SPC_Unimicron",
    options: { ...defaultOptions, requestTimeout: 3000000 },
    pool: defaultPoolConfig,
  },
  MaterialYM: {
    server: "UTCYMEDCLSNR01",
    user: "ymyip",
    password: "pr&rZw93",
    database: "Material_YM",
    options: { ...defaultOptions, requestTimeout: 3000000 },
    pool: defaultPoolConfig,
  },
  Dc: {
    server: "10.22.65.120",
    user: "dc",
    password: "dc",
    database: "dc",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  Dchold: {
    server: "UTCYMACMT02",
    user: "dc",
    password: "dc",
    database: "dc",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  Acme: {
    server: "10.22.65.120",
    user: "dc",
    password: "dc",
    database: "acme",
    options: { ...defaultOptions, requestTimeout: 600000 },
    pool: defaultPoolConfig,
  },
  NCN: {
    server: "10.22.65.134",
    user: "ymyip",
    password: "5CQPBcyE",
    database: "NCN",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  NCNTest: {
    server: "10.22.65.134",
    user: "ymyip",
    password: "5CQPBcyE",
    database: "NCN_TEST",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  Bga: {
    server: "Utcsycimdw01",
    user: "Pc_user",
    password: "Aa12345",
    database: "bga_eda",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  Edc: {
    server: "10.22.66.37",
    user: "EDC_reader",
    password: "e@Iu(E08",
    database: "YM_EDC",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  Metrology: {
    server: "10.22.66.37",
    user: "ymyip",
    password: "pr&rZw93",
    database: "YM_Metrology",
    options: { ...defaultOptions, requestTimeout: 3000000 },
    pool: defaultPoolConfig,
  },
  SNAcme: {
    server: "UTCSNACMLSNR",
    user: "dc_read",
    password: "ewFJ9%(4",
    database: "acme",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  SNDc: {
    server: "UTCSNACMLSNR",
    user: "dc_read",
    password: "ewFJ9%(4",
    database: "dc",
    options: defaultOptions,
    pool: defaultPoolConfig,
  },
  SNNCN:{
    server: "UTCSNCIMDB",
    user: "snyip",
    password: "sq4NM$*0",
    database: "NCN",
    options: defaultOptions,
    pool: defaultPoolConfig,
  }
};

// 連接池創建工廠
const createPool = async (config, name) => {
  try {
    const pool = new sql.ConnectionPool(config);
    
    // 添加錯誤監聽
    pool.on('error', err => {
      console.error(`Database ${name} pool error:`, err);
    });

    await pool.connect();
    console.log(`SQL Server ${name} connection successful!`);
    return pool;
  } catch (err) {
    console.error(`Error connecting to ${name}:`, err);
    throw err;
  }
};

// 修改初始化和導出方式
const poolObj = {};

// 初始化所有連接池
const initializePools = async () => {
  for (const [name, config] of Object.entries(dbConfigs)) {
    try {
      poolObj[`pool${name}`] = await createPool(config, name);
      console.log(`Initialized pool for ${name}`);
    } catch (err) {
      console.error(`Failed to initialize ${name} pool`, err);
    }
  }
  console.log('All pools initialized:', Object.keys(poolObj));
  return poolObj;
};

// 優雅關閉
process.on('SIGINT', async () => {
  console.log('Closing all database connections...');
  for (const pool of Object.values(poolObj)) {
    try {
      await pool.close();
    } catch (err) {
      console.error('Error closing pool:', err);
    }
  }
  process.exit(0);
});

// 移除頂層 await
module.exports = {
  initializePools,
  poolObj
};