const express = require('express');

const timestampToYMDHIS=(timestamp)=>{
    const date=new Date(timestamp);
    const year=date.getFullYear();
    const month=String(date.getMonth()+1).padStart(2,'0');
    const day=String(date.getDate()).padStart(2,'0');
    const hours=String(date.getHours()).padStart(2,'0');
    const min=String(date.getMinutes()).padStart(2,'0');
    const sec=String(date.getSeconds()).padStart(2,'0');

    return `${year}/${month}/${day} ${hours}:${min}:${sec}`
   
}

const timestampToYMDHIS2 = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${min}:${sec}`

}
const timestampToYMDHIS3 = (timestamp) => {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    const sec = String(date.getSeconds()).padStart(2, '0');

    return `${month}/${day}/${year} ${hours}:${min}:${sec}`

}
function timestampToFormattedDate(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
function convertTimestampToFormattedDate(input) {
    // 如果輸入是字串，嘗試將其轉換為數字
    const timestamp = typeof input === 'string' ? Number(input) : input;

    // 檢查轉換後的值是否為有效數字
    if (isNaN(timestamp)) {
        throw new Error('Invalid timestamp');
    }

    const date = new Date(timestamp);
    const year = date.getUTCFullYear(); // 使用 UTC 年份
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // 使用 UTC 月份
    const day = String(date.getUTCDate()).padStart(2, '0'); // 使用 UTC 日期
    const hours = String(date.getUTCHours()).padStart(2, '0'); // 使用 UTC 小時
    const minutes = String(date.getUTCMinutes()).padStart(2, '0'); // 使用 UTC 分鐘
    const seconds = String(date.getUTCSeconds()).padStart(2, '0'); // 使用 UTC 秒

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}



const funcObj={
    timestampToYMDHIS,
    timestampToYMDHIS2,
    timestampToYMDHIS3,
    timestampToFormattedDate,
    convertTimestampToFormattedDate
}

module.exports=funcObj;