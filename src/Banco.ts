import 'dotenv/config'
import { createPool, Pool } from 'mysql2/promise'

export class Banco {
  static readonly pool: Pool = createPool({
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
  })
}
