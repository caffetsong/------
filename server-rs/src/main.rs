use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path as FsPath, PathBuf},
    sync::{Arc, Mutex},
};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Connection>>,
    root: PathBuf,
    data_dir: PathBuf,
    intro: PathBuf,
    prepare_data: PathBuf,
    blacklist: PathBuf,
    legacy_base: String,
}

#[derive(Debug)]
struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self { status, message: message.into() }
    }
    fn internal(message: impl Into<String>) -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, message)
    }
    fn not_found(message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(json!({ "error": self.message }))).into_response()
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        Self::internal(format!("SQLite: {e}"))
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        Self::internal(format!("JSON: {e}"))
    }
}
impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        Self::internal(format!("IO: {e}"))
    }
}

fn read_json(path: &FsPath) -> Result<Value, ApiError> {
    let text = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

fn read_intro(state: &AppState) -> Result<Vec<Value>, ApiError> {
    let path = &state.intro;
    if !path.exists() {
        return Ok(Vec::new());
    }
    match read_json(&path)? {
        Value::Array(items) => Ok(items),
        _ => Ok(Vec::new()),
    }
}

fn string_list(value: Option<&Value>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    if let Some(items) = value.and_then(Value::as_array) {
        for item in items {
            if let Some(text) = item.as_str() {
                let text = text.trim().to_string();
                if !text.is_empty() && seen.insert(text.clone()) {
                    out.push(text);
                }
            }
        }
    }
    out
}

fn profile_json(entry: &Value) -> Value {
    json!({
        "name": entry.get("name").and_then(Value::as_str).unwrap_or(""),
        "lanes": string_list(entry.get("常用分路")),
        "players": string_list(entry.get("擅长选手"))
    })
}

fn normalize_uid(value: &str) -> String {
    value.trim().trim_matches('"').trim_matches('\'').trim().to_string()
}

fn normalize_uids(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for value in values {
        let uid = normalize_uid(&value);
        if uid.is_empty() || uid.starts_with('#') || !seen.insert(uid.clone()) {
            continue;
        }
        out.push(uid);
    }
    out
}

#[derive(Clone, Serialize)]
struct BlacklistEntry {
    uid: String,
    reason: String,
}

fn entry_from_value(value: &Value) -> Option<BlacklistEntry> {
    if let Some(uid) = value.as_str() {
        return Some(BlacklistEntry { uid: normalize_uid(uid), reason: String::new() });
    }
    let uid = value.get("uid").and_then(Value::as_str)?;
    Some(BlacklistEntry {
        uid: normalize_uid(uid),
        reason: value.get("reason").and_then(Value::as_str).unwrap_or("").trim().to_string(),
    })
}

fn normalize_entries(entries: impl IntoIterator<Item = BlacklistEntry>) -> Vec<BlacklistEntry> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for entry in entries {
        if entry.uid.is_empty() || entry.uid.starts_with('#') || !seen.insert(entry.uid.clone()) {
            continue;
        }
        out.push(entry);
    }
    out
}

fn read_blacklist(state: &AppState) -> Result<(Vec<BlacklistEntry>, HashSet<String>), ApiError> {
    if !state.blacklist.exists() {
        return Ok((Vec::new(), HashSet::new()));
    }
    let raw = read_json(&state.blacklist)?;
    let entries: Vec<BlacklistEntry> = if let Some(items) = raw.get("entries").and_then(Value::as_array) {
        items.iter().filter_map(entry_from_value).collect()
    } else if let Some(items) = raw.get("uids").and_then(Value::as_array) {
        items.iter().filter_map(entry_from_value).collect()
    } else if let Some(items) = raw.as_array() {
        items.iter().filter_map(entry_from_value).collect()
    } else {
        Vec::new()
    };
    let entries = normalize_entries(entries);
    let set = entries.iter().map(|entry| entry.uid.clone()).collect();
    Ok((entries, set))
}

#[derive(Default)]
struct Derived {
    rank_count: i64,
    top1: Option<i64>,
    top9: Option<i64>,
    top50: Option<i64>,
    top100: Option<i64>,
    median: Option<i64>,
}

fn derived(power: &[i64]) -> Derived {
    let n = power.len();
    let at = |i: usize| power.get(i).copied();
    let median = if n == 0 {
        None
    } else if n % 2 == 1 {
        at(n / 2)
    } else {
        Some(((power[n / 2 - 1] + power[n / 2]) as f64 / 2.0).round() as i64)
    };
    Derived {
        rank_count: n as i64,
        top1: at(0),
        top9: at(8),
        top50: at(49),
        top100: at(99),
        median,
    }
}

struct HeroStat {
    name: String,
    appearance_rank: Option<i64>,
    win_rate: Option<f64>,
}

struct RankRow {
    hero: String,
    power: i64,
    uid: Option<String>,
    player: Option<String>,
}

fn blacklist_names(conn: &Connection, blacklist: &HashSet<String>) -> Result<HashSet<String>, ApiError> {
    let mut names = HashSet::new();
    if blacklist.is_empty() {
        return Ok(names);
    }
    let ids: Vec<&String> = blacklist.iter().collect();
    let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT DISTINCT rp.player FROM rank_power rp WHERE rp.uid IN ({placeholders}) AND rp.player IS NOT NULL AND rp.player <> ''"
    ))?;
    let rows = stmt.query_map(params_from_iter(ids.iter()), |r| r.get::<_, String>(0))?;
    for row in rows {
        names.insert(row?);
    }
    Ok(names)
}

fn get_period_full(
    conn: &Connection,
    date: &str,
    blacklist: &HashSet<String>,
    blacklist_names: &HashSet<String>,
) -> Result<Option<Value>, ApiError> {
    let period = conn
        .query_row(
            "SELECT id, captured_at, source, hero_count, row_count, has_power FROM periods WHERE date = ?1",
            [date],
            |r| Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, i64>(5)?,
            )),
        )
        .optional()?;
    let Some((period_id, captured_at, source, hero_count, raw_row_count, has_power)) = period else {
        return Ok(None);
    };

    let mut stat_stmt = conn.prepare(
        "SELECT h.name, hs.appearance_rank, hs.win_rate
         FROM hero_stats hs JOIN heroes h ON h.id = hs.hero_id
         WHERE hs.period_id = ?1
         ORDER BY CASE WHEN hs.appearance_rank IS NULL THEN 1 ELSE 0 END,
                  hs.appearance_rank, h.name",
    )?;
    let stats = stat_stmt
        .query_map([period_id], |r| {
            Ok(HeroStat {
                name: r.get(0)?,
                appearance_rank: r.get(1)?,
                win_rate: r.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut rank_stmt = conn.prepare(
        "SELECT h.name, rp.power, rp.uid, rp.player
         FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
         WHERE rp.period_id = ?1
         ORDER BY h.name, rp.\"rank\"",
    )?;
    let ranks = rank_stmt
        .query_map([period_id], |r| {
            Ok(RankRow {
                hero: r.get(0)?,
                power: r.get(1)?,
                uid: r.get(2)?,
                player: r.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut by_hero: HashMap<String, Vec<RankRow>> = HashMap::new();
    for row in ranks {
        by_hero.entry(row.hero.clone()).or_default().push(row);
    }

    let mut kept_total = 0i64;
    let mut heroes = Vec::with_capacity(stats.len());
    for stat in stats {
        let all = by_hero.remove(&stat.name).unwrap_or_default();
        let kept: Vec<RankRow> = all
            .into_iter()
            .filter(|row| {
                let uid = row.uid.as_deref().unwrap_or("").trim();
                if !uid.is_empty() {
                    return !blacklist.contains(uid);
                }
                row.player
                    .as_deref()
                    .map(|player| !blacklist_names.contains(player))
                    .unwrap_or(true)
            })
            .collect();
        let power: Vec<i64> = kept.iter().map(|row| row.power).collect();
        let d = derived(&power);
        kept_total += d.rank_count;

        heroes.push(json!({
            "name": stat.name,
            "appearanceRank": stat.appearance_rank,
            "winRate": stat.win_rate,
            "rankCount": d.rank_count,
            "hasPower": d.rank_count > 0,
            "powerTop1": d.top1,
            "powerTop9": d.top9,
            "powerTop50": d.top50,
            "powerTop100": d.top100,
            "powerMedian": d.median,
            "legacyGuo9": d.top9.or(d.top1),
            "power": power
        }));
    }

    // Recompute removed rows accurately: raw row count - kept row count.
    let removed_total = raw_row_count - kept_total;

    Ok(Some(json!({
        "date": date,
        "capturedAt": captured_at,
        "source": source,
        "heroCount": if hero_count > 0 { hero_count } else { heroes.len() as i64 },
        "rowCount": kept_total,
        "rawRowCount": raw_row_count,
        "blacklistRemoved": removed_total,
        "blacklistCount": blacklist.len(),
        "hasPower": has_power != 0,
        "heroes": heroes
    })))
}

async fn api_index() -> Json<Value> {
    Json(json!({
        "endpoints": ["/api/config", "/api/periods", "/api/periods/:date",
                      "/api/heroes/:name/history", "/api/heroes/:name/profile",
                      "/api/profiles", "/api/players/lookup", "/api/blacklist"]
    }))
}

async fn config(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let mut cfg = read_json(&state.root.join("config.json"))?;
    if cfg.get("hasDates").and_then(Value::as_bool).unwrap_or(false) {
        let conn = state.db.lock().unwrap();
        let mut stmt = conn.prepare("SELECT date FROM periods ORDER BY date")?;
        let dates = stmt
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        let arr: Vec<Value> = dates.iter()
            .map(|date| json!({ "date": date, "file": format!("曙光英雄_{date}.json") }))
            .collect();
        cfg["dates"] = json!(arr);
        if let Some(last) = dates.last() {
            cfg["defaultDate"] = json!(last);
        }
    }
    Ok(Json(cfg))
}

async fn periods(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT date, captured_at, hero_count, row_count, has_power FROM periods ORDER BY date",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(json!({
                "date": r.get::<_, String>(0)?,
                "capturedAt": r.get::<_, Option<String>>(1)?,
                "heroCount": r.get::<_, i64>(2)?,
                "rowCount": r.get::<_, i64>(3)?,
                "hasPower": r.get::<_, i64>(4)? != 0
            }))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Json(json!({ "periods": rows })))
}

async fn period(
    State(state): State<AppState>,
    Path(date): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (_, blacklist) = read_blacklist(&state)?;
    let conn = state.db.lock().unwrap();
    let blacklist_names = blacklist_names(&conn, &blacklist)?;
    match get_period_full(&conn, &date, &blacklist, &blacklist_names)? {
        Some(value) => Ok(Json(value)),
        None => Err(ApiError::not_found(format!("不存在该期: {date}"))),
    }
}

async fn history(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let (_, blacklist) = read_blacklist(&state)?;
    let conn = state.db.lock().unwrap();
    let blacklist_names = blacklist_names(&conn, &blacklist)?;

    let hero_id: Option<i64> = conn
        .query_row("SELECT id FROM heroes WHERE name = ?1", [&name], |r| r.get(0))
        .optional()?;
    let hero_id = if hero_id.is_some() {
        hero_id
    } else {
        conn.query_row(
            "SELECT hero_id FROM hero_aliases WHERE alias = ?1",
            [&name],
            |r| r.get(0),
        )
        .optional()?
    };
    let Some(hero_id) = hero_id else {
        return Err(ApiError::not_found(format!("没有该英雄: {name}")));
    };

    let mut stmt = conn.prepare(
        "SELECT p.id, p.date, p.captured_at, hs.appearance_rank, hs.win_rate
         FROM periods p JOIN hero_stats hs ON hs.period_id = p.id
         WHERE hs.hero_id = ?1 ORDER BY p.date",
    )?;
    let rows = stmt
        .query_map([hero_id], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<i64>>(3)?,
                r.get::<_, Option<f64>>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    let mut out = Vec::new();
    for (period_id, date, captured_at, appearance_rank, win_rate) in rows {
        let mut power_stmt = conn.prepare(
            "SELECT rp.power, rp.uid, rp.player FROM rank_power rp
             WHERE rp.period_id = ?1 AND rp.hero_id = ?2 ORDER BY rp.\"rank\"",
        )?;
        let power_rows = power_stmt
            .query_map([period_id, hero_id], |r| {
                Ok((
                    r.get::<_, i64>(0)?,
                    r.get::<_, Option<String>>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        let power: Vec<i64> = power_rows
            .into_iter()
            .filter(|(_, uid, player)| {
                let uid = uid.as_deref().unwrap_or("").trim();
                if !uid.is_empty() {
                    return !blacklist.contains(uid);
                }
                player
                    .as_deref()
                    .map(|name| !blacklist_names.contains(name))
                    .unwrap_or(true)
            })
            .map(|(p, _, _)| p)
            .collect();
        let d = derived(&power);
        out.push(json!({
            "date": date,
            "capturedAt": captured_at,
            "appearanceRank": appearance_rank,
            "winRate": win_rate,
            "rankCount": d.rank_count,
            "powerTop1": d.top1,
            "powerTop9": d.top9,
            "powerTop50": d.top50,
            "powerTop100": d.top100,
            "powerMedian": d.median,
            "legacyGuo9": d.top9.or(d.top1)
        }));
    }
    Ok(Json(json!({ "name": name, "periods": out })))
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct AuditItem {
    uid: String,
    found: bool,
    all_count: i64,
    names: Vec<String>,
    latest: Vec<Value>,
    latest_names: Vec<String>,
}

fn audit_blacklist(
    conn: &Connection,
    uids: &[String],
) -> Result<Value, ApiError> {
    let latest: Option<String> = conn
        .query_row("SELECT date FROM periods ORDER BY date DESC LIMIT 1", [], |r| r.get(0))
        .optional()?;
    let mut appearances: HashMap<String, AuditItem> = HashMap::new();
    for uid in uids {
        appearances.insert(uid.clone(), AuditItem { uid: uid.clone(), ..Default::default() });
    }

    if !uids.is_empty() {
        let placeholders = std::iter::repeat("?").take(uids.len()).collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT rp.uid, p.date, h.name, rp.\"rank\", rp.power, rp.player
             FROM rank_power rp
             JOIN periods p ON p.id = rp.period_id
             JOIN heroes h ON h.id = rp.hero_id
             WHERE rp.uid IN ({placeholders})
             ORDER BY p.date DESC, rp.\"rank\""
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params_from_iter(uids.iter()), |r| {
                Ok((
                    r.get::<_, Option<String>>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, Option<String>>(5)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?;

        for (uid, date, hero, rank, power, player) in rows {
            let Some(uid) = uid else { continue };
            let Some(item) = appearances.get_mut(&uid) else { continue };
            item.found = true;
            item.all_count += 1;
            if let Some(player) = &player {
                if !item.names.contains(player) {
                    item.names.push(player.clone());
                }
            }
            if latest.as_deref() == Some(date.as_str()) {
                if let Some(player) = &player {
                    if !item.latest_names.contains(player) {
                        item.latest_names.push(player.clone());
                    }
                }
                item.latest.push(json!({
                    "hero": hero,
                    "rank": rank,
                    "power": power,
                    "player": player
                }));
            }
        }
    }

    let missing: Vec<String> = uids
        .iter()
        .filter(|uid| appearances.get(*uid).map(|a| !a.found).unwrap_or(true))
        .cloned()
        .collect();
    let no_latest: Vec<String> = uids
        .iter()
        .filter(|uid| appearances.get(*uid).map(|a| a.latest.is_empty()).unwrap_or(true))
        .cloned()
        .collect();

    Ok(json!({
        "latestDate": latest,
        "appearances": appearances,
        "missingUids": missing,
        "noLatestUids": no_latest
    }))
}

fn blacklist_response(state: &AppState) -> Result<Value, ApiError> {
    let (entries, _) = read_blacklist(state)?;
    let uids: Vec<String> = entries.iter().map(|entry| entry.uid.clone()).collect();
    let reasons: HashMap<String, String> = entries
        .iter()
        .map(|entry| (entry.uid.clone(), entry.reason.clone()))
        .collect();
    let updated_at = if state.blacklist.exists() {
        read_json(&state.blacklist)?
            .get("updatedAt")
            .cloned()
            .unwrap_or(Value::Null)
    } else {
        Value::Null
    };
    let conn = state.db.lock().unwrap();
    let audit = audit_blacklist(&conn, &uids)?;
    Ok(json!({
        "file": "data/blacklist.json",
        "count": entries.len(),
        "uids": uids,
        "entries": entries,
        "reasons": reasons,
        "updatedAt": updated_at,
        "latestDate": audit["latestDate"],
        "appearances": audit["appearances"],
        "missingUids": audit["missingUids"],
        "noLatestUids": audit["noLatestUids"]
    }))
}

async fn profiles(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let intro = read_intro(&state)?;
    let items: Vec<Value> = intro.iter().map(profile_json).collect();
    Ok(Json(json!({ "profiles": items })))
}

fn intro_field_map(intro: &[Value], field: &str) -> Value {
    let mut map = serde_json::Map::new();
    for item in intro {
        let Some(name) = item.get("name").and_then(Value::as_str) else { continue };
        let values = item.get(field).and_then(Value::as_array).cloned().unwrap_or_default();
        map.insert(name.to_string(), Value::Array(values));
    }
    Value::Object(map)
}

async fn legacy_heroes(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let intro = read_intro(&state)?;
    let heroes: Vec<String> = intro
        .iter()
        .filter_map(|item| item.get("name").and_then(Value::as_str).map(str::to_string))
        .collect();
    Ok(Json(json!({ "heroes": heroes })))
}

async fn legacy_lanes(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let intro = read_intro(&state)?;
    Ok(Json(json!({ "lanes": intro_field_map(&intro, "常用分路") })))
}

async fn legacy_players(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let intro = read_intro(&state)?;
    Ok(Json(json!({ "players": intro_field_map(&intro, "擅长选手") })))
}

async fn legacy_data(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    if !state.prepare_data.exists() {
        return Ok(Json(json!({})));
    }
    Ok(Json(read_json(&state.prepare_data)?))
}

async fn save_legacy_data(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if !payload.is_object() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "备战数据必须是对象"));
    }
    let text = serde_json::to_string_pretty(&payload)? + "\n";
    let tmp = state.prepare_data.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::remove_file(&state.prepare_data).ok();
    fs::rename(&tmp, &state.prepare_data)?;
    Ok(Json(json!({ "ok": true })))
}

async fn profile(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let intro = read_intro(&state)?;
    let entry = intro.iter().find(|item| {
        item.get("name").and_then(Value::as_str) == Some(name.as_str())
    });
    match entry {
        Some(entry) => Ok(Json(profile_json(entry))),
        None => Ok(Json(json!({ "name": name, "lanes": [], "players": [] }))),
    }
}

async fn put_profile(
    State(state): State<AppState>,
    Path(name): Path<String>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let lanes = string_list(payload.get("lanes"));
    let players = string_list(payload.get("players"));
    let mut intro = read_intro(&state)?;
    if let Some(entry) = intro.iter_mut().find(|item| {
        item.get("name").and_then(Value::as_str) == Some(name.as_str())
    }) {
        entry["常用分路"] = json!(lanes);
        entry["擅长选手"] = json!(players);
    } else {
        intro.push(json!({
            "name": name,
            "常用分路": lanes,
            "擅长选手": players
        }));
    }

    let text = serde_json::to_string_pretty(&intro)? + "\n";
    let path = state.intro.clone();
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::remove_file(&path).ok();
    fs::rename(&tmp, &path)?;

    let updated = intro
        .iter()
        .find(|item| item.get("name").and_then(Value::as_str) == Some(name.as_str()))
        .cloned()
        .unwrap_or_else(|| json!({ "name": name }));
    Ok(Json(profile_json(&updated)))
}

async fn get_blacklist(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    Ok(Json(blacklist_response(&state)?))
}

async fn lookup_players(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let values: Vec<String> = payload
        .get("uids")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
        .unwrap_or_default();
    let uids = normalize_uids(values);
    let conn = state.db.lock().unwrap();
    Ok(Json(audit_blacklist(&conn, &uids)?))
}

#[derive(Deserialize)]
struct PowerRankingQuery {
    date: Option<String>,
    hero: Option<String>,
}

#[derive(Deserialize)]
struct PlayerDetailQuery {
    date: Option<String>,
    uid: Option<String>,
    hero: Option<String>,
}

fn player_flags_path(state: &AppState) -> PathBuf {
    state.data_dir.join("player-flags.json")
}

fn read_player_flags(state: &AppState) -> Result<HashMap<String, Value>, ApiError> {
    let path = player_flags_path(state);
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let raw = read_json(&path)?;
    let mut out = HashMap::new();
    if let Some(players) = raw.get("players").and_then(Value::as_object) {
        for (key, value) in players {
            out.insert(key.clone(), value.clone());
        }
    }
    Ok(out)
}

async fn set_player_flags(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let key = payload
        .get("key")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if key.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "缺少 key"));
    }
    let path = player_flags_path(&state);
    let mut doc = if path.exists() {
        read_json(&path)?
    } else {
        json!({ "schema": 1, "players": {} })
    };
    if !doc.get("players").map(Value::is_object).unwrap_or(false) {
        doc["players"] = json!({});
    }
    {
        let entry = doc["players"]
            .as_object_mut()
            .unwrap()
            .entry(key.clone())
            .or_insert_with(|| json!({}));
        for field in ["publicRecord", "soloPlayed", "partyPlayed"] {
            if let Some(value) = payload.get(field) {
                entry[field] = value.clone();
            }
        }
    }
    doc["updatedAt"] = json!(Utc::now().to_rfc3339());
    let flags = doc["players"]
        .get(&key)
        .cloned()
        .unwrap_or_else(|| json!({}));
    let text = serde_json::to_string_pretty(&doc)? + "\n";
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::remove_file(&path).ok();
    fs::rename(&tmp, &path)?;
    Ok(Json(json!({ "ok": true, "key": key, "flags": flags })))
}

async fn power_ranking(
    State(state): State<AppState>,
    Query(query): Query<PowerRankingQuery>,
) -> Result<Json<Value>, ApiError> {    let hero = query.hero.unwrap_or_default().trim().to_string();
    if hero.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "缺少 hero 参数"));
    }
    let conn = state.db.lock().unwrap();
    let date = query
        .date
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            conn.query_row("SELECT date FROM periods ORDER BY date DESC LIMIT 1", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
        })
        .ok_or_else(|| ApiError::not_found("没有可用期数"))?;

    let period_id: i64 = conn
        .query_row("SELECT id FROM periods WHERE date = ?1", [&date], |r| r.get(0))
        .optional()?
        .ok_or_else(|| ApiError::not_found(format!("不存在该期: {date}")))?;

    let (black_entries, blacklist) = read_blacklist(&state)?;
    let black_names = blacklist_names(&conn, &blacklist)?;
    let mut reasons: HashMap<String, String> = black_entries
        .iter()
        .map(|entry| (entry.uid.clone(), entry.reason.clone()))
        .collect();
    let mut name_reasons: HashMap<String, String> = HashMap::new();
    if !blacklist.is_empty() {
        let ids: Vec<&String> = blacklist.iter().collect();
        let placeholders = std::iter::repeat("?").take(ids.len()).collect::<Vec<_>>().join(",");
        let mut stmt = conn.prepare(&format!(
            "SELECT DISTINCT rp.uid, rp.player FROM rank_power rp WHERE rp.uid IN ({placeholders}) AND rp.player IS NOT NULL"
        ))?;
        let rows = stmt.query_map(params_from_iter(ids.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?;
        for row in rows {
            let (uid, player) = row?;
            if let Some(reason) = reasons.get(&uid) {
                name_reasons.entry(player).or_insert_with(|| reason.clone());
            }
        }
    }

    let mut top_stmt = conn.prepare(
        "SELECT h.name, rp.\"rank\", rp.power, rp.uid, rp.player
         FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
         WHERE rp.period_id = ?1 AND rp.\"rank\" <= 10
         ORDER BY h.name, rp.\"rank\"",
    )?;
    let top_rows = top_stmt
        .query_map([period_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut top_by_player: HashMap<String, Vec<Value>> = HashMap::new();
    for (hero_name, rank, power, uid, player) in top_rows {
        let uid = uid.unwrap_or_default();
        let player = player.unwrap_or_default();
        let key = if !uid.trim().is_empty() {
            format!("uid:{uid}")
        } else {
            format!("name:{player}")
        };
        top_by_player.entry(key).or_default().push(json!({
            "hero": hero_name,
            "rank": rank,
            "power": power
        }));
    }
    let player_flags = read_player_flags(&state)?;

    let mut stmt = conn.prepare(
        "SELECT rp.\"rank\", rp.player, rp.uid, rp.power
         FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
         WHERE rp.period_id = ?1 AND h.name = ?2
         ORDER BY rp.\"rank\"",
    )?;
    let rank_rows = stmt
        .query_map(params![period_id, hero.as_str()], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, i64>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut rows = Vec::with_capacity(rank_rows.len());
    for (rank, player, uid, power) in rank_rows {
        let player = player.unwrap_or_default();
        let uid = uid.unwrap_or_default();
        let key = if !uid.trim().is_empty() {
            format!("uid:{uid}")
        } else {
            format!("name:{player}")
        };
        let blacklisted = if !uid.trim().is_empty() {
            blacklist.contains(&uid)
        } else {
            black_names.contains(&player)
        };
        let reason = if !uid.trim().is_empty() {
            reasons.remove(&uid).unwrap_or_default()
        } else {
            name_reasons.get(&player).cloned().unwrap_or_default()
        };
        let flags = player_flags.get(&key).cloned().unwrap_or(Value::Null);
        rows.push(json!({
            "rank": rank,
            "player": player,
            "playerKey": key,
            "uid": uid,
            "power": power,
            "blacklisted": blacklisted,
            "reason": reason,
            "publicRecord": flags.get("publicRecord").cloned().unwrap_or(Value::Null),
            "soloPlayed": flags.get("soloPlayed").cloned().unwrap_or(Value::Null),
            "partyPlayed": flags.get("partyPlayed").cloned().unwrap_or(Value::Null),
            "topHeroes": top_by_player.get(&key).cloned().unwrap_or_default()
        }));
    }

    Ok(Json(json!({
        "date": date,
        "hero": hero,
        "count": rows.len(),
        "blacklistCount": blacklist.len(),
        "rows": rows
    })))
}

fn json_i64(value: &Value) -> Option<i64> {
    value
        .as_i64()
        .or_else(|| value.as_str().and_then(|raw| raw.trim().parse::<i64>().ok()))
}

fn json_rate(value: &Value) -> Option<f64> {
    let raw = value
        .as_f64()
        .or_else(|| value.as_str().and_then(|text| text.trim().trim_end_matches('%').parse::<f64>().ok()))?;
    if value.as_str().map(|text| text.contains('%')).unwrap_or(false) || raw > 1.0 {
        Some(raw / 100.0)
    } else {
        Some(raw)
    }
}

fn ensure_hero(tx: &Transaction<'_>, name: &str) -> Result<i64, ApiError> {
    let name = name.trim();
    if name.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "英雄名为空"));
    }
    if let Some(id) = tx
        .query_row("SELECT id FROM heroes WHERE name = ?1", [name], |r| r.get::<_, i64>(0))
        .optional()?
    {
        return Ok(id);
    }
    if let Some(id) = tx
        .query_row(
            "SELECT h.id FROM heroes h JOIN hero_aliases a ON a.hero_id = h.id WHERE a.alias = ?1",
            [name],
            |r| r.get::<_, i64>(0),
        )
        .optional()?
    {
        return Ok(id);
    }
    tx.execute(
        "INSERT INTO heroes(name, active, created_at) VALUES(?1, 1, ?2)",
        params![name, Utc::now().to_rfc3339()],
    )?;
    Ok(tx.last_insert_rowid())
}

async fn import_period(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let date = payload
        .get("date")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_string();
    if chrono::NaiveDate::parse_from_str(&date, "%Y-%m-%d").is_err() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "date 必须是 YYYY-MM-DD"));
    }
    let heroes = payload
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(|| ApiError::new(StatusCode::BAD_REQUEST, "缺少 data 数组"))?;
    if heroes.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "data 为空"));
    }

    let mut conn = state.db.lock().unwrap();
    let tx = conn.transaction()?;
    let now = Utc::now().to_rfc3339();
    let existing: Option<i64> = tx
        .query_row("SELECT id FROM periods WHERE date = ?1", [&date], |r| r.get(0))
        .optional()?;
    let period_id = if let Some(id) = existing {
        tx.execute("DELETE FROM rank_power WHERE period_id = ?1", [id])?;
        tx.execute("DELETE FROM hero_stats WHERE period_id = ?1", [id])?;
        tx.execute(
            "UPDATE periods SET captured_at = ?1, source = ?2, updated_at = ?3 WHERE id = ?4",
            params![now, json!({"type": "import"}).to_string(), now, id],
        )?;
        id
    } else {
        tx.execute(
            "INSERT INTO periods(date, captured_at, source, source_hash, created_at, updated_at) VALUES(?1,?2,?3,'',?4,?4)",
            params![date, now, json!({"type": "import"}).to_string(), now],
        )?;
        tx.last_insert_rowid()
    };

    let mut row_count = 0i64;
    let mut has_power = 0i64;
    for item in heroes {
        let name = item
            .get("heroName")
            .or_else(|| item.get("name"))
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if name.is_empty() {
            return Err(ApiError::new(StatusCode::BAD_REQUEST, "存在没有英雄名的记录"));
        }
        let hero_id = ensure_hero(&tx, name)?;
        let power: Vec<i64> = item
            .get("power")
            .and_then(Value::as_array)
            .map(|values| values.iter().filter_map(json_i64).collect())
            .unwrap_or_default();
        let d = derived(&power);
        let appearance_rank = item.get("appearanceRank").and_then(json_i64);
        let win_rate = item.get("winRate").and_then(json_rate);
        let legacy = item
            .get("legacyGuo9")
            .or_else(|| item.get("国9战力"))
            .and_then(json_i64);
        tx.execute(
            "INSERT INTO hero_stats(period_id,hero_id,appearance_rank,win_rate,rank_count,power_top1,power_top9,power_top50,power_top100,power_median,legacy_guo9)
             VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
            params![
                period_id, hero_id, appearance_rank, win_rate, d.rank_count,
                d.top1, d.top9, d.top50, d.top100, d.median, legacy.or(d.top9).or(d.top1)
            ],
        )?;

        let players = item.get("players").and_then(Value::as_array);
        let mut by_rank: HashMap<i64, (Option<String>, Option<String>)> = HashMap::new();
        if let Some(players) = players {
            for player in players {
                let Some(rank) = player.get("rank").and_then(json_i64) else { continue };
                let name = player.get("player").and_then(Value::as_str).map(str::to_string);
                let uid = player.get("uid").and_then(Value::as_str).map(str::to_string);
                by_rank.insert(rank, (name, uid));
            }
        }
        for (index, power) in power.iter().enumerate() {
            let rank = (index + 1) as i64;
            let (player, uid) = by_rank.get(&rank).cloned().unwrap_or((None, None));
            tx.execute(
                "INSERT INTO rank_power(period_id,hero_id,\"rank\",power,player,uid) VALUES(?1,?2,?3,?4,?5,?6)",
                params![period_id, hero_id, rank, power, player, uid],
            )?;
        }
        row_count += power.len() as i64;
        if !power.is_empty() {
            has_power = 1;
        }
    }

    tx.execute(
        "UPDATE periods SET hero_count = ?1, row_count = ?2, has_power = ?3, updated_at = ?4 WHERE id = ?5",
        params![heroes.len() as i64, row_count, has_power, now, period_id],
    )?;
    tx.commit()?;
    Ok(Json(json!({
        "ok": true,
        "date": date,
        "heroCount": heroes.len(),
        "rowCount": row_count
    })))
}

async fn player_detail(
    State(state): State<AppState>,
    Query(query): Query<PlayerDetailQuery>,
) -> Result<Json<Value>, ApiError> {
    let uid = query.uid.unwrap_or_default().trim().to_string();
    if uid.is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "缺少 uid"));
    }
    let conn = state.db.lock().unwrap();
    let date = query
        .date
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            conn.query_row("SELECT date FROM periods ORDER BY date DESC LIMIT 1", [], |r| {
                r.get::<_, String>(0)
            })
            .optional()
            .ok()
            .flatten()
        })
        .ok_or_else(|| ApiError::not_found("没有可用期数"))?;
    let period_id: i64 = conn
        .query_row("SELECT id FROM periods WHERE date = ?1", [&date], |r| r.get(0))
        .optional()?
        .ok_or_else(|| ApiError::not_found(format!("不存在该期: {date}")))?;

    let mut stmt = conn.prepare(
        "SELECT h.name, rp.\"rank\", rp.power, rp.player
         FROM rank_power rp JOIN heroes h ON h.id = rp.hero_id
         WHERE rp.period_id = ?1 AND rp.uid = ?2
         ORDER BY rp.\"rank\"",
    )?;
    let rows = stmt
        .query_map(params![period_id, uid.as_str()], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, Option<String>>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    if rows.is_empty() {
        return Err(ApiError::not_found("该玩家在当前期没有记录"));
    }

    let player = rows
        .iter()
        .find_map(|(_, _, _, player)| player.clone())
        .unwrap_or_default();
    let top_heroes: Vec<Value> = rows
        .iter()
        .filter(|(_, rank, _, _)| *rank <= 10)
        .map(|(hero, rank, power, _)| json!({
            "hero": hero,
            "rank": rank,
            "power": power
        }))
        .collect();
    let current_hero = query.hero.unwrap_or_default();
    let current = rows
        .iter()
        .find(|(hero, _, _, _)| hero == &current_hero)
        .map(|(hero, rank, power, _)| json!({
            "hero": hero,
            "rank": rank,
            "power": power
        }));

    let (entries, blacklist) = read_blacklist(&state)?;
    let reason = entries
        .iter()
        .find(|entry| entry.uid == uid)
        .map(|entry| entry.reason.clone())
        .unwrap_or_default();
    let flags = read_player_flags(&state)?
        .get(&format!("uid:{uid}"))
        .cloned()
        .unwrap_or(Value::Null);

    Ok(Json(json!({
        "date": date,
        "player": player,
        "uid": uid,
        "playerKey": format!("uid:{uid}"),
        "blacklisted": blacklist.contains(&uid),
        "reason": reason,
        "publicRecord": flags.get("publicRecord").cloned().unwrap_or(Value::Null),
        "soloPlayed": flags.get("soloPlayed").cloned().unwrap_or(Value::Null),
        "partyPlayed": flags.get("partyPlayed").cloned().unwrap_or(Value::Null),
        "topHeroes": top_heroes,
        "current": current
    })))
}

async fn legacy_editor(State(state): State<AppState>) -> Redirect {
    Redirect::temporary(&format!("{}/editor.html", state.legacy_base))
}

async fn legacy_prep(State(state): State<AppState>) -> Redirect {
    Redirect::temporary(&format!("{}/备战.html", state.legacy_base))
}

async fn post_blacklist(
    State(state): State<AppState>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let existing: HashMap<String, String> = read_blacklist(&state)?
        .0
        .into_iter()
        .map(|entry| (entry.uid, entry.reason))
        .collect();

    let mut entries: Vec<BlacklistEntry> = if let Some(items) = payload.get("entries").and_then(Value::as_array) {
        items.iter().filter_map(entry_from_value).collect()
    } else {
        let values: Vec<String> = if let Some(arr) = payload.as_array() {
            arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()
        } else {
            payload.get("uids")
                .and_then(Value::as_array)
                .map(|arr| arr.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
                .unwrap_or_default()
        };
        let reasons = payload.get("reasons").and_then(Value::as_object);
        values
            .into_iter()
            .map(|raw| {
                let uid = normalize_uid(&raw);
                let reason = reasons
                    .and_then(|map| map.get(&uid))
                    .and_then(Value::as_str)
                    .or_else(|| existing.get(&uid).map(String::as_str))
                    .unwrap_or("")
                    .trim()
                    .to_string();
                BlacklistEntry { uid, reason }
            })
            .collect()
    };
    entries = normalize_entries(entries);

    let uids: Vec<String> = entries.iter().map(|entry| entry.uid.clone()).collect();
    let doc = json!({
        "schema": 2,
        "updatedAt": Utc::now().to_rfc3339(),
        "uids": uids,
        "entries": entries
    });
    let text = serde_json::to_string_pretty(&doc)? + "\n";
    let tmp = state.blacklist.with_extension("json.tmp");
    fs::write(&tmp, text)?;
    fs::remove_file(&state.blacklist).ok();
    fs::rename(&tmp, &state.blacklist)?;

    let mut response = blacklist_response(&state)?;
    response["ok"] = json!(true);
    Ok(Json(response))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let root = env::var("SG_RESOURCE_DIR")
        .map(PathBuf::from)
        .unwrap_or(env::current_dir()?);
    let explicit_data_dir = env::var("SG_DATA_DIR").ok().map(PathBuf::from);
    let data_dir = explicit_data_dir
        .clone()
        .unwrap_or_else(|| root.join("data"));
    fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("tierlist.db");
    let blacklist_path = data_dir.join("blacklist.json");
    let intro = if explicit_data_dir.is_some() {
        let intro = data_dir.join("英雄介绍.json");
        if !intro.exists() {
            let source_intro = root.join("英雄介绍.json");
            if source_intro.exists() {
                fs::copy(source_intro, &intro)?;
            }
        }
        intro
    } else {
        root.join("英雄介绍.json")
    };
    let prepare_data = if explicit_data_dir.is_some() {
        let prepare_data = data_dir.join("data.json");
        if !prepare_data.exists() {
            let source_data = root.join("data.json");
            if source_data.exists() {
                fs::copy(source_data, &prepare_data)?;
            }
        }
        prepare_data
    } else {
        root.join("data.json")
    };
    let web_dist = root.join("apps/web/dist");

    let conn = Connection::open(&db_path)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    let state = AppState {
        db: Arc::new(Mutex::new(conn)),
        root: root.clone(),
        data_dir,
        intro,
        prepare_data,
        blacklist: blacklist_path,
        legacy_base: env::var("LEGACY_BASE").unwrap_or_else(|_| "http://127.0.0.1:3001".to_string()),
    };

    let app_service = ServeDir::new(&web_dist)
        .fallback(ServeFile::new(web_dist.join("index.html")));

    let app = Router::new()
        .route("/", get(|| async { Redirect::temporary("/app/") }))
        .route("/index.html", get(|| async { Redirect::temporary("/app/") }))
        .route("/blacklist.html", get(|| async { Redirect::temporary("/app/blacklist") }))
        .route("/editor.html", get(legacy_editor))
        .route("/api", get(api_index))
        .route("/api/config", get(config))
        .route("/api/periods", get(periods))
        .route("/api/periods/{date}", get(period))
        .route("/api/heroes/{name}/history", get(history))
        .route("/api/heroes/{name}/profile", get(profile).put(put_profile))
        .route("/api/profiles", get(profiles))
        .route("/api/heroes", get(legacy_heroes))
        .route("/api/lanes", get(legacy_lanes))
        .route("/api/players", get(legacy_players))
        .route("/api/data", get(legacy_data).post(save_legacy_data))
        .route("/api/players/lookup", post(lookup_players))
        .route("/api/power-ranking", get(power_ranking))
        .route("/api/player-detail", get(player_detail))
        .route("/api/player-flags", post(set_player_flags))
        .route("/api/import-period", post(import_period))
        .route("/api/blacklist", get(get_blacklist).post(post_blacklist))
        .nest_service("/app", app_service)
        .fallback_service(ServeDir::new(&root))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let port: u16 = env::var("PORT").ok().and_then(|v| v.parse().ok()).unwrap_or(3002);
    let listener = tokio::net::TcpListener::bind(("127.0.0.1", port)).await?;
    tracing::info!("Rust server listening on http://127.0.0.1:{port}");
    axum::serve(listener, app).await?;
    Ok(())
}
