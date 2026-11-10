"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClimaIpc = exports.OpenMeteoClient = void 0;
require("dotenv/config");
const electron_1 = require("electron");
const CODIGOS_CHUVA = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const DESCRICOES = {
    0: 'Céu limpo',
    1: 'Predominantemente limpo',
    2: 'Parcialmente nublado',
    3: 'Nublado',
    45: 'Neblina',
    48: 'Neblina com geada',
    51: 'Garoa leve',
    53: 'Garoa moderada',
    55: 'Garoa intensa',
    56: 'Garoa congelante leve',
    57: 'Garoa congelante intensa',
    61: 'Chuva leve',
    63: 'Chuva moderada',
    65: 'Chuva intensa',
    66: 'Chuva congelante leve',
    67: 'Chuva congelante intensa',
    71: 'Neve leve',
    73: 'Neve moderada',
    75: 'Neve intensa',
    77: 'Grãos de neve',
    80: 'Pancadas de chuva leves',
    81: 'Pancadas de chuva moderadas',
    82: 'Pancadas de chuva intensas',
    85: 'Pancadas de neve leves',
    86: 'Pancadas de neve intensas',
    95: 'Trovoada',
    96: 'Trovoada com granizo leve',
    99: 'Trovoada com granizo intenso'
};
class OpenMeteoClient {
    constructor() {
        this.cache = null;
        this.ttlMs = 30 * 60 * 1000;
        this.numero = (valor) => {
            const numero = Number(valor);
            return Number.isFinite(numero) ? numero : 0;
        };
        this.limiarChuva = () => {
            const limite = Number(process.env.CLIMA_LIMIAR_CHUVA ?? 50);
            return Number.isFinite(limite) ? limite : 50;
        };
        this.previsaoDeAmanha = (dados) => {
            const diario = dados.daily;
            const datas = diario?.time;
            if (!diario || !datas || datas.length === 0)
                return null;
            const indice = datas.length > 1 ? 1 : 0;
            const codigo = this.numero(diario.weather_code?.[indice]);
            const probabilidade = this.numero(diario.precipitation_probability_max?.[indice]);
            const precipitacao = this.numero(diario.precipitation_sum?.[indice]);
            return {
                data: datas[indice],
                temperaturaMinC: this.numero(diario.temperature_2m_min?.[indice]),
                temperaturaMaxC: this.numero(diario.temperature_2m_max?.[indice]),
                probabilidadeChuva: probabilidade,
                precipitacaoMm: precipitacao,
                codigoClima: codigo,
                descricao: DESCRICOES[codigo] ?? 'Condição não identificada',
                vaiChover: probabilidade >= this.limiarChuva() || precipitacao > 0 || CODIGOS_CHUVA.has(codigo)
            };
        };
        this.buscar = async () => {
            if (this.cache && this.cache.expiraEm > Date.now())
                return this.cache.valor;
            const url = new URL('https://api.open-meteo.com/v1/forecast');
            url.searchParams.set('latitude', String(this.latitude));
            url.searchParams.set('longitude', String(this.longitude));
            url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');
            url.searchParams.set('timezone', 'America/Sao_Paulo');
            url.searchParams.set('forecast_days', '2');
            try {
                const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!resposta.ok) {
                    return { ok: false, mensagem: 'Não foi possível consultar a previsão do tempo no momento.' };
                }
                const dados = (await resposta.json());
                const previsao = this.previsaoDeAmanha(dados);
                if (!previsao)
                    return { ok: false, mensagem: 'A previsão do tempo não retornou dados para amanhã.' };
                const resultado = { ok: true, local: this.local, previsao };
                this.cache = { expiraEm: Date.now() + this.ttlMs, valor: resultado };
                return resultado;
            }
            catch {
                return {
                    ok: false,
                    mensagem: 'Não foi possível consultar a previsão do tempo. Verifique a conexão com a internet.'
                };
            }
        };
        const latitude = Number(process.env.CLIMA_LATITUDE ?? -22.5645);
        const longitude = Number(process.env.CLIMA_LONGITUDE ?? -47.4017);
        this.latitude = Number.isFinite(latitude) ? latitude : -22.5645;
        this.longitude = Number.isFinite(longitude) ? longitude : -47.4017;
        this.local = process.env.CLIMA_CIDADE ?? 'Limeira - SP';
    }
}
exports.OpenMeteoClient = OpenMeteoClient;
class ClimaIpc {
    constructor(sessao, cliente = new OpenMeteoClient()) {
        this.sessao = sessao;
        this.cliente = cliente;
        this.registrar = () => {
            electron_1.ipcMain.handle('clima:previsao', async () => {
                this.sessao.exigir(['admin', 'instrutor']);
                return this.cliente.buscar();
            });
        };
    }
}
exports.ClimaIpc = ClimaIpc;
