"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Banco = void 0;
require("dotenv/config");
const promise_1 = require("mysql2/promise");
class Banco {
}
exports.Banco = Banco;
Banco.pool = (0, promise_1.createPool)({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    dateStrings: true,
    connectionLimit: 5,
    connectTimeout: 10000,
    waitForConnections: true,
    queueLimit: 0,
    enableKeepAlive: true
});
