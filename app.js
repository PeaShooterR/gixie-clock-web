const CMD = {
  CMD_GET: 0,
  CMD_SET: 1,
  CMDNUM_ALL_LIGHT_COLOR: 9,
  CMDNUM_DISPLAY_BRIGHTNESS: 14,
  CMDNUM_DISPLAY_STATUS: 15,
  CMDNUM_ADDR_TIMEZONE_SETTING: 16,
  CMDNUM_ADDR_GLASS_NUM: 17,
  CMDNUM_FANS_MODE: 18,
  CMDNUM_NTP_SERVER: 19,
  CMDNUM_ALARM_1: 183,
  CMDNUM_ALARM_2: 187,
  CMDNUM_ALARM_3: 191,
  CMDNUM_AUTO_SLEEP: 197,
  CMDNUM_YOUTUBE_KEY: 207,
  CMDNUM_YOUTUBE_CHANNEL: 208,
  CMDNUM_INSTAGRAM_NAME: 209,
  CMDNUM_BILIBILIID: 210,
  CMDNUM_DISPLAY_MODE: 211,
  CMDNUM_TIME_DISPLAY_MODE: 212,
  CMDNUM_WHOLE_HOUR_STATUS: 213,
  CMDNUM_COUNT_DOWN_MODE: 214,
  CMDNUM_MYWORLDLINE: 215
};

const I18N = {
  tabLight: "Light",
  tabAlarm: "Alarm",
  tabTimer: "Timer",
  tabSetting: "Settings",
  connectOk: "Connected",
  connectFail: "Connect failed",
  setOk: "Set success",
  setFail: "Set failed",
  reqFail: "Request failed"
};

const TAB_ICON_MAP = {
  light: "led",
  alarm: "alarm",
  timer: "timer",
  setting: "setting"
};

const DISPLAY_MODE_TEXT = [
  "Clock-Fixed Color",
  "Clock-Overall Rainbow",
  "Clock-Single Rainbow",
  "Number Flash",
  "WorldLine",
  "Custom Number",
  "Zero-One Random",
  "Fans Count"
];

const NTP_SERVERS = [
  "time.apple.com",
  "time1.cloud.tencent.com",
  "ntp.ntsc.ac.cn",
  "ntp.aliyun.com",
  "time.windows.com"
];

const TZ_LABELS = "WEST 12, WEST 11, WEST 10, WEST 9,WEST 8, WEST 7, WEST 6, WEST 5,WEST 4, WEST 3, WEST 2, WEST 1, GMT ,EAST 1, EAST 2, EAST 3, EAST 4,EAST 5, EAST 6, EAST 7, EAST 8,EAST 9, EAST 10, EAST 11, EAST 12".split(",");

const state = {
  selectedDevice: null,
  historyDevices: JSON.parse(localStorage.getItem("historyService") || "[]"),
  ws: null,
  connected: false,
  heartbeatTimer: null,
  heartbeatMiss: 0,
  pendingGet: new Map(),
  pendingSet: [],
  glassNum: 8,
  glassColors: [],
  timer: {
    running: false,
    suspended: false,
    total: 60,
    remain: 60,
    interval: null,
    timeout: null
  }
};

const el = {
  loginScreen: document.getElementById("login-screen"),
  mainScreen: document.getElementById("main-screen"),
  manualIp: document.getElementById("manual-ip"),
  manualPort: document.getElementById("manual-port"),
  historyList: document.getElementById("history-list"),
  connectBtn: document.getElementById("connect-btn"),
  deviceLabel: document.getElementById("device-label"),
  glassNum: document.getElementById("glass-num"),
  glassGrid: document.getElementById("glass-grid"),
  colorPicker: document.getElementById("color-picker"),
  setWhiteBtn: document.getElementById("set-white-btn"),
  brightness: document.getElementById("brightness"),
  brightnessInput: document.getElementById("brightness-input"),
  displayStatus: document.getElementById("display-status"),
  wholeHour: document.getElementById("whole-hour"),
  displayMode: document.getElementById("display-mode"),
  alarmList: document.getElementById("alarm-list"),
  timerH: document.getElementById("timer-h"),
  timerM: document.getElementById("timer-m"),
  timerS: document.getElementById("timer-s"),
  timerText: document.getElementById("timer-text"),
  timerProgress: document.getElementById("timer-progress"),
  timerStart: document.getElementById("timer-start"),
  timerSuspend: document.getElementById("timer-suspend"),
  timerStop: document.getElementById("timer-stop"),
  timezone: document.getElementById("timezone"),
  ntpServer: document.getElementById("ntp-server"),
  clearCache: document.getElementById("clear-cache"),
  tdm0: document.getElementById("tdm0"),
  tdm1: document.getElementById("tdm1"),
  tdm2: document.getElementById("tdm2"),
  tdmInterval: document.getElementById("tdm-interval"),
  saveTdm: document.getElementById("save-tdm"),
  worldlineGrid: document.getElementById("worldline-grid"),
  saveWorldline: document.getElementById("save-worldline"),
  autoSleepSwitch: document.getElementById("auto-sleep-switch"),
  autoSleepTime: document.getElementById("auto-sleep-time"),
  autoOpenTime: document.getElementById("auto-open-time"),
  saveAutoSleep: document.getElementById("save-auto-sleep"),
  fansMode: document.getElementById("fans-mode"),
  fansBili: document.getElementById("fans-bili"),
  fansYtChannel: document.getElementById("fans-yt-channel"),
  fansYtKey: document.getElementById("fans-yt-key"),
  fansIns: document.getElementById("fans-ins"),
  saveFans: document.getElementById("save-fans"),
  toast: document.getElementById("toast")
};

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.toast.classList.remove("show"), 1400);
}

function getText(key) {
  return I18N[key] || key;
}

function isIPv4(ip) {
  return /^(25[0-5]|2[0-4][0-9]|[01]?[0-9]?[0-9])(\.(25[0-5]|2[0-4][0-9]|[01]?[0-9]?[0-9])){3}$/.test(ip);
}

function pack(cmdType, cmdNum, cmdCtx) {
  const payload = { cmdType, cmdNum };
  if (cmdCtx !== undefined) payload.cmdCtx = cmdCtx;
  return JSON.stringify(payload);
}

function wsSendRaw(data) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    throw new Error("socket not open");
  }
  state.ws.send(data);
}

function wsSet(cmdNum, cmdCtx) {
  return new Promise((resolve, reject) => {
    try {
      wsSendRaw(pack(CMD.CMD_SET, cmdNum, cmdCtx));
      const timer = setTimeout(() => reject(new Error("set timeout")), 3500);
      state.pendingSet.push({ resolve, reject, timer });
    } catch (err) {
      reject(err);
    }
  });
}

function wsGet(cmdNum) {
  return new Promise((resolve, reject) => {
    try {
      wsSendRaw(pack(CMD.CMD_GET, cmdNum));
      const timer = setTimeout(() => {
        state.pendingGet.delete(cmdNum);
        reject(new Error("get timeout"));
      }, 3500);
      state.pendingGet.set(cmdNum, { resolve, reject, timer });
    } catch (err) {
      reject(err);
    }
  });
}

function clearPending() {
  state.pendingGet.forEach(({ reject, timer }) => {
    clearTimeout(timer);
    reject(new Error("disconnected"));
  });
  state.pendingGet.clear();

  while (state.pendingSet.length) {
    const item = state.pendingSet.shift();
    clearTimeout(item.timer);
    item.reject(new Error("disconnected"));
  }
}

function stopHeartbeat() {
  if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
  state.heartbeatTimer = null;
}

function startHeartbeat() {
  stopHeartbeat();
  state.heartbeatMiss = 0;
  state.heartbeatTimer = setInterval(() => {
    if (!state.connected) return;
    try {
      wsSendRaw("#");
      state.heartbeatMiss += 1;
      if (state.heartbeatMiss >= 5) {
        state.connected = false;
      }
    } catch (_err) {
      state.connected = false;
    }
  }, 2000);
}

function closeSocket() {
  stopHeartbeat();
  if (state.ws) {
    try { state.ws.close(); } catch (_err) {}
  }
  state.ws = null;
  state.connected = false;
  clearPending();
}

function connectSocket(ip, port) {
  return new Promise((resolve, reject) => {
    closeSocket();
    const ws = new WebSocket(`ws://${ip}:${port}`, ["arduino"]);
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_err) {}
      reject(new Error("connect timeout"));
    }, 4000);

    ws.onopen = () => {
      clearTimeout(timeout);
      state.ws = ws;
      state.connected = true;
      startHeartbeat();
      resolve();
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error("connect error"));
    };

    ws.onclose = () => {
      state.connected = false;
      stopHeartbeat();
    };

    ws.onmessage = (evt) => {
      const raw = evt.data;
      if (raw === "Connected" || raw === "Disconnected") return;
      if (raw === "Y") {
        state.connected = true;
        state.heartbeatMiss = 0;
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch (_err) {
        return;
      }

      if (msg.resCode !== 200) {
        toast(getText("setFail"));
        return;
      }

      if (msg.cmdType === CMD.CMD_SET) {
        const waiter = state.pendingSet.shift();
        if (waiter) {
          clearTimeout(waiter.timer);
          waiter.resolve(msg);
        }
        toast(getText("setOk"));
        return;
      }

      const waiter = state.pendingGet.get(msg.cmdNum);
      if (waiter) {
        clearTimeout(waiter.timer);
        state.pendingGet.delete(msg.cmdNum);
        waiter.resolve(msg.data);
      }

      applyIncomingData(msg.cmdNum, msg.data);
    };
  });
}

function saveHistory(device) {
  const list = state.historyDevices;
  if (!list.find((it) => it.ip === device.ip)) {
    list.push(device);
  }
  localStorage.setItem("historyService", JSON.stringify(list));
  renderDevices();
}

function pickDevice(device) {
  state.selectedDevice = device;
  el.manualIp.value = device.ip;
  el.manualPort.value = String(device.port || 81);
  renderDevices();
}

function renderDevices() {
  const activeIp = state.selectedDevice ? state.selectedDevice.ip : "";
  el.historyList.innerHTML = "";
  if (!state.historyDevices.length) {
    el.historyList.innerHTML = '<li>No history</li>';
  }

  state.historyDevices.forEach((d) => {
    const li = document.createElement("li");
    li.className = d.ip === activeIp ? "active" : "";
    li.textContent = `${d.serviceName} (${d.ip}:${d.port})`;
    li.onclick = () => pickDevice(d);
    el.historyList.appendChild(li);
  });
}

function clampBrightnessPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(100, Math.max(1, Math.round(num)));
}

function updateBrightnessFields(percent) {
  const safe = clampBrightnessPercent(percent);
  el.brightness.value = String(safe);
  if (el.brightnessInput) {
    el.brightnessInput.value = String(safe);
  }
  return safe;
}

async function sendBrightness(percent) {
  const safe = updateBrightnessFields(percent);
  const value = Math.max(1, Math.round((safe / 100) * 255));
  await wsSet(CMD.CMDNUM_DISPLAY_BRIGHTNESS, { value });
}

function updateTabIcons(activeTab) {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    const icon = TAB_ICON_MAP[btn.dataset.tab];
    if (!icon) return;
    const img = btn.querySelector("img");
    if (!img) return;
    const suffix = btn.dataset.tab === activeTab ? "_active" : "";
    img.src = `./static/tabs/${icon}${suffix}.png`;
  });
}

function tabSwitch(name) {
  document.querySelectorAll(".tab-pane").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  document.getElementById(`tab-${name}`).classList.add("active");
  document.querySelector(`.tab-btn[data-tab=\"${name}\"]`).classList.add("active");
  updateTabIcons(name);
}

function renderGlassGrid() {
  if (!state.glassColors.length) {
    state.glassColors = Array.from({ length: state.glassNum }).map((_, idx) => ({
      glassIdx: idx,
      isChecked: true,
      gRed: 226,
      gGreen: 88,
      gBlue: 41
    }));
  }
  el.glassNum.value = String(state.glassNum);
  el.glassGrid.innerHTML = "";
  state.glassColors.forEach((g, idx) => {
    const card = document.createElement("div");
    card.className = "glass";
    const tube = document.createElement("div");
    tube.className = "tube";
    tube.style.background = `rgb(${g.gRed},${g.gGreen},${g.gBlue})`;
    const toggleActive = () => {
      g.isChecked = !g.isChecked;
      card.classList.toggle("glass-active", g.isChecked);
    };
    card.classList.toggle("glass-active", g.isChecked);
    card.addEventListener("click", toggleActive);
    card.append(tube);
    el.glassGrid.appendChild(card);
  });
}

function getSelectedColorRGB() {
  const hex = el.colorPicker.value.replace("#", "");
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

async function applyLightColor(rgb) {
  state.glassColors.forEach((g) => {
    if (g.isChecked) {
      g.gRed = rgb.r;
      g.gGreen = rgb.g;
      g.gBlue = rgb.b;
    }
  });
  renderGlassGrid();
  const payload = state.glassColors.map((g) => ({ red: g.gRed, green: g.gGreen, blue: g.gBlue }));
  await wsSet(CMD.CMDNUM_ALL_LIGHT_COLOR, payload);
}

function timerFormat(sec) {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function updateTimerUI() {
  el.timerText.textContent = timerFormat(state.timer.remain);
  const percent = state.timer.total > 0 ? Math.max(0, (state.timer.remain / state.timer.total) * 100) : 100;
  el.timerProgress.style.width = `${percent}%`;
}

async function timerSend(status) {
  const remain = state.timer.remain;
  const payload = {
    hour: Math.floor(remain / 3600),
    min: Math.floor((remain % 3600) / 60),
    sec: remain % 60,
    status
  };
  await wsSet(CMD.CMDNUM_COUNT_DOWN_MODE, payload);
}

function startLocalTimer() {
  clearInterval(state.timer.interval);
  state.timer.interval = setInterval(() => {
    if (state.timer.remain <= 0) {
      clearInterval(state.timer.interval);
      state.timer.running = false;
      state.timer.suspended = false;
      toast("Time's up");
      setTimeout(() => {}, 50);
      return;
    }
    state.timer.remain -= 1;
    updateTimerUI();
  }, 1000);
}

function initSelects() {
  el.displayMode.innerHTML = DISPLAY_MODE_TEXT.map((name, idx) => `<option value="${idx}">${idx + 1}. ${name}</option>`).join("");
  el.timezone.innerHTML = TZ_LABELS.map((name, idx) => `<option value="${idx}">${name.trim()}</option>`).join("");
  el.ntpServer.innerHTML = NTP_SERVERS.map((name, idx) => `<option value="${idx}">${name}</option>`).join("");

  el.worldlineGrid.innerHTML = "";
  for (let i = 0; i < 8; i += 1) {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 8;
    input.placeholder = `Group ${i + 1}: 8 digits`;
    input.id = `worldline-${i}`;
    el.worldlineGrid.appendChild(input);
  }
}

function updateTabTexts() {
  const btns = document.querySelectorAll(".tab-btn span");
  if (btns[0]) btns[0].textContent = I18N.tabLight;
  if (btns[1]) btns[1].textContent = I18N.tabAlarm;
  if (btns[2]) btns[2].textContent = I18N.tabTimer;
  if (btns[3]) btns[3].textContent = I18N.tabSetting;
}

async function fetchLightData() {
  const [glassNum, colors, brightness, wholeHour, displayStatus, displayMode] = await Promise.all([
    wsGet(CMD.CMDNUM_ADDR_GLASS_NUM),
    wsGet(CMD.CMDNUM_ALL_LIGHT_COLOR),
    wsGet(CMD.CMDNUM_DISPLAY_BRIGHTNESS),
    wsGet(CMD.CMDNUM_WHOLE_HOUR_STATUS),
    wsGet(CMD.CMDNUM_DISPLAY_STATUS),
    wsGet(CMD.CMDNUM_DISPLAY_MODE)
  ]);

  state.glassNum = Number(glassNum || state.glassNum);
  if (Array.isArray(colors)) {
    state.glassColors = colors.map((c, idx) => ({
      glassIdx: idx,
      isChecked: true,
      gRed: Number(c.red || 0),
      gGreen: Number(c.green || 0),
      gBlue: Number(c.blue || 0)
    }));
  }
  const brightnessPercent = Math.max(1, Math.round((Number(brightness) / 255) * 100) || 1);
  updateBrightnessFields(brightnessPercent);
  el.wholeHour.checked = !!wholeHour;
  el.displayStatus.checked = !!displayStatus;
  el.displayMode.value = String(Number(displayMode || 0));
  renderGlassGrid();
}

async function fetchAlarmData() {
  const [a1, a2, a3] = await Promise.all([
    wsGet(CMD.CMDNUM_ALARM_1),
    wsGet(CMD.CMDNUM_ALARM_2),
    wsGet(CMD.CMDNUM_ALARM_3)
  ]);

  const alarms = [a1, a2, a3].map((a, idx) => ({
    idx,
    hour: Number(a && a.hour != null ? a.hour : 7),
    min: Number(a && a.min != null ? a.min : 0),
    status: !!(a && a.status)
  }));

  el.alarmList.innerHTML = "";
  alarms.forEach((a) => {
    const wrap = document.createElement("div");
    wrap.className = "alarm-item";

    const title = document.createElement("div");
    title.textContent = `Alarm ${a.idx + 1}`;

    const time = document.createElement("input");
    time.type = "time";
    time.value = `${String(a.hour).padStart(2, "0")}:${String(a.min).padStart(2, "0")}`;
    time.onchange = async () => {
      const [h, m] = time.value.split(":").map(Number);
      await wsSet([CMD.CMDNUM_ALARM_1, CMD.CMDNUM_ALARM_2, CMD.CMDNUM_ALARM_3][a.idx], {
        hour: h,
        min: m,
        status: toggle.checked ? 1 : 0
      });
    };

    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = a.status;
    toggle.onchange = async () => {
      await wsSet([182, 186, 190][a.idx], { value: toggle.checked ? 1 : 0 });
    };

    wrap.append(title, time, toggle);
    el.alarmList.appendChild(wrap);
  });
}

async function fetchSettingData() {
  const [timezone, ntp, tdm, worldline, autoSleep, fansMode, bili, ytC, ytK, ins] = await Promise.all([
    wsGet(CMD.CMDNUM_ADDR_TIMEZONE_SETTING),
    wsGet(CMD.CMDNUM_NTP_SERVER),
    wsGet(CMD.CMDNUM_TIME_DISPLAY_MODE),
    wsGet(CMD.CMDNUM_MYWORLDLINE),
    wsGet(CMD.CMDNUM_AUTO_SLEEP),
    wsGet(CMD.CMDNUM_FANS_MODE),
    wsGet(CMD.CMDNUM_BILIBILIID),
    wsGet(CMD.CMDNUM_YOUTUBE_CHANNEL),
    wsGet(CMD.CMDNUM_YOUTUBE_KEY),
    wsGet(CMD.CMDNUM_INSTAGRAM_NAME)
  ]);

  el.timezone.value = String(Number(timezone || 0));
  el.ntpServer.value = String(Number(ntp || 0));

  if (tdm && typeof tdm === "object") {
    el.tdm0.checked = !!tdm.tdm0;
    el.tdm1.checked = !!tdm.tdm1;
    el.tdm2.checked = !!tdm.tdm2;
    el.tdmInterval.value = String(Number(tdm.interval || 0));
  }

  if (Array.isArray(worldline)) {
    for (let i = 0; i < 8; i += 1) {
      const seg = worldline.slice(i * 8, i * 8 + 8).join("");
      const input = document.getElementById(`worldline-${i}`);
      if (input) input.value = seg;
    }
  }

  if (autoSleep && typeof autoSleep === "object") {
    el.autoSleepSwitch.checked = !!autoSleep.status;
    el.autoSleepTime.value = `${String(autoSleep.sleepHour || 0).padStart(2, "0")}:${String(autoSleep.sleepMin || 0).padStart(2, "0")}`;
    el.autoOpenTime.value = `${String(autoSleep.openHour || 0).padStart(2, "0")}:${String(autoSleep.openMin || 0).padStart(2, "0")}`;
  }

  el.fansMode.value = String(Number(fansMode || 0));
  el.fansBili.value = (bili || "").toString();
  el.fansYtChannel.value = (ytC || "").toString();
  el.fansYtKey.value = (ytK || "").toString();
  el.fansIns.value = (ins || "").toString();
}

function applyIncomingData(cmdNum, data) {
  switch (cmdNum) {
    case CMD.CMDNUM_DISPLAY_BRIGHTNESS:
      updateBrightnessFields(Math.max(1, Math.round((Number(data) / 255) * 100) || 1));
      break;
    case CMD.CMDNUM_DISPLAY_STATUS:
      el.displayStatus.checked = !!data;
      break;
    case CMD.CMDNUM_WHOLE_HOUR_STATUS:
      el.wholeHour.checked = !!data;
      break;
    case CMD.CMDNUM_DISPLAY_MODE:
      el.displayMode.value = String(Number(data || 0));
      break;
    default:
      break;
  }
}

async function refreshAll() {
  await fetchLightData();
  await fetchAlarmData();
  await fetchSettingData();
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => tabSwitch(btn.dataset.tab));
  });

  el.connectBtn.onclick = async () => {
    const ip = el.manualIp.value.trim();
    const port = Number(el.manualPort.value || 81);
    if (!isIPv4(ip)) {
      toast("Invalid IP address");
      return;
    }

    const device = {
      serviceName: state.selectedDevice ? state.selectedDevice.serviceName : `manual_device_${Date.now().toString().slice(-6)}`,
      ip,
      port
    };

    try {
      await connectSocket(ip, port);
      state.selectedDevice = device;
      localStorage.setItem("wsIp", ip);
      localStorage.setItem("wsPort", String(port));
      localStorage.setItem("wsServiceName", device.serviceName);
      saveHistory(device);

      el.deviceLabel.textContent = `${device.serviceName} (${ip}:${port})`;
      el.loginScreen.classList.remove("active");
      el.mainScreen.classList.add("active");

      await refreshAll();
      toast(getText("connectOk"));
    } catch (_err) {
      toast(getText("connectFail"));
    }
  };

  el.colorPicker.onchange = async () => {
    const rgb = getSelectedColorRGB();
    try {
      await applyLightColor(rgb);
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.setWhiteBtn.onclick = async () => {
    try {
      await applyLightColor({ r: 255, g: 255, b: 255 });
      el.colorPicker.value = "#ffffff";
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.brightness.addEventListener("input", () => {
    updateBrightnessFields(el.brightness.value);
  });

  el.brightness.addEventListener("change", async () => {
    try {
      await sendBrightness(el.brightness.value);
    } catch (_err) {
      toast(getText("setFail"));
    }
  });

  if (el.brightnessInput) {
    el.brightnessInput.addEventListener("input", () => {
      if (el.brightnessInput.value === "") return;
      updateBrightnessFields(el.brightnessInput.value);
    });

    el.brightnessInput.addEventListener("change", async () => {
      try {
        await sendBrightness(el.brightnessInput.value);
      } catch (_err) {
        toast(getText("setFail"));
      }
    });
  }

  el.displayStatus.onchange = async () => {
    try {
      await wsSet(CMD.CMDNUM_DISPLAY_STATUS, { value: el.displayStatus.checked ? 1 : 0 });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.wholeHour.onchange = async () => {
    try {
      await wsSet(CMD.CMDNUM_WHOLE_HOUR_STATUS, { value: el.wholeHour.checked ? 1 : 0 });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.displayMode.onchange = async () => {
    try {
      await wsSet(CMD.CMDNUM_DISPLAY_MODE, { value: Number(el.displayMode.value) });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.timerStart.onclick = async () => {
    const h = Number(el.timerH.value || 0);
    const m = Number(el.timerM.value || 0);
    const s = Number(el.timerS.value || 0);
    const total = h * 3600 + m * 60 + s;
    if (total <= 0) {
      toast("Set at least 1 second");
      return;
    }

    state.timer.total = total;
    state.timer.remain = total;
    state.timer.running = true;
    state.timer.suspended = false;
    updateTimerUI();
    startLocalTimer();

    try {
      await timerSend(1);
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.timerSuspend.onclick = async () => {
    if (!state.timer.running) return;
    state.timer.suspended = !state.timer.suspended;
    if (state.timer.suspended) {
      clearInterval(state.timer.interval);
      try {
        await wsSet(CMD.CMDNUM_COUNT_DOWN_MODE, { hour: 0, min: 0, sec: 0, status: 0 });
      } catch (_err) {
        toast(getText("setFail"));
      }
    } else {
      startLocalTimer();
      try {
        await timerSend(1);
      } catch (_err) {
        toast(getText("setFail"));
      }
    }
  };

  el.timerStop.onclick = async () => {
    clearInterval(state.timer.interval);
    state.timer.running = false;
    state.timer.suspended = false;
    state.timer.remain = 0;
    updateTimerUI();
    try {
      await wsSet(CMD.CMDNUM_COUNT_DOWN_MODE, { hour: 0, min: 0, sec: 0, status: 0 });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.timezone.onchange = async () => {
    try {
      await wsSet(CMD.CMDNUM_ADDR_TIMEZONE_SETTING, { value: Number(el.timezone.value) });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.ntpServer.onchange = async () => {
    try {
      await wsSet(CMD.CMDNUM_NTP_SERVER, { value: Number(el.ntpServer.value) });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.clearCache.onclick = () => {
    const wsIp = localStorage.getItem("wsIp");
    const wsPort = localStorage.getItem("wsPort");
    const wsServiceName = localStorage.getItem("wsServiceName");
    localStorage.clear();
    if (wsIp) localStorage.setItem("wsIp", wsIp);
    if (wsPort) localStorage.setItem("wsPort", wsPort);
    if (wsServiceName) localStorage.setItem("wsServiceName", wsServiceName);
    state.historyDevices = [];
    renderDevices();
    toast("Cache cleared");
  };

  el.saveTdm.onclick = async () => {
    try {
      await wsSet(CMD.CMDNUM_TIME_DISPLAY_MODE, {
        tdm0: el.tdm0.checked ? 1 : 0,
        tdm1: el.tdm1.checked ? 1 : 0,
        tdm2: el.tdm2.checked ? 1 : 0,
        interval: Number(el.tdmInterval.value)
      });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.saveWorldline.onclick = async () => {
    const all = [];
    for (let i = 0; i < 8; i += 1) {
      const input = document.getElementById(`worldline-${i}`);
      const val = (input.value || "").replace(/\D/g, "").padEnd(8, "0").slice(0, 8);
      input.value = val;
      val.split("").forEach((d) => all.push(Number(d)));
    }

    try {
      await wsSet(CMD.CMDNUM_MYWORLDLINE, all);
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.saveAutoSleep.onclick = async () => {
    const [sleepHour, sleepMin] = el.autoSleepTime.value.split(":").map(Number);
    const [openHour, openMin] = el.autoOpenTime.value.split(":").map(Number);

    try {
      await wsSet(CMD.CMDNUM_AUTO_SLEEP, {
        sleepHour,
        sleepMin,
        openHour,
        openMin,
        status: el.autoSleepSwitch.checked ? 1 : 0
      });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };

  el.saveFans.onclick = async () => {
    try {
      const mode = Number(el.fansMode.value);
      if (mode === 1) {
        await wsSet(CMD.CMDNUM_BILIBILIID, { value: el.fansBili.value.trim() });
      }
      if (mode === 2) {
        await wsSet(CMD.CMDNUM_YOUTUBE_CHANNEL, { value: el.fansYtChannel.value.trim() });
        await wsSet(CMD.CMDNUM_YOUTUBE_KEY, { value: el.fansYtKey.value.trim() });
      }
      if (mode === 3) {
        await wsSet(CMD.CMDNUM_INSTAGRAM_NAME, { value: el.fansIns.value.trim() });
      }
      await wsSet(CMD.CMDNUM_FANS_MODE, { value: mode });
    } catch (_err) {
      toast(getText("setFail"));
    }
  };
}

function boot() {
  initSelects();
  bindEvents();
  renderDevices();
  updateTabTexts();
  const initialTab = document.querySelector(".tab-btn.active");
  if (initialTab) {
    updateTabIcons(initialTab.dataset.tab);
  }

  const savedIp = localStorage.getItem("wsIp") || "";
  const savedPort = localStorage.getItem("wsPort") || "81";
  if (savedIp) el.manualIp.value = savedIp;
  el.manualPort.value = savedPort;

  const initTimer = Number(el.timerH.value || 0) * 3600 + Number(el.timerM.value || 1) * 60 + Number(el.timerS.value || 0);
  state.timer.total = initTimer;
  state.timer.remain = initTimer;
  updateTimerUI();
}

boot();
