"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JanelaApp = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
class JanelaApp {
    constructor(opcoes) {
        this.opcoes = opcoes;
        this.janela = null;
        this.abrir = () => {
            if (this.janela && !this.janela.isDestroyed()) {
                this.janela.focus();
                return;
            }
            const { pasta, nome, largura, altura, redimensionavel = true } = this.opcoes;
            const janela = new electron_1.BrowserWindow({
                width: largura,
                height: altura,
                resizable: redimensionavel,
                autoHideMenuBar: true,
                webPreferences: {
                    preload: path.join(__dirname, pasta, `${nome}.js`),
                    contextIsolation: true,
                    nodeIntegration: false
                }
            });
            janela.on('closed', () => {
                if (this.janela === janela)
                    this.janela = null;
            });
            janela.loadFile(path.join(__dirname, pasta, `${nome}.html`));
            this.janela = janela;
        };
        this.fechar = () => {
            if (this.janela && !this.janela.isDestroyed())
                this.janela.close();
        };
    }
}
exports.JanelaApp = JanelaApp;
