const express = require('express');

const configFunc = (db) => {
    return {
        host: '10.22.94.69',
        user: 'user_marvin',
        password: 'pwd123',
        database: db,
        
    }
}

const configFuncS3 = (db) => {
    return {
        host: '10.13.17.241',
        user: '05866',
        password: '2luidogi',
        database: db,
        
    }
}


module.exports = { configFunc,configFuncS3 };