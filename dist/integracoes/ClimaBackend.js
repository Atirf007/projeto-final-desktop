"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClimaIpc = exports.OpenMeteoClient = void 0;
require("dotenv/config");
const electron_1 = require("electron");
/**
 * Modelos consultados em paralelo. A mediana entre eles evita que um único
 * modelo destoe da previsão (o ECMWF, por exemplo, costuma exagerar a
 * probabilidade de chuva na região de Limeira em comparação com o Google).
 */
const MODELOS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless'];
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
        this.limiarChuva = (valor) => {
            const numero = Number(valor);
            if (!Number.isFinite(numero))
                return 50;
            return Math.min(100, Math.max(0, Math.round(numero)));
        };
        this.mediana = (valores) => {
            if (valores.length === 0)
                return 0;
            const ordenado = [...valores].sort((a, b) => a - b);
            const meio = Math.floor(ordenado.length / 2);
            if (ordenado.length % 2 === 0)
                return (ordenado[meio - 1] + ordenado[meio]) / 2;
            return ordenado[meio];
        };
        /**
         * Lê o mesmo campo em todos os modelos. Quando a API devolve as chaves sem
         * sufixo (consulta de um modelo só), usa essa série como fallback.
         */
        this.series = (conjunto, campo, indice) => {
            const porModelo = MODELOS.map((modelo) => conjunto[`${campo}_${modelo}`]);
            const series = porModelo.some((serie) => Array.isArray(serie)) ? porModelo : [conjunto[campo]];
            return series
                .filter((serie) => Array.isArray(serie))
                .map((serie) => serie[indice])
                .filter((valor) => typeof valor === 'number' && Number.isFinite(valor));
        };
        /** Escolhe o código do tempo do modelo cuja probabilidade ficou mais perto da mediana. */
        this.codigoRepresentativo = (diario, indice, probabilidade) => {
            let melhor = null;
            for (const modelo of MODELOS) {
                const probabilidades = diario[`precipitation_probability_max_${modelo}`];
                const codigos = diario[`weather_code_${modelo}`];
                if (!Array.isArray(probabilidades) || !Array.isArray(codigos))
                    continue;
                const prob = probabilidades[indice];
                const codigo = codigos[indice];
                if (typeof prob !== 'number' || typeof codigo !== 'number')
                    continue;
                const distancia = Math.abs(prob - probabilidade);
                if (!melhor || distancia < melhor.distancia)
                    melhor = { distancia, codigo };
            }
            if (melhor)
                return melhor.codigo;
            const codigos = diario.weather_code;
            return Array.isArray(codigos) && typeof codigos[indice] === 'number' ? codigos[indice] : 0;
        };
        this.horasDaJanela = (horarios) => {
            const horas = new Set();
            for (const horario of horarios) {
                for (let hora = Math.max(0, horario.inicio); hora <= Math.min(23, horario.fim); hora++) {
                    horas.add(hora);
                }
            }
            return [...horas].sort((a, b) => a - b);
        };
        this.probabilidadeHoraria = (dados, indice) => {
            const horario = dados.hourly;
            if (!horario)
                return 0;
            const probabilidades = this.series(horario, 'precipitation_probability', indice);
            return probabilidades.length > 0 ? Math.round(this.mediana(probabilidades)) : 0;
        };
        this.picoDoDia = (dados, data) => {
            const tempos = dados.hourly?.time;
            if (!Array.isArray(tempos))
                return undefined;
            let melhor = { probabilidade: -1, horario: '' };
            tempos.forEach((tempo, indice) => {
                if (!String(tempo).startsWith(data))
                    return;
                const probabilidade = this.probabilidadeHoraria(dados, indice);
                if (probabilidade > melhor.probabilidade) {
                    melhor = { probabilidade, horario: String(tempo).slice(11, 16) };
                }
            });
            return melhor.probabilidade >= 0 ? melhor.horario : undefined;
        };
        this.probabilidadeNaJanela = (dados, data, horas) => {
            const tempos = dados.hourly?.time;
            if (!Array.isArray(tempos) || horas.length === 0)
                return 0;
            let maior = 0;
            for (const hora of horas) {
                const alvo = `${data}T${String(hora).padStart(2, '0')}:00`;
                const indice = tempos.indexOf(alvo);
                if (indice < 0)
                    continue;
                maior = Math.max(maior, this.probabilidadeHoraria(dados, indice));
            }
            return maior;
        };
        this.descreverJanela = (horarios) => {
            const inicio = Math.min(...horarios.map((horario) => horario.inicioMin));
            const fim = Math.max(...horarios.map((horario) => horario.fimMin));
            const formatar = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;
            return `${formatar(inicio)}–${formatar(fim)}`;
        };
        this.previsaoNoIndice = (dados, indice, limiar, horarios) => {
            const diario = dados.daily;
            const datas = diario?.time;
            if (!diario || !Array.isArray(datas) || datas.length <= indice)
                return null;
            const data = String(datas[indice]);
            const probabilidades = this.series(diario, 'precipitation_probability_max', indice);
            const probabilidadeDia = probabilidades.length > 0 ? Math.round(this.mediana(probabilidades)) : 0;
            const precipitacoes = this.series(diario, 'precipitation_sum', indice);
            const precipitacao = precipitacoes.length > 0 ? this.mediana(precipitacoes) : 0;
            const maximas = this.series(diario, 'temperature_2m_max', indice);
            const minimas = this.series(diario, 'temperature_2m_min', indice);
            const codigo = this.codigoRepresentativo(diario, indice, probabilidadeDia);
            const horas = horarios ? this.horasDaJanela(horarios) : [];
            const probabilidadeJanela = horas.length > 0 ? this.probabilidadeNaJanela(dados, data, horas) : 0;
            const probabilidade = horas.length > 0 ? probabilidadeJanela : probabilidadeDia;
            return {
                data,
                temperaturaMinC: minimas.length > 0 ? this.mediana(minimas) : 0,
                temperaturaMaxC: maximas.length > 0 ? this.mediana(maximas) : 0,
                probabilidadeChuva: probabilidade,
                probabilidadeDia,
                horarioPico: this.picoDoDia(dados, data),
                janela: horarios && horas.length > 0 ? this.descreverJanela(horarios) : undefined,
                precipitacaoMm: Number(precipitacao.toFixed(1)),
                codigoClima: codigo,
                descricao: DESCRICOES[codigo] ?? 'Condição não identificada',
                vaiChover: probabilidade >= limiar
            };
        };
        this.buscar = async (limiarChuva, horarios) => {
            const limiar = this.limiarChuva(limiarChuva);
            const chave = `${limiar}|${(horarios ?? [])
                .map((horario) => `${horario.inicioMin}-${horario.fimMin}`)
                .join(',')}`;
            if (this.cache && this.cache.expiraEm > Date.now() && this.cache.chave === chave) {
                return this.cache.valor;
            }
            const url = new URL('https://api.open-meteo.com/v1/forecast');
            url.searchParams.set('latitude', String(this.latitude));
            url.searchParams.set('longitude', String(this.longitude));
            url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');
            url.searchParams.set('hourly', 'precipitation_probability');
            url.searchParams.set('models', MODELOS.join(','));
            url.searchParams.set('timezone', 'America/Sao_Paulo');
            url.searchParams.set('forecast_days', '2');
            try {
                const resposta = await fetch(url, { signal: AbortSignal.timeout(8000) });
                if (!resposta.ok) {
                    return { ok: false, mensagem: 'Não foi possível consultar a previsão do tempo no momento.' };
                }
                const dados = (await resposta.json());
                const hoje = this.previsaoNoIndice(dados, 0, limiar);
                const previsao = this.previsaoNoIndice(dados, 1, limiar, horarios) ?? hoje;
                if (!previsao)
                    return { ok: false, mensagem: 'A previsão do tempo não retornou dados para amanhã.' };
                const resultado = {
                    ok: true,
                    local: this.local,
                    previsao,
                    hoje: hoje && hoje.data !== previsao.data ? hoje : undefined
                };
                this.cache = { expiraEm: Date.now() + this.ttlMs, chave, valor: resultado };
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
