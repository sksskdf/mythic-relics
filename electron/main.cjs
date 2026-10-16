// 데스크톱(Electron) 창. 개발 중에는 Vite 개발 서버를, 빌드 뒤에는 dist/index.html을 띄운다.
const { app, BrowserWindow, Menu } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#0d0f14',
    title: 'MYTHIC RELICS',
    autoHideMenuBar: true,
    webPreferences: {
      // 게임은 웹 코드만 쓴다. Node 기능은 열지 않는다.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  Menu.setApplicationMenu(null)

  // 자동 점검: ELECTRON_SHOT=<파일.png> 이면 게임이 뜬 뒤 창을 찍어 저장하고 닫는다.
  const shot = process.env.ELECTRON_SHOT
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage()
        fs.writeFileSync(shot, image.toPNG())
        console.log(`창 캡처: ${shot} (${win.webContents.getTitle()})`)
        app.quit()
      }, 8000)
    })
  }

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    win.loadURL(devUrl)
    // 개발 중에는 F12로 개발자 도구를 연다.
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
