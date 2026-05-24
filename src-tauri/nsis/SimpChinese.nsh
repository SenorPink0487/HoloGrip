; -----------------------------------------------------------------------------
; HoloMath 安装程序自定义中文文案
; 通过 tauri.conf.json -> bundle.windows.nsis.customLanguageFiles 引入。
; 这里保留 Tauri 默认的简体中文消息，并覆盖 NSIS Modern UI 自带的
; 欢迎/完成页面文字，让安装向导更贴合 HoloMath 自身的调性。
; -----------------------------------------------------------------------------

; --- Tauri 内置消息 ---------------------------------------------------------
LangString addOrReinstall ${LANG_SIMPCHINESE} "添加 / 重新安装组件"
LangString alreadyInstalled ${LANG_SIMPCHINESE} "已经安装"
LangString alreadyInstalledLong ${LANG_SIMPCHINESE} "${PRODUCTNAME} ${VERSION} 已经安装在你的电脑上。请选择下一步操作。"
LangString appRunning ${LANG_SIMPCHINESE} "{{product_name}} 正在运行，请关闭后再继续。"
LangString appRunningOkKill ${LANG_SIMPCHINESE} "{{product_name}} 正在运行！$\n点击「确定」结束当前进程。"
LangString chooseMaintenanceOption ${LANG_SIMPCHINESE} "选择要执行的维护操作。"
LangString choowHowToInstall ${LANG_SIMPCHINESE} "选择 ${PRODUCTNAME} 的安装方式。"
LangString createDesktop ${LANG_SIMPCHINESE} "在桌面上创建快捷方式"
LangString dontUninstall ${LANG_SIMPCHINESE} "保留当前版本"
LangString dontUninstallDowngrade ${LANG_SIMPCHINESE} "保留当前版本（已禁止跨版本降级）"
LangString failedToKillApp ${LANG_SIMPCHINESE} "无法结束 {{product_name}}，请手动关闭后再试。"
LangString installingWebview2 ${LANG_SIMPCHINESE} "正在准备 WebView2 运行时..."
LangString newerVersionInstalled ${LANG_SIMPCHINESE} "电脑上已安装了更新版本的 ${PRODUCTNAME}。我们建议保持当前版本，或在确认后先卸载它再安装。"
LangString older ${LANG_SIMPCHINESE} "较旧"
LangString olderOrUnknownVersionInstalled ${LANG_SIMPCHINESE} "检测到已安装版本 $R4 的 ${PRODUCTNAME}。建议先卸载旧版本再继续。"
LangString silentDowngrades ${LANG_SIMPCHINESE} "本安装程序禁止静默降级，请改用图形界面继续。$\n"
LangString unableToUninstall ${LANG_SIMPCHINESE} "卸载未能完成。"
LangString uninstallApp ${LANG_SIMPCHINESE} "卸载 ${PRODUCTNAME}"
LangString uninstallBeforeInstalling ${LANG_SIMPCHINESE} "先卸载再安装"
LangString unknown ${LANG_SIMPCHINESE} "未知"
LangString webview2AbortError ${LANG_SIMPCHINESE} "WebView2 安装失败。${PRODUCTNAME} 需要它才能启动，请稍后重试安装。"
LangString webview2DownloadError ${LANG_SIMPCHINESE} "无法下载 WebView2，错误码：$0"
LangString webview2DownloadSuccess ${LANG_SIMPCHINESE} "WebView2 引导程序已就绪"
LangString webview2Downloading ${LANG_SIMPCHINESE} "正在下载 WebView2 引导程序..."
LangString webview2InstallError ${LANG_SIMPCHINESE} "WebView2 安装失败，错误码：$1"
LangString webview2InstallSuccess ${LANG_SIMPCHINESE} "WebView2 安装完成"
LangString deleteAppData ${LANG_SIMPCHINESE} "同时删除应用数据"

; --- 覆盖 NSIS Modern UI 自带文案 -------------------------------------------
; 欢迎页
LangString MUI_TEXT_WELCOME_INFO_TITLE ${LANG_SIMPCHINESE} "欢迎安装 $(^NameDA)"
LangString MUI_TEXT_WELCOME_INFO_TEXT  ${LANG_SIMPCHINESE} "感谢选择 HoloMath。这里把数学搬进三维空间——空间手势、可视计算与 AI 助教随取随用。$\r$\n$\r$\n安装向导只需几步即可完成，整个过程在 1 分钟内结束，无需联网账号。$\r$\n$\r$\n建议先关闭其他正在运行的程序，再点击「下一步」开始。"

; 安装中页面
LangString MUI_TEXT_INSTALLING_TITLE   ${LANG_SIMPCHINESE} "正在部署 HoloMath"
LangString MUI_TEXT_INSTALLING_SUBTITLE ${LANG_SIMPCHINESE} "稍候片刻，正在把组件复制到你的设备。"

; 完成页
LangString MUI_TEXT_FINISH_TITLE       ${LANG_SIMPCHINESE} "全部就绪"
LangString MUI_TEXT_FINISH_SUBTITLE    ${LANG_SIMPCHINESE} "HoloMath 已经准备好开机了。"
LangString MUI_TEXT_FINISH_INFO_TITLE  ${LANG_SIMPCHINESE} "$(^NameDA) 安装完成"
LangString MUI_TEXT_FINISH_INFO_TEXT   ${LANG_SIMPCHINESE} "HoloMath 已成功安装到你的电脑上。$\r$\n$\r$\n你可以从开始菜单或桌面快捷方式启动它，也可以选择立即体验。$\r$\n$\r$\n点击「完成」关闭安装向导。"
LangString MUI_TEXT_FINISH_RUN         ${LANG_SIMPCHINESE} "立即启动 HoloMath(&R)"
LangString MUI_TEXT_FINISH_SHOWREADME  ${LANG_SIMPCHINESE} "在桌面上创建快捷方式(&M)"

; 目录选择页
LangString MUI_TEXT_DIRECTORY_TITLE    ${LANG_SIMPCHINESE} "选择安装位置"
LangString MUI_TEXT_DIRECTORY_SUBTITLE ${LANG_SIMPCHINESE} "请选择 HoloMath 的安装目录。"

; 卸载欢迎页
LangString MUI_UNTEXT_WELCOME_INFO_TITLE ${LANG_SIMPCHINESE} "卸载 $(^NameDA)"
LangString MUI_UNTEXT_WELCOME_INFO_TEXT  ${LANG_SIMPCHINESE} "本向导将协助你从电脑上移除 HoloMath。$\r$\n$\r$\n如需保留个人配置，请在确认页取消勾选「同时删除应用数据」。$\r$\n$\r$\n点击「下一步」继续。"
LangString MUI_UNTEXT_FINISH_TITLE       ${LANG_SIMPCHINESE} "卸载完成"
LangString MUI_UNTEXT_FINISH_SUBTITLE    ${LANG_SIMPCHINESE} "HoloMath 已经从你的电脑上移除。"
