// ============================================================
// js/dataSource.js — 数据访问层
//
// 优先走 Node 服务器 (server.js) 的 API；无服务器时自动回退到直接 fetch。
// 这样同一套页面在 Live Server / file:// 和 `node server.js` 下都能工作。
//
// 用法：
//   const cfg  = await DataSource.loadConfig('曙光英雄');   // 自动含最新日期
//   const res  = await DataSource.saveToDisk('曙光英雄', 'xxx.json', data);
//   const list = await DataSource.listFiles('曙光英雄');      // 无服务器时返回 null
// ============================================================
"use strict";

const DataSource = (() => {
  let serverReady = null; // true / false / null(未探测)

  // 探测服务器是否可用（结果缓存，只探测一次）
  async function probe() {
    if (serverReady === null) {
      try {
        const r = await fetch("/api/games", { method: "HEAD" });
        serverReady = r.ok;
      } catch {
        serverReady = false;
      }
    }
    return serverReady;
  }

  async function fetchJSON(url, options) {
    const r = await fetch(url, options);
    if (!r.ok) throw new Error(r.status + " " + r.statusText);
    return r.json();
  }

  return {
    isServerReady: probe,

    // 读取游戏配置。日期类游戏由服务器自动扫出最新日期文件。
    // 服务器不可用 → 回退到直接读 {dir}/config.json。
    async loadConfig(dir) {
      if (await probe()) {
        try {
          return await fetchJSON("/api/" + encodeURIComponent(dir) + "/config");
        } catch (e) { /* 服务器在但接口异常 → 回退 */ }
      }
      return fetchJSON(dir + "/config.json");
    },

    // 保存到项目文件。
    // 返回 { ok:true, file, rows, size, mtime }  表示成功
    // 返回 { ok:false, error }                    表示服务器在但保存失败
    // 返回 null                                   表示服务器不可用（调用方自行回退）
    async saveToDisk(dir, file, data) {
      if (!(await probe())) return null;
      try {
        const r = await fetch("/api/" + encodeURIComponent(dir) + "/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ file, data })
        });
        const result = await r.json().catch(() => ({}));
        if (!r.ok || !result.ok) {
          return { ok: false, error: result.error || r.status + " " + r.statusText };
        }
        return result;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // 列出目录下可用数据文件（编辑器预设用）。服务器不可用时返回 null。
    async listFiles(dir) {
      if (!(await probe())) return null;
      try {
        return await fetchJSON("/api/" + encodeURIComponent(dir) + "/list");
      } catch {
        return null;
      }
    }
  };
})();
