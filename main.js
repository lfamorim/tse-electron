const path = require('path');
const cheerio = require('cheerio');

// Bright Data residential proxy credentials
const PROXY_HOST = 'brd.superproxy.io';
const PROXY_PORT = '33335';
const PROXY_USER = 'brd-customer-hl_99fbee3a-zone-static';
const PROXY_PASS = '0pe63i6l8jkz';

// Set environment variables for proxy
process.env.HTTP_PROXY = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
process.env.HTTPS_PROXY = `http://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;

// Only require electron in electron environment
let electron;
if (process.versions.electron) {
  electron = require('electron');
  // Configure proxy before anything else
  electron.app.commandLine.appendSwitch('proxy-server', `${PROXY_HOST}:${PROXY_PORT}`);
  electron.app.commandLine.appendSwitch('proxy-bypass-list', '<local>');
}

class CaptchaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaptchaError';
    this.type = 'CaptchaError';
  }
}

function parseVotingLocation(html, tituloEleitor) {
  const $ = cheerio.load(html);
  const result = {};

  // Map labels to keys for standardization
  const labelMap = {
    'Local de votação': 'localvotacao',
    'Endereço': 'endereco',
    'Município/UF': 'municipioUF',
    'Bairro': 'bairro',
    'Seção': 'secao',
    'País': 'pais',
    'Zona': 'zona'
  };

  // Extract data from each data-box
  $('.data-box').each((i, el) => {
    const label = $(el).find('.label').text().trim();
    const desc = $(el).find('.desc').text().trim();

    // Get standardized key from map
    const key = labelMap[label];
    if (key) {
      result[key] = desc;
    }
  });

  // Extract coordinates from map link if present
  const mapLink = $('a[href*="maps.google.com"]').attr('href');
  if (mapLink) {
    const coords = mapLink.match(/q=([\-0-9.]+),([\-0-9.]+)/);
    if (coords) {
      result.coordinates = {
        latitude: parseFloat(coords[1]),
        longitude: parseFloat(coords[2])
      };
    }
  }

  if (result.municipioUF) {
    const [municipio, uf] = result.municipioUF.split('/');
    result.municipio = municipio.trim();
    result.uf = uf.trim();
  }

  return {
    success: true,
    data: {
      ...result,
      tituloEleitor,
      timestamp: new Date().toISOString()
    }
  };
}

let proxyConfigured = false;
async function queryTSE({
  inscricaoNome = 'LUCAS FERNANDO VASCONCELOS DE ARRUDA AMORIM',
  nomeMae = 'FILOMENA VASCONCELOS DE ARRUDA',
  dataNascimento = '08/06/1990',
  userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  resolution = { width: 1920, height: 1080 },
  language = 'pt-BR',
  signal
} = {}) {
  const { app, BrowserWindow, session } = electron;

  // Create a new session
  const ses = session.fromPartition('persist:webviewsession');

  // Set up session-level proxy auth
  ses.setProxy({
    mode: 'fixed_servers',
    proxyRules: `http://${PROXY_HOST}:${PROXY_PORT}`,
    proxyBypassRules: '<local>'
  });

  // Add proxy auth handler
  app.on('login', (event, webContents, request, authInfo, callback) => {
    if (authInfo.isProxy && !proxyConfigured) {
      proxyConfigured = true;
      event.preventDefault();
      callback(PROXY_USER, PROXY_PASS);
    }
  });

  // Create the window
  let mainWindow = new BrowserWindow({
    width: resolution.width,
    height: resolution.height,
    show: true,
    webPreferences: {
      session: ses,
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [
        `--localvotacao=${JSON.stringify({
          inscricaoNome,
          nomeMae,
          dataNascimento
        })}`
      ]
    }
  });

  // Prevent window from closing the app
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent app from closing when all windows are closed
  app.on('window-all-closed', () => { });

  try {
    // Set user agent and language
    mainWindow.webContents.setUserAgent(userAgent);
    mainWindow.webContents.session.setSpellCheckerLanguages([language]);
    mainWindow.webContents.session.setPreloads([path.join(__dirname, 'preload.js')]);

    // Open the DevTools automatically
    mainWindow.webContents.openDevTools();

    // Load the URL first
    await mainWindow.webContents.loadURL('https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/consultar-numero-titulo-eleitor');

    // Wait for content to load
    return await waitUntilContent(mainWindow, 15000, signal);
  } finally {
    mainWindow.destroy();
  }
}

async function waitUntilContent(mainWindow, timeout = 15000, signal) {
  do {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }
    const content = await extractContent(mainWindow);

    if (content.localvotacao && content.tituloEleitor) {
      return parseVotingLocation(content.localvotacao, content.tituloEleitor);
    }

    if (content.modalConfirmacao) {
      throw new Error('Não foi possível localizar o local de votação');
    }

    if (content.invalidCaptcha) {
      throw new CaptchaError('Captcha inválido');
    }

    if (content.modalAuth) {
      throw new Error('Autenticação necessária');
    }

    if (content.invalidData) {
      throw new Error('Dados inválidos');
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    timeout -= 500;
  } while (timeout > 0);

  throw new CaptchaError('Timeout exceeded');
}

async function extractContent(mainWindow) {
  const content = await mainWindow.webContents.executeJavaScript(`
  (function() {
    const boxLocal = document.querySelector('app-box-local-votacao');
    const modalConfirmacao = document.querySelector('app-modal-confirmacao');
    const invalidCaptcha = Array.from(document.querySelectorAll('p')).find(p => p.textContent.includes('Captcha invalido'));
    const invalidData = Array.from(document.querySelectorAll('span')).find(p => p.textContent.includes('Autenticação realizada mas nível'));

    return {
      'tituloEleitor': Array.from(document.querySelectorAll('p'))
        .find(x => x.textContent.includes('Título'))
        ?.getElementsByTagName('b')
        ?.item(0)
        ?.textContent
        ?.replace(/\.$/, ''),
      'localvotacao': boxLocal ? boxLocal.outerHTML : null,
      'modalConfirmacao': modalConfirmacao ? modalConfirmacao.outerHTML : null,
      'invalidCaptcha': invalidCaptcha ? invalidCaptcha.outerHTML : null,
      'invalidData': invalidData ? invalidData.outerHTML : null
    };
  })()`);
  return content;
}

// Export for use in server
module.exports = { queryTSE, CaptchaError };
